"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, isUniqueError, jsonField, parseForm, uniqueSlug, zBool, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const KINDS = ["SPOTLIGHT", "NEWS", "ANNOUNCEMENT", "THINGS_TO_DO", "GENERAL"] as const;
const INTENTS = ["draft", "publish", "schedule", "unpublish", "submit", "update"] as const;

const schema = z.object({
  id: z.string().optional(),
  intent: z.enum(INTENTS).default("draft"),
  title: zReq("Title", 300),
  slug: zSlugOpt,
  excerpt: zOpt(1000),
  content: z.string().max(3_000_000).default(""),
  kind: z.enum(KINDS).default("GENERAL"),
  featuredImageUrl: zUrlOpt,
  featuredImageAlt: zOpt(300),
  ogImageUrl: zUrlOpt,
  authorName: zOpt(120),
  seoTitle: zOpt(200),
  seoDescription: zOpt(400),
  isFeatured: zBool,
  publishAt: z.string().optional(),
});

async function resolveCategories(fd: FormData) {
  const ids = getAll(fd, "categories");
  const names = jsonField<string[]>(fd, "newCategories", []).map((n) => n.trim()).filter(Boolean).slice(0, 20);
  for (const name of names) {
    const slug = slugify(name);
    const c = await db.category.upsert({ where: { slug }, create: { name: name.slice(0, 80), slug }, update: {} });
    ids.push(c.id);
  }
  return [...new Set(ids)];
}

async function resolveTags(fd: FormData) {
  const names = jsonField<string[]>(fd, "tags", []).map((n) => n.trim()).filter(Boolean).slice(0, 40);
  const ids: string[] = [];
  for (const name of names) {
    const slug = slugify(name);
    const t = await db.tag.upsert({ where: { slug }, create: { name: name.slice(0, 80), slug }, update: {} });
    ids.push(t.id);
  }
  return [...new Set(ids)];
}

const INTENT_NOTE: Record<(typeof INTENTS)[number], string> = {
  draft: "Saved draft", publish: "Published", schedule: "Scheduled", unpublish: "Unpublished", submit: "Submitted for review", update: "Updated",
};

export async function saveArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(schema, fd);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const now = new Date();
  const existing = d.id ? await db.article.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Article not found." };
  if (existing?.deletedAt) return { error: "This article is in the trash. Restore it before editing." };

  // Status transitions
  let status = existing?.status ?? "DRAFT";
  let publishedAt = existing?.publishedAt ?? null;
  const publishAt = fromDateInput(d.publishAt);
  switch (d.intent) {
    case "draft": status = existing?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT"; break;
    case "submit": status = "PENDING"; break;
    case "unpublish": status = "UNPUBLISHED"; break;
    case "publish":
      status = "PUBLISHED";
      publishedAt = publishAt && publishAt <= now ? publishAt : existing?.publishedAt && existing.publishedAt <= now && existing.status !== "SCHEDULED" ? existing.publishedAt : now;
      break;
    case "schedule":
      if (!publishAt) return { error: "Choose a date and time to schedule publishing.", fieldErrors: { publishAt: "Required" } };
      if (publishAt <= now) return { error: "The scheduled time must be in the future (America/New_York).", fieldErrors: { publishAt: "Must be in the future" } };
      status = "SCHEDULED";
      publishedAt = publishAt;
      break;
    case "update":
      if (status === "SCHEDULED" && publishAt) {
        if (publishAt <= now) return { error: "The scheduled time must be in the future." };
        publishedAt = publishAt;
      } else if (status === "PUBLISHED" && publishAt) {
        publishedAt = publishAt;
        // A future date on a live article turns it into a scheduled one.
        if (publishAt > now) status = "SCHEDULED";
      }
      break;
  }

  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.title), async (s) => !!(await db.article.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } })));
  else if (await db.article.findFirst({ where: { slug, NOT: { id: d.id ?? "" } }, select: { id: true } })) return { error: `The slug “${slug}” is already used by another article.`, fieldErrors: { slug: "Already in use" } };

  const categoryIds = await resolveCategories(fd);
  const tagIds = await resolveTags(fd);
  const businessIds = fd.get("businesses__present") ? getAll(fd, "businesses") : null;

  const data = {
    title: d.title, slug, excerpt: d.excerpt, content: d.content, kind: d.kind,
    featuredImageUrl: d.featuredImageUrl, featuredImageAlt: d.featuredImageAlt, ogImageUrl: d.ogImageUrl,
    authorName: d.authorName, seoTitle: d.seoTitle, seoDescription: d.seoDescription, isFeatured: d.isFeatured,
    status, publishedAt, localEditedAt: now,
  };

  let id = d.id;
  try {
    if (existing) {
      await db.article.update({
        where: { id: existing.id },
        data: { ...data, categories: { set: categoryIds.map((cid) => ({ id: cid })) }, tags: { set: tagIds.map((tid) => ({ id: tid })) } },
      });
    } else {
      const created = await db.article.create({
        data: { ...data, authorId: user.id, authorName: d.authorName ?? user.name, categories: { connect: categoryIds.map((cid) => ({ id: cid })) }, tags: { connect: tagIds.map((tid) => ({ id: tid })) } },
      });
      id = created.id;
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }

  if (businessIds) {
    await db.articleBusiness.deleteMany({ where: { articleId: id!, businessId: { notIn: businessIds } } });
    for (const businessId of businessIds) {
      await db.articleBusiness.upsert({ where: { articleId_businessId: { articleId: id!, businessId } }, create: { articleId: id!, businessId }, update: {} });
    }
  }

  await db.articleRevision.create({ data: { articleId: id!, title: d.title, excerpt: d.excerpt, content: d.content, note: INTENT_NOTE[d.intent], userId: user.id } });

  const action = !existing ? (d.intent === "publish" ? "article.publish" : "article.create") : d.intent === "draft" || d.intent === "update" ? "article.update" : `article.${d.intent}`;
  await audit(user.id, action, "Article", id, { title: d.title, status, publishedAt: publishedAt?.toISOString() ?? null });

  revalidatePath("/admin/articles");
  if (status === "PUBLISHED" || existing?.status === "PUBLISHED") revalidatePath("/", "layout");

  if (!existing) redirect(`/admin/articles/${id}/?created=1`);
  const msg =
    d.intent === "publish" ? "Article published." :
    d.intent === "schedule" ? "Article scheduled." :
    d.intent === "unpublish" ? "Article unpublished." :
    d.intent === "submit" ? "Submitted for review." : "Changes saved.";
  return { ok: true, message: msg };
}

/** Autosave for drafts: updates content and keeps one rolling "Autosave" revision. */
export async function autosaveArticle(id: string, input: { title: string; excerpt: string; content: string }): Promise<{ ok: boolean; savedAt?: string; error?: string }> {
  const user = await requireStaff();
  const a = await db.article.findUnique({ where: { id }, select: { status: true, deletedAt: true } });
  if (!a || a.deletedAt) return { ok: false, error: "Not found" };
  if (a.status !== "DRAFT") return { ok: false, error: "Autosave only applies to drafts" };
  const title = input.title.trim().slice(0, 300);
  if (!title) return { ok: false, error: "Title required" };
  const content = String(input.content ?? "").slice(0, 3_000_000);
  const excerpt = String(input.excerpt ?? "").trim().slice(0, 1000) || null;
  const now = new Date();
  await db.article.update({ where: { id }, data: { title, excerpt, content, localEditedAt: now } });
  const last = await db.articleRevision.findFirst({ where: { articleId: id }, orderBy: { createdAt: "desc" } });
  if (last && last.note === "Autosave" && last.userId === user.id && now.getTime() - last.createdAt.getTime() < 10 * 60_000) {
    await db.articleRevision.update({ where: { id: last.id }, data: { title, excerpt, content } });
  } else {
    await db.articleRevision.create({ data: { articleId: id, title, excerpt, content, note: "Autosave", userId: user.id } });
  }
  return { ok: true, savedAt: now.toISOString() };
}

const idSchema = z.object({ id: z.string().min(1) });

export async function trashArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const a = await db.article.update({ where: { id: p.data.id }, data: { deletedAt: new Date() } });
  await audit(user.id, "article.trash", "Article", a.id, { title: a.title });
  revalidatePath("/admin/articles");
  revalidatePath("/", "layout");
  if (fd.get("redirect")) redirect("/admin/articles/?tab=trash");
  return { ok: true, message: "Moved to trash." };
}

export async function restoreArticle(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const a = await db.article.update({ where: { id: p.data.id }, data: { deletedAt: null } });
  await audit(user.id, "article.restore", "Article", a.id, { title: a.title });
  revalidatePath("/admin/articles");
  revalidatePath("/", "layout");
  return { ok: true, message: "Article restored." };
}

export async function deleteArticleForever(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const a = await db.article.findUnique({ where: { id: p.data.id } });
  if (!a) return { error: "Article not found." };
  if (!a.deletedAt) return { error: "Move the article to the trash first." };
  await db.article.delete({ where: { id: a.id } });
  await audit(user.id, "article.delete", "Article", a.id, { title: a.title, slug: a.slug, wpId: a.wpId });
  revalidatePath("/admin/articles");
  return { ok: true, message: "Article permanently deleted." };
}

export async function restoreRevision(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ revisionId: z.string().min(1) }), fd);
  if (p.error) return p.error;
  const rev = await db.articleRevision.findUnique({ where: { id: p.data.revisionId } });
  if (!rev) return { error: "Revision not found." };
  const now = new Date();
  await db.article.update({ where: { id: rev.articleId }, data: { title: rev.title, excerpt: rev.excerpt, content: rev.content, localEditedAt: now } });
  await db.articleRevision.create({ data: { articleId: rev.articleId, title: rev.title, excerpt: rev.excerpt, content: rev.content, note: `Restored revision from ${rev.createdAt.toISOString()}`, userId: user.id } });
  await audit(user.id, "article.restore_revision", "Article", rev.articleId, { title: rev.title, revisionId: rev.id });
  revalidatePath(`/admin/articles/${rev.articleId}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Revision restored. Reloading editor…" };
}

/** Restores the untouched WordPress HTML (originalContent) into the article body. */
export async function restoreOriginalContent(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const a = await db.article.findUnique({ where: { id: p.data.id } });
  if (!a?.originalContent) return { error: "No original WordPress content stored for this article." };
  await db.article.update({ where: { id: a.id }, data: { content: a.originalContent, localEditedAt: new Date() } });
  await db.articleRevision.create({ data: { articleId: a.id, title: a.title, excerpt: a.excerpt, content: a.originalContent, note: "Restored original WordPress HTML", userId: user.id } });
  await audit(user.id, "article.restore_revision", "Article", a.id, { title: a.title, original: true });
  revalidatePath(`/admin/articles/${a.id}`);
  return { ok: true, message: "Original WordPress HTML restored." };
}

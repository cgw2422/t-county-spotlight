"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sanitizeRichText, sanitizePlain } from "@/lib/sanitize";
import { normalizePath } from "@/lib/links";
import { pulseHref } from "@/lib/pulse";
import { fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { isUniqueError, parseForm, uniqueSlug, zInt, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const INTENTS = ["save", "publish", "unpublish", "archive"] as const;
const SOURCE_TYPES = ["FACEBOOK", "COMMUNITY_SUBMISSION", "SURVEY", "EDITORIAL", "OTHER"] as const;
const DISPLAY_MODES = ["RANKED_LIST", "BARS", "EDITORIAL_LIST"] as const;
const SORT_MODES = ["MENTIONS_DESC", "MANUAL"] as const;

/** Absolute http(s) URL only (no javascript:, data:, relative paths). */
const zHttpUrlOpt = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
    } catch {
      return false;
    }
  }, "Enter a full web address starting with https://");

const zDateOpt = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || !!fromDateInput(v), "Enter a valid date");

const basicSchema = z.object({
  id: z.string().max(40).optional(),
  intent: z.enum(INTENTS).default("save"),
  title: zReq("Title", 300),
  slug: zSlugOpt,
  description: zOpt(600),
  intro: z.string().max(200_000).default(""),
  featuredImageUrl: zUrlOpt,
  featuredImageAlt: zOpt(300),
  categoryId: zOpt(40),
  sourceType: z.enum(SOURCE_TYPES).default("FACEBOOK"),
  sourceUrl: zHttpUrlOpt,
  sourceLabel: zOpt(160),
  methodology: zOpt(2000),
  discussionDate: zDateOpt,
  publishedAt: zDateOpt,
  displayMode: z.enum(DISPLAY_MODES).default("RANKED_LIST"),
  sortMode: z.enum(SORT_MODES).default("MENTIONS_DESC"),
  homepageLimit: zInt(3, 1, 10),
  seoTitle: zOpt(200),
  seoDescription: zOpt(400),
  ogImageUrl: zUrlOpt,
});

function revalidatePublic() {
  revalidatePath("/admin/community-pulse");
  revalidatePath("/", "layout");
}

/** Creates a redirect from a published entry's old URL to its new one (and re-points older redirects). */
async function redirectOldSlug(oldSlug: string, newSlug: string) {
  const from = normalizePath(pulseHref({ slug: oldSlug }));
  const to = pulseHref({ slug: newSlug });
  // A redirect away from the new URL would loop — remove it.
  await db.redirect.deleteMany({ where: { fromPath: normalizePath(to) } });
  await db.redirect.updateMany({ where: { toPath: pulseHref({ slug: oldSlug }) }, data: { toPath: to } });
  await db.redirect.upsert({ where: { fromPath: from }, create: { fromPath: from, toPath: to, statusCode: 301, source: "manual" }, update: { toPath: to, statusCode: 301 } });
}

export async function savePulse(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = parseForm(basicSchema, fd);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const now = new Date();
  const existing = d.id ? await db.communityPulse.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Entry not found." };
  if (existing?.deletedAt) return { error: "This entry was deleted. Restore it before editing." };

  if (d.categoryId && !(await db.pulseCategory.findUnique({ where: { id: d.categoryId }, select: { id: true } }))) {
    return { error: "That category no longer exists.", fieldErrors: { categoryId: "Choose a category" } };
  }

  // Slug: auto from title, unique.
  let slug = d.slug;
  const taken = async (s: string) => !!(await db.communityPulse.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } }));
  if (!slug) slug = await uniqueSlug(slugify(d.title), taken);
  else if (await taken(slug)) return { error: `The slug “${slug}” is already used by another entry.`, fieldErrors: { slug: "Already in use" } };

  // Status transitions
  let status = existing?.status ?? "DRAFT";
  let publishedAt = fromDateInput(d.publishedAt) ?? existing?.publishedAt ?? null;
  let isFeatured = existing?.isFeatured ?? false;
  let firstPublishedAt = existing?.firstPublishedAt ?? null;
  switch (d.intent) {
    case "publish":
      status = "PUBLISHED";
      if (!publishedAt) publishedAt = now;
      if (!firstPublishedAt) firstPublishedAt = now; // set once, never overwritten
      break;
    case "unpublish":
      status = "DRAFT";
      isFeatured = false;
      break;
    case "archive":
      status = "ARCHIVED";
      isFeatured = false;
      break;
  }

  const data = {
    title: sanitizePlain(d.title, 300) || d.title,
    slug,
    description: d.description ? sanitizePlain(d.description, 600) : null,
    intro: sanitizeRichText(d.intro).trim() || null,
    featuredImageUrl: d.featuredImageUrl,
    featuredImageAlt: d.featuredImageAlt,
    categoryId: d.categoryId,
    sourceType: d.sourceType,
    sourceUrl: d.sourceUrl,
    sourceLabel: d.sourceLabel ? sanitizePlain(d.sourceLabel, 160) : null,
    methodology: d.methodology ? sanitizePlain(d.methodology, 2000) : null,
    discussionDate: fromDateInput(d.discussionDate),
    publishedAt,
    status,
    isFeatured,
    firstPublishedAt,
    displayMode: d.displayMode,
    sortMode: d.sortMode,
    homepageLimit: d.homepageLimit,
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
    ogImageUrl: d.ogImageUrl,
  };

  let id = d.id;
  try {
    if (existing) {
      await db.communityPulse.update({ where: { id: existing.id }, data });
      if (existing.slug !== slug && existing.firstPublishedAt) await redirectOldSlug(existing.slug, slug);
    } else {
      const created = await db.communityPulse.create({ data: { ...data, createdById: user.id } });
      id = created.id;
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use.", fieldErrors: { slug: "Already in use" } };
    throw e;
  }

  const action = !existing ? (d.intent === "publish" ? "pulse.publish" : "pulse.create") : d.intent === "save" ? "pulse.update" : `pulse.${d.intent}`;
  await audit(user.id, action, "CommunityPulse", id, { title: data.title, status, slug, ...(existing && existing.slug !== slug ? { previousSlug: existing.slug } : {}) });
  revalidatePublic();

  if (!existing) redirect(`/admin/community-pulse/${id}/?created=1`);
  return {
    ok: true,
    message: d.intent === "publish" ? "Published." : d.intent === "unpublish" ? "Unpublished — moved back to draft." : d.intent === "archive" ? "Archived." : "Changes saved.",
  };
}

// ---------------------------------------------------------------- results

const resultSchema = z.object({
  id: z.string().max(40).optional().nullable(),
  name: z.string().trim().min(1, "Every result needs a name").max(200, "Result names must be 200 characters or fewer"),
  mentions: z.union([z.number(), z.string(), z.null()]).optional().transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) {
      ctx.addIssue({ code: "custom", message: "Mentions must be a whole number from 0 to 1,000,000" });
      return z.NEVER;
    }
    return n;
  }),
  description: z.string().trim().max(1000, "Descriptions must be 1,000 characters or fewer").optional().nullable().transform((v) => (v ? sanitizePlain(v, 1000) : null)),
  imageUrl: zUrlOpt.nullable().transform((v) => v ?? null),
  websiteUrl: zHttpUrlOpt.nullable().transform((v) => v ?? null),
  businessId: z.string().max(40).optional().nullable().transform((v) => v || null),
  organizationId: z.string().max(40).optional().nullable().transform((v) => v || null),
});

const resultsSchema = z.object({
  id: z.string().min(1).max(40),
  resultsUpdatedAt: zDateOpt,
  results: z.array(resultSchema).max(500, "Up to 500 results per entry"),
});

export async function savePulseResults(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  let rows: unknown;
  try {
    rows = JSON.parse(String(fd.get("results") ?? "[]"));
  } catch {
    return { error: "Could not read the results. Reload and try again." };
  }
  const p = resultsSchema.safeParse({ id: fd.get("id"), resultsUpdatedAt: fd.get("resultsUpdatedAt") ?? undefined, results: rows });
  if (!p.success) {
    const issue = p.error.issues[0];
    const row = issue?.path[0] === "results" && typeof issue.path[1] === "number" ? `Row ${issue.path[1] + 1}: ` : "";
    return { error: `${row}${issue?.message ?? "Please check the results."}` };
  }
  const { id, results } = p.data;
  const pulse = await db.communityPulse.findUnique({ where: { id }, select: { id: true, title: true, displayMode: true, deletedAt: true, resultsUpdatedAt: true, results: { select: { id: true } } } });
  if (!pulse || pulse.deletedAt) return { error: "Entry not found." };

  if (pulse.displayMode !== "EDITORIAL_LIST") {
    const i = results.findIndex((r) => r.mentions === null);
    if (i >= 0) return { error: `Row ${i + 1}: enter the number of mentions (only Editorial list mode allows results without counts).` };
  }
  for (const [i, r] of results.entries()) {
    if (r.businessId && r.organizationId) return { error: `Row ${i + 1}: link a business or an organization, not both.` };
  }

  // Re-check linked directory records server-side (existing listings only; never created here).
  const bizIds = [...new Set(results.map((r) => r.businessId).filter((v): v is string => !!v))];
  const orgIds = [...new Set(results.map((r) => r.organizationId).filter((v): v is string => !!v))];
  const [biz, orgs] = await Promise.all([
    bizIds.length ? db.business.findMany({ where: { id: { in: bizIds }, deletedAt: null }, select: { id: true } }) : [],
    orgIds.length ? db.organization.findMany({ where: { id: { in: orgIds }, deletedAt: null }, select: { id: true } }) : [],
  ]);
  if (biz.length !== bizIds.length) return { error: "One of the linked businesses no longer exists. Remove the link and save again." };
  if (orgs.length !== orgIds.length) return { error: "One of the linked organizations no longer exists. Remove the link and save again." };

  const ownIds = new Set(pulse.results.map((r) => r.id));
  const keepIds = results.map((r) => r.id).filter((v): v is string => !!v && ownIds.has(v));
  const now = new Date();
  const resultsUpdatedAt = fromDateInput(p.data.resultsUpdatedAt) ?? pulse.resultsUpdatedAt ?? now;

  await db.$transaction([
    db.pulseResult.deleteMany({ where: { pulseId: id, id: { notIn: keepIds } } }),
    ...results.map((r, i) => {
      const data = {
        name: sanitizePlain(r.name, 200) || r.name, mentions: r.mentions, description: r.description, imageUrl: r.imageUrl, websiteUrl: r.websiteUrl,
        businessId: r.businessId, organizationId: r.organizationId, sortOrder: i,
      };
      return r.id && ownIds.has(r.id)
        ? db.pulseResult.update({ where: { id: r.id }, data })
        : db.pulseResult.create({ data: { ...data, pulseId: id } });
    }),
    db.communityPulse.update({ where: { id }, data: { resultsChangedAt: now, resultsUpdatedAt } }),
  ]);

  await audit(user.id, "pulse.results_update", "CommunityPulse", id, { title: pulse.title, results: results.length });
  revalidatePublic();
  revalidatePath(`/admin/community-pulse/${id}`);
  return { ok: true, message: `Results saved (${results.length}).` };
}

// ---------------------------------------------------------------- list actions

const idSchema = z.object({ id: z.string().min(1).max(40) });

export async function setPulseStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(idSchema.extend({ intent: z.enum(["publish", "unpublish", "archive"]) }), fd);
  if (p.error) return p.error;
  const e = await db.communityPulse.findUnique({ where: { id: p.data.id } });
  if (!e || e.deletedAt) return { error: "Entry not found." };
  const now = new Date();
  if (p.data.intent === "publish") {
    await db.communityPulse.update({ where: { id: e.id }, data: { status: "PUBLISHED", publishedAt: e.publishedAt ?? now, firstPublishedAt: e.firstPublishedAt ?? now } });
  } else {
    await db.communityPulse.update({ where: { id: e.id }, data: { status: p.data.intent === "archive" ? "ARCHIVED" : "DRAFT", isFeatured: false } });
  }
  await audit(user.id, `pulse.${p.data.intent}`, "CommunityPulse", e.id, { title: e.title });
  revalidatePublic();
  return { ok: true, message: p.data.intent === "publish" ? "Published." : p.data.intent === "archive" ? "Archived." : "Unpublished." };
}

export async function featurePulse(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(idSchema.extend({ on: z.enum(["1", "0"]).default("1") }), fd);
  if (p.error) return p.error;
  const e = await db.communityPulse.findUnique({ where: { id: p.data.id } });
  if (!e || e.deletedAt) return { error: "Entry not found." };
  if (p.data.on === "0") {
    await db.communityPulse.update({ where: { id: e.id }, data: { isFeatured: false } });
    await audit(user.id, "pulse.unfeature", "CommunityPulse", e.id, { title: e.title });
    revalidatePublic();
    return { ok: true, message: "Removed from the homepage." };
  }
  if (e.status !== "PUBLISHED") return { error: "Only published entries can be featured." };
  // Exactly one featured entry.
  await db.$transaction([
    db.communityPulse.updateMany({ where: { isFeatured: true, NOT: { id: e.id } }, data: { isFeatured: false } }),
    db.communityPulse.update({ where: { id: e.id }, data: { isFeatured: true } }),
  ]);
  await audit(user.id, "pulse.feature", "CommunityPulse", e.id, { title: e.title });
  revalidatePublic();
  return { ok: true, message: "Featured on the homepage." };
}

export async function deletePulse(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const e = await db.communityPulse.findUnique({ where: { id: p.data.id } });
  if (!e) return { error: "Entry not found." };
  if (e.status === "DRAFT" && !e.firstPublishedAt) {
    // Never-published drafts can be removed completely (results cascade).
    await db.communityPulse.delete({ where: { id: e.id } });
    await audit(user.id, "pulse.delete", "CommunityPulse", e.id, { title: e.title, slug: e.slug, hard: true });
  } else {
    await db.communityPulse.update({ where: { id: e.id }, data: { deletedAt: new Date(), isFeatured: false } });
    await audit(user.id, "pulse.delete", "CommunityPulse", e.id, { title: e.title, slug: e.slug, hard: false });
  }
  revalidatePublic();
  if (fd.get("redirect")) redirect("/admin/community-pulse/");
  return { ok: true, message: "Entry deleted." };
}

export async function restorePulse(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const e = await db.communityPulse.update({ where: { id: p.data.id }, data: { deletedAt: null, status: "DRAFT" } });
  await audit(user.id, "pulse.restore", "CommunityPulse", e.id, { title: e.title });
  revalidatePublic();
  return { ok: true, message: "Restored as a draft." };
}

// ---------------------------------------------------------------- categories

const categorySchema = z.object({ id: z.string().max(40).optional(), name: zReq("Name", 80), slug: zSlugOpt });

export async function savePulseCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(categorySchema, fd);
  if (p.error) return p.error;
  const name = sanitizePlain(p.data.name, 80);
  if (!name) return { error: "Name is required", fieldErrors: { name: "Required" } };
  const slug = p.data.slug || slugify(name);
  if (!slug) return { error: "Choose a slug with letters or numbers.", fieldErrors: { slug: "Required" } };
  try {
    if (p.data.id) {
      await db.pulseCategory.update({ where: { id: p.data.id }, data: { name, slug } });
    } else {
      const max = await db.pulseCategory.aggregate({ _max: { sortOrder: true } });
      await db.pulseCategory.create({ data: { name, slug, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: `The slug “${slug}” is already used by another category.`, fieldErrors: { slug: "Already in use" } };
    throw e;
  }
  await audit(user.id, p.data.id ? "pulse_category.update" : "pulse_category.create", "PulseCategory", p.data.id, { name, slug });
  revalidatePublic();
  return { ok: true, message: p.data.id ? "Category saved." : `Added “${name}”.` };
}

export async function movePulseCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const p = parseForm(idSchema.extend({ dir: z.enum(["up", "down"]) }), fd);
  if (p.error) return p.error;
  const all = await db.pulseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
  const i = all.findIndex((c) => c.id === p.data.id);
  const j = p.data.dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return { ok: true };
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((c, n) => db.pulseCategory.update({ where: { id: c.id }, data: { sortOrder: n } })));
  revalidatePublic();
  return { ok: true };
}

export async function deletePulseCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(idSchema.extend({ force: z.string().optional() }), fd);
  if (p.error) return p.error;
  const c = await db.pulseCategory.findUnique({ where: { id: p.data.id }, include: { _count: { select: { pulses: true } } } });
  if (!c) return { error: "Category not found." };
  if (c._count.pulses > 0 && p.data.force !== "1") return { error: `“${c.name}” is used by ${c._count.pulses} entr${c._count.pulses === 1 ? "y" : "ies"}.` };
  await db.$transaction([
    db.communityPulse.updateMany({ where: { categoryId: c.id }, data: { categoryId: null } }),
    db.pulseCategory.delete({ where: { id: c.id } }),
  ]);
  await audit(user.id, "pulse_category.delete", "PulseCategory", c.id, { name: c.name, uncategorized: c._count.pulses });
  revalidatePublic();
  return { ok: true, message: "Category deleted." };
}

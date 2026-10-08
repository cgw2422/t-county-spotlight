"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pageHref } from "@/lib/links";
import { slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { isUniqueError, parseForm, uniqueSlug, zBool, zOpt, zReq, zUrlOpt } from "../_lib/form";

const RESERVED = ["admin", "api", "media", "login", "register", "dashboard", "businesses", "business", "events", "specials", "articles", "jobs", "search", "account"];

const schema = z.object({
  id: z.string().optional(),
  title: zReq("Title", 200),
  slug: z.string().trim().max(200).optional().transform((v) => (v ? v.replace(/^\/+|\/+$/g, "") : null))
    .refine((v) => !v || /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/.test(v), "Slug may contain lowercase letters, numbers, dashes and /"),
  content: z.string().max(3_000_000).default(""),
  featuredImageUrl: zUrlOpt,
  seoTitle: zOpt(200),
  seoDescription: zOpt(400),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  showInNav: zBool,
});

export async function savePage(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const existing = d.id ? await db.page.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Page not found." };
  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.title), async (s) => !!(await db.page.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } })));
  if (RESERVED.includes(slug.split("/")[0])) return { error: `“/${slug}/” conflicts with a built-in section of the site. Choose another slug.` };
  if (await db.page.findFirst({ where: { slug, NOT: { id: d.id ?? "" } }, select: { id: true } })) return { error: `The slug “${slug}” is already used by another page.` };

  const data = { title: d.title, slug, content: d.content, featuredImageUrl: d.featuredImageUrl, seoTitle: d.seoTitle, seoDescription: d.seoDescription, status: d.status, showInNav: d.showInNav, localEditedAt: new Date() };
  let page;
  try {
    page = existing ? await db.page.update({ where: { id: existing.id }, data }) : await db.page.create({ data });
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }

  let navNote = "";
  if (d.showInNav) {
    const href = pageHref(page);
    const item = await db.menuItem.findFirst({ where: { location: "HEADER", href } });
    if (!item) {
      const max = await db.menuItem.aggregate({ where: { location: "HEADER" }, _max: { sortOrder: true } });
      await db.menuItem.create({ data: { location: "HEADER", label: page.title.slice(0, 80), href, sortOrder: (max._max.sortOrder ?? -1) + 1, isVisible: page.status === "PUBLISHED" } });
      navNote = page.status === "PUBLISHED" ? " Added to the header menu." : " Added to the header menu (hidden until published).";
    } else if (page.status === "PUBLISHED" && !item.isVisible && !existing?.showInNav) {
      await db.menuItem.update({ where: { id: item.id }, data: { isVisible: true } });
    }
  }
  const verb = !existing ? "create" : existing.status !== d.status ? (d.status === "PUBLISHED" ? "publish" : "unpublish") : "update";
  await audit(user.id, `page.${verb}`, "Page", page.id, { title: page.title, status: page.status });
  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
  if (!existing) redirect(`/admin/pages/${page.id}/?created=1`);
  return { ok: true, message: `Page saved.${navNote}` };
}

export async function trashPage(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const page = await db.page.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: new Date() } });
  await db.menuItem.updateMany({ where: { href: pageHref(page) }, data: { isVisible: false } });
  await audit(user.id, "page.trash", "Page", page.id, { title: page.title });
  revalidatePath("/admin/pages");
  revalidatePath("/", "layout");
  if (fd.get("redirect")) redirect("/admin/pages/?tab=trash");
  return { ok: true, message: "Page moved to trash (menu links hidden)." };
}

export async function restorePage(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const page = await db.page.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: null } });
  await audit(user.id, "page.restore", "Page", page.id, { title: page.title });
  revalidatePath("/admin/pages");
  return { ok: true, message: "Page restored." };
}

export async function deletePageForever(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const page = await db.page.findUnique({ where: { id: String(fd.get("id")) } });
  if (!page) return { error: "Page not found." };
  if (!page.deletedAt) return { error: "Move the page to the trash first." };
  await db.page.delete({ where: { id: page.id } });
  await db.menuItem.deleteMany({ where: { href: pageHref(page) } });
  await audit(user.id, "page.delete", "Page", page.id, { title: page.title, slug: page.slug });
  revalidatePath("/admin/pages");
  return { ok: true, message: "Page permanently deleted." };
}

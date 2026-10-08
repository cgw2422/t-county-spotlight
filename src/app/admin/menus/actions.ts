"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { pageHref } from "@/lib/links";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zBool, zOpt } from "../_lib/form";

const LOCS = ["HEADER", "FOOTER", "MOBILE"] as const;

const schema = z.object({
  id: z.string().optional(),
  location: z.enum(LOCS),
  label: z.string().trim().min(1, "Label is required").max(80),
  linkType: z.enum(["custom", "page"]).default("custom"),
  href: z.string().trim().max(500).optional().default(""),
  pageId: zOpt(50),
  openInNewTab: zBool,
  isVisible: zBool,
});

export async function saveMenuItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  let href = d.href;
  if (d.linkType === "page") {
    if (!d.pageId) return { error: "Choose a page." };
    const page = await db.page.findFirst({ where: { id: d.pageId, status: "PUBLISHED", deletedAt: null } });
    if (!page) return { error: "Only published pages can be added to menus." };
    href = pageHref(page);
  }
  if (!href) return { error: "Enter a link." };
  if (!(href.startsWith("/") || /^https?:\/\//i.test(href) || /^(mailto|tel):/i.test(href))) return { error: "Links must start with /, https://, mailto: or tel:" };
  if (href.startsWith("/") && !href.includes("?") && !href.includes("#") && !/\.[a-z0-9]{2,5}$/i.test(href) && !href.endsWith("/")) href += "/";
  const data = { location: d.location, label: d.label, href, openInNewTab: d.openInNewTab, isVisible: d.isVisible };
  let row;
  if (d.id) row = await db.menuItem.update({ where: { id: d.id }, data });
  else {
    const max = await db.menuItem.aggregate({ where: { location: d.location }, _max: { sortOrder: true } });
    row = await db.menuItem.create({ data: { ...data, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  }
  await audit(user.id, d.id ? "menu.update" : "menu.create", "MenuItem", row.id, { label: row.label, href: row.href, location: row.location });
  revalidatePath("/admin/menus");
  revalidatePath("/", "layout");
  return { ok: true, message: d.id ? "Menu item saved." : "Menu item added." };
}

export async function moveMenuItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const item = await db.menuItem.findUnique({ where: { id } });
  if (!item) return { error: "Item not found." };
  const all = await db.menuItem.findMany({ where: { location: item.location, parentId: item.parentId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= all.length) return null;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, k) => db.menuItem.update({ where: { id: x.id }, data: { sortOrder: k } })));
  await audit(user.id, "menu.reorder", "MenuItem", id, { location: item.location });
  revalidatePath("/admin/menus");
  revalidatePath("/", "layout");
  return null;
}

export async function toggleMenuItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const item = await db.menuItem.findUnique({ where: { id: String(fd.get("id")) } });
  if (!item) return { error: "Item not found." };
  await db.menuItem.update({ where: { id: item.id }, data: { isVisible: !item.isVisible } });
  await audit(user.id, "menu.update", "MenuItem", item.id, { label: item.label, isVisible: !item.isVisible });
  revalidatePath("/admin/menus");
  revalidatePath("/", "layout");
  return { ok: true, message: item.isVisible ? `“${item.label}” hidden.` : `“${item.label}” shown.` };
}

export async function deleteMenuItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const item = await db.menuItem.findUnique({ where: { id: String(fd.get("id")) } });
  if (!item) return { error: "Item not found." };
  await db.menuItem.deleteMany({ where: { OR: [{ id: item.id }, { parentId: item.id }] } });
  await audit(user.id, "menu.delete", "MenuItem", item.id, { label: item.label, href: item.href, location: item.location });
  revalidatePath("/admin/menus");
  revalidatePath("/", "layout");
  return { ok: true, message: `Removed “${item.label}”.` };
}

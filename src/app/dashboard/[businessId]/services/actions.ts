"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { isStaff, requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { sanitizePlain } from "@/lib/sanitize";
import { audit } from "@/lib/audit";
import type { FormState } from "@/components/dashboard/fields";

/** Services & menus: Premium only (staff may manage any listing as an override). */
const LIMITS = { sections: 30, items: 100, title: 120, sectionDescription: 500, name: 120, itemDescription: 300, price: 40 } as const;
const PREMIUM_ERROR = "Upgrade to Premium to showcase detailed services, pricing, and menus.";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

async function access(fd: FormData) {
  const businessId = str(fd, "businessId");
  const { user, business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  return { user, business, allowed: entitlements.servicesMenus || isStaff(user) };
}

function refresh(business: { id: string; slug: string }) {
  revalidatePath(`/dashboard/${business.id}/services/`);
  revalidatePath(`/business/${business.slug}/`);
}

async function ownedSection(businessId: string, id: string) {
  return id ? db.businessOfferingSection.findFirst({ where: { id, businessId } }) : null;
}

const sectionSchema = z.object({
  kind: z.enum(["SERVICES", "MENU"]),
  title: z.string().min(1, "Please give this section a title."),
  description: z.string(),
});

export async function saveSectionAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business, allowed } = await access(fd);
  if (!allowed) return { error: PREMIUM_ERROR };
  const parsed = sectionSchema.safeParse({
    kind: str(fd, "kind") || "SERVICES",
    title: sanitizePlain(str(fd, "title"), LIMITS.title),
    description: sanitizePlain(str(fd, "description"), LIMITS.sectionDescription),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form.", fieldErrors: { title: "Required" } };
  const data = { kind: parsed.data.kind, title: parsed.data.title, description: parsed.data.description || null };
  const sectionId = str(fd, "sectionId");
  if (sectionId) {
    const s = await ownedSection(business.id, sectionId);
    if (!s) return { error: "Section not found." };
    await db.businessOfferingSection.update({ where: { id: s.id }, data });
    await audit(user.id, "business.offering_section_update", "Business", business.id, { sectionId: s.id, title: data.title });
  } else {
    const count = await db.businessOfferingSection.count({ where: { businessId: business.id } });
    if (count >= LIMITS.sections) return { error: `You can have up to ${LIMITS.sections} sections.` };
    const last = await db.businessOfferingSection.aggregate({ where: { businessId: business.id }, _max: { sortOrder: true } });
    const s = await db.businessOfferingSection.create({ data: { ...data, businessId: business.id, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit(user.id, "business.offering_section_create", "Business", business.id, { sectionId: s.id, kind: data.kind, title: data.title });
  }
  refresh(business);
  return { ok: true, message: sectionId ? "Section saved." : "Section added." };
}

export async function deleteSectionAction(fd: FormData) {
  const { user, business, allowed } = await access(fd);
  if (!allowed) return;
  const s = await ownedSection(business.id, str(fd, "sectionId"));
  if (!s) return;
  await db.businessOfferingSection.delete({ where: { id: s.id } });
  await audit(user.id, "business.offering_section_delete", "Business", business.id, { sectionId: s.id, title: s.title });
  refresh(business);
}

export async function moveSectionAction(fd: FormData) {
  const { user, business, allowed } = await access(fd);
  if (!allowed) return;
  const all = await db.businessOfferingSection.findMany({ where: { businessId: business.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((s) => s.id === str(fd, "sectionId"));
  const j = str(fd, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((s, k) => db.businessOfferingSection.update({ where: { id: s.id }, data: { sortOrder: k } })));
  await audit(user.id, "business.offering_reorder", "Business", business.id, { sectionId: all[j].id });
  refresh(business);
}

export async function saveItemAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business, allowed } = await access(fd);
  if (!allowed) return { error: PREMIUM_ERROR };
  const section = await ownedSection(business.id, str(fd, "sectionId"));
  if (!section) return { error: "Section not found." };
  const name = sanitizePlain(str(fd, "name"), LIMITS.name);
  if (!name) return { error: "Please enter a name.", fieldErrors: { name: "Required" } };
  const data = { name, description: sanitizePlain(str(fd, "description"), LIMITS.itemDescription) || null, price: sanitizePlain(str(fd, "price"), LIMITS.price) || null };
  const itemId = str(fd, "itemId");
  if (itemId) {
    const item = await db.businessOfferingItem.findFirst({ where: { id: itemId, sectionId: section.id } });
    if (!item) return { error: "Item not found." };
    await db.businessOfferingItem.update({ where: { id: item.id }, data });
    await audit(user.id, "business.offering_item_update", "Business", business.id, { sectionId: section.id, itemId: item.id, name });
  } else {
    const count = await db.businessOfferingItem.count({ where: { sectionId: section.id } });
    if (count >= LIMITS.items) return { error: `A section can have up to ${LIMITS.items} items.` };
    const last = await db.businessOfferingItem.aggregate({ where: { sectionId: section.id }, _max: { sortOrder: true } });
    const item = await db.businessOfferingItem.create({ data: { ...data, sectionId: section.id, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit(user.id, "business.offering_item_create", "Business", business.id, { sectionId: section.id, itemId: item.id, name });
  }
  refresh(business);
  return { ok: true, message: itemId ? "Item saved." : "Item added." };
}

export async function deleteItemAction(fd: FormData) {
  const { user, business, allowed } = await access(fd);
  if (!allowed) return;
  const item = await db.businessOfferingItem.findFirst({ where: { id: str(fd, "itemId"), section: { businessId: business.id } } });
  if (!item) return;
  await db.businessOfferingItem.delete({ where: { id: item.id } });
  await audit(user.id, "business.offering_item_delete", "Business", business.id, { itemId: item.id, name: item.name });
  refresh(business);
}

export async function moveItemAction(fd: FormData) {
  const { user, business, allowed } = await access(fd);
  if (!allowed) return;
  const item = await db.businessOfferingItem.findFirst({ where: { id: str(fd, "itemId"), section: { businessId: business.id } }, select: { id: true, sectionId: true } });
  if (!item) return;
  const all = await db.businessOfferingItem.findMany({ where: { sectionId: item.sectionId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === item.id);
  const j = str(fd, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, k) => db.businessOfferingItem.update({ where: { id: x.id }, data: { sortOrder: k } })));
  await audit(user.id, "business.offering_reorder", "Business", business.id, { itemId: item.id });
  refresh(business);
}

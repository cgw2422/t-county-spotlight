"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { focusFromForm } from "@/lib/cover";
import { TUSCARAWAS_CITIES, slugify } from "@/lib/utils";
import { publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { publicOrgWhere } from "@/lib/gives/queries";
import { publicPulseWhere } from "@/lib/pulse";
import { upcomingEventWhere } from "@/lib/events";
import { LINKED_ITEM_TYPES, SUGGESTED_COLLECTIONS, visibleItemCount, type LinkedItemType } from "@/lib/explore-collections";
import type { ActionState } from "@/components/ui/form-message";
import type { LookupItem } from "@/app/admin/_actions/common";
import { isUniqueError, parseForm, uniqueSlug, zBool, zInt, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const EMPTY_PUBLISH_ERROR = "Add at least one publicly visible item before publishing. Empty collections are never shown on the site.";

/** Absolute http(s) URL only. */
const zHttpUrlOpt = z.string().trim().max(2000).optional().transform((v) => (v ? v : null)).refine((v) => {
  if (!v) return true;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}, "Enter a full web address starting with https://");

function revalidate(id?: string) {
  revalidatePath("/admin/collections");
  if (id) revalidatePath(`/admin/collections/${id}`);
  revalidatePath("/explore", "layout");
}

const collectionSlugTaken = async (s: string, id?: string) => !!(await db.exploreCollection.findFirst({ where: { slug: s, NOT: { id: id ?? "" } }, select: { id: true } }));

// ───────────── Collection ─────────────

const collectionSchema = z.object({
  id: z.string().max(40).optional(),
  intent: z.enum(["save", "publish", "unpublish"]).default("save"),
  title: zReq("Title", 160),
  slug: zSlugOpt,
  description: zOpt(600),
  coverUrl: zUrlOpt,
  isFeatured: zBool,
  sortOrder: zInt(0, -1000, 1000),
});

export async function saveCollection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const parsed = parseForm(collectionSchema, fd);
  if (parsed.error) return parsed.error;
  const d = parsed.data;
  const existing = d.id ? await db.exploreCollection.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Collection not found." };

  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.title), (s) => collectionSlugTaken(s, d.id));
  else if (await collectionSlugTaken(slug, d.id)) return { error: `The slug “${slug}” is already used by another collection.`, fieldErrors: { slug: "Already in use" } };

  let status = existing?.status ?? "DRAFT";
  if (d.intent === "publish") {
    if (!existing || (await visibleItemCount(existing.id)) === 0) return { error: EMPTY_PUBLISH_ERROR };
    status = "PUBLISHED";
  } else if (d.intent === "unpublish") status = "DRAFT";

  const data = {
    title: sanitizePlain(d.title, 160) || d.title,
    slug,
    description: d.description ? sanitizePlain(d.description, 600) : null,
    coverImageUrl: d.coverUrl,
    ...(d.coverUrl ? focusFromForm(fd) : { coverFocusX: 50, coverFocusY: 50 }),
    isFeatured: d.isFeatured,
    sortOrder: d.sortOrder,
    status,
  };
  let id = d.id;
  try {
    if (existing) await db.exploreCollection.update({ where: { id: existing.id }, data });
    else id = (await db.exploreCollection.create({ data })).id;
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use.", fieldErrors: { slug: "Already in use" } };
    throw e;
  }
  const action = !existing ? "collection.create" : d.intent === "save" ? "collection.update" : `collection.${d.intent}`;
  await audit(user.id, action, "ExploreCollection", id, { title: data.title, slug, status });
  revalidate(id);
  if (!existing) redirect(`/admin/collections/${id}/?created=1`);
  return { ok: true, message: d.intent === "publish" ? "Published." : d.intent === "unpublish" ? "Unpublished — moved back to draft." : "Changes saved." };
}

/** Creates an EMPTY draft from one of the suggested starter ideas. Nothing is filled in automatically. */
export async function startSuggestedCollection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const i = Number(fd.get("index"));
  const s = SUGGESTED_COLLECTIONS[i];
  if (!s) return { error: "Unknown suggestion." };
  const slug = await uniqueSlug(slugify(s.title), (x) => collectionSlugTaken(x));
  const c = await db.exploreCollection.create({ data: { title: s.title, description: s.description, slug, status: "DRAFT" } });
  await audit(user.id, "collection.create", "ExploreCollection", c.id, { title: c.title, slug, fromSuggestion: true });
  revalidate();
  redirect(`/admin/collections/${c.id}/?created=1`);
}

const idSchema = z.object({ id: z.string().min(1).max(40) });

export async function setCollectionStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema.extend({ intent: z.enum(["publish", "unpublish"]) }), fd);
  if (p.error) return p.error;
  const c = await db.exploreCollection.findUnique({ where: { id: p.data.id }, select: { id: true, title: true } });
  if (!c) return { error: "Collection not found." };
  if (p.data.intent === "publish" && (await visibleItemCount(c.id)) === 0) return { error: EMPTY_PUBLISH_ERROR };
  await db.exploreCollection.update({ where: { id: c.id }, data: { status: p.data.intent === "publish" ? "PUBLISHED" : "DRAFT" } });
  await audit(user.id, `collection.${p.data.intent}`, "ExploreCollection", c.id, { title: c.title });
  revalidate(c.id);
  return { ok: true, message: p.data.intent === "publish" ? "Published." : "Moved back to draft." };
}

export async function deleteCollection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const c = await db.exploreCollection.findUnique({ where: { id: p.data.id }, select: { id: true, title: true, slug: true, _count: { select: { items: true } } } });
  if (!c) return { error: "Collection not found." };
  await db.exploreCollection.delete({ where: { id: c.id } });
  await audit(user.id, "collection.delete", "ExploreCollection", c.id, { title: c.title, slug: c.slug, items: c._count.items });
  revalidate();
  return { ok: true, message: "Collection deleted." };
}

// ───────────── Items ─────────────

/** If a published collection no longer has any visible item, move it back to draft (never show it empty). */
async function unpublishIfEmpty(collectionId: string, userId: string) {
  const c = await db.exploreCollection.findUnique({ where: { id: collectionId }, select: { status: true } });
  if (c?.status !== "PUBLISHED" || (await visibleItemCount(collectionId)) > 0) return false;
  await db.exploreCollection.update({ where: { id: collectionId }, data: { status: "DRAFT" } });
  await audit(userId, "collection.unpublish", "ExploreCollection", collectionId, { reason: "no visible items" });
  return true;
}

async function nextSortOrder(collectionId: string) {
  const agg = await db.exploreCollectionItem.aggregate({ where: { collectionId }, _max: { sortOrder: true } });
  return (agg._max.sortOrder ?? -1) + 1;
}

/** Whether a linked record is public right now (same rules as the public page). */
async function isPublicTarget(type: LinkedItemType, id: string) {
  switch (type) {
    case "BUSINESS": return !!(await db.business.findFirst({ where: publicBusinessWhere({ id }), select: { id: true } }));
    case "ARTICLE": return !!(await db.article.findFirst({ where: publishedArticleWhere({ id }), select: { id: true } }));
    case "EVENT": return !!(await db.event.findFirst({ where: { AND: [upcomingEventWhere(), { id }] }, select: { id: true } }));
    case "ORGANIZATION": return !!(await db.organization.findFirst({ where: publicOrgWhere({ id }), select: { id: true } }));
    case "PULSE": return !!(await db.communityPulse.findFirst({ where: publicPulseWhere({ id }), select: { id: true } }));
  }
}

const linkedSchema = z.object({
  collectionId: z.string().min(1).max(40),
  itemType: z.enum(LINKED_ITEM_TYPES),
  targetId: z.string().min(1).max(40),
});

export async function addLinkedItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(linkedSchema, fd);
  if (p.error) return p.error;
  const { collectionId, itemType, targetId } = p.data;
  if (!(await db.exploreCollection.findUnique({ where: { id: collectionId }, select: { id: true } }))) return { error: "Collection not found." };
  if (await db.exploreCollectionItem.findFirst({ where: { collectionId, itemType, targetId }, select: { id: true } })) return { error: "That item is already in this collection." };
  if (!(await isPublicTarget(itemType, targetId))) return { error: "Only published, public records can be added (events must be upcoming)." };
  const item = await db.exploreCollectionItem.create({ data: { collectionId, itemType, targetId, sortOrder: await nextSortOrder(collectionId) } });
  await audit(user.id, "collection.item.add", "ExploreCollection", collectionId, { itemId: item.id, itemType, targetId });
  revalidate(collectionId);
  return { ok: true, message: "Added to the collection." };
}

const placeSchema = z.object({
  collectionId: z.string().min(1).max(40),
  title: zReq("Name", 160),
  description: zOpt(1000),
  imageUrl: zUrlOpt,
  address: zOpt(200),
  city: z.string().trim().refine((v) => TUSCARAWAS_CITIES.includes(v), "Choose the community"),
  websiteUrl: zHttpUrlOpt,
  note: zOpt(300),
});

function placeData(d: z.output<typeof placeSchema>) {
  return {
    title: sanitizePlain(d.title, 160) || d.title,
    description: d.description ? sanitizePlain(d.description, 1000) : null,
    imageUrl: d.imageUrl,
    address: d.address ? sanitizePlain(d.address, 200) : null,
    city: d.city,
    websiteUrl: d.websiteUrl,
    note: d.note ? sanitizePlain(d.note, 300) : null,
  };
}

export async function addPlaceItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(placeSchema, fd);
  if (p.error) return p.error;
  const { collectionId } = p.data;
  if (!(await db.exploreCollection.findUnique({ where: { id: collectionId }, select: { id: true } }))) return { error: "Collection not found." };
  const item = await db.exploreCollectionItem.create({ data: { collectionId, itemType: "PLACE", ...placeData(p.data), sortOrder: await nextSortOrder(collectionId) } });
  await audit(user.id, "collection.item.add", "ExploreCollection", collectionId, { itemId: item.id, itemType: "PLACE", title: item.title });
  revalidate(collectionId);
  return { ok: true, message: "Place added." };
}

const overrideSchema = z.object({
  id: z.string().min(1).max(40),
  title: zOpt(160),
  description: zOpt(1000),
  imageUrl: zUrlOpt,
  note: zOpt(300),
});

/** Edits an item: all fields for a PLACE; optional title/description/photo overrides and the note for linked records. */
export async function updateItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const item = await db.exploreCollectionItem.findUnique({ where: { id }, select: { id: true, collectionId: true, itemType: true } });
  if (!item) return { error: "Item not found." };
  let data: Prisma.ExploreCollectionItemUpdateInput;
  if (item.itemType === "PLACE") {
    const p = parseForm(placeSchema, { ...Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")), collectionId: item.collectionId });
    if (p.error) return p.error;
    data = placeData(p.data);
  } else {
    const p = parseForm(overrideSchema, fd);
    if (p.error) return p.error;
    data = {
      title: p.data.title ? sanitizePlain(p.data.title, 160) : null,
      description: p.data.description ? sanitizePlain(p.data.description, 1000) : null,
      imageUrl: p.data.imageUrl,
      note: p.data.note ? sanitizePlain(p.data.note, 300) : null,
    };
  }
  await db.exploreCollectionItem.update({ where: { id: item.id }, data });
  await audit(user.id, "collection.item.update", "ExploreCollection", item.collectionId, { itemId: item.id });
  revalidate(item.collectionId);
  return { ok: true, message: "Item saved." };
}

export async function moveItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema.extend({ dir: z.enum(["up", "down"]) }), fd);
  if (p.error) return p.error;
  const item = await db.exploreCollectionItem.findUnique({ where: { id: p.data.id }, select: { id: true, collectionId: true } });
  if (!item) return { error: "Item not found." };
  const all = await db.exploreCollectionItem.findMany({ where: { collectionId: item.collectionId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === item.id);
  const j = p.data.dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return { ok: true };
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((x, n) => db.exploreCollectionItem.update({ where: { id: x.id }, data: { sortOrder: n } })));
  await audit(user.id, "collection.item.reorder", "ExploreCollection", item.collectionId, { itemId: item.id, dir: p.data.dir });
  revalidate(item.collectionId);
  return { ok: true };
}

export async function removeItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(idSchema, fd);
  if (p.error) return p.error;
  const item = await db.exploreCollectionItem.findUnique({ where: { id: p.data.id }, select: { id: true, collectionId: true, itemType: true, targetId: true, title: true } });
  if (!item) return { error: "Item not found." };
  await db.exploreCollectionItem.delete({ where: { id: item.id } });
  await audit(user.id, "collection.item.remove", "ExploreCollection", item.collectionId, { itemId: item.id, itemType: item.itemType, targetId: item.targetId, title: item.title });
  const unpublished = await unpublishIfEmpty(item.collectionId, user.id);
  revalidate(item.collectionId);
  return { ok: true, message: unpublished ? "Removed. The collection had no visible items left, so it was moved back to draft." : "Removed from the collection." };
}

/** Simple server-side search for public records to add to a collection. Staff only. */
export async function searchCollectionTargets(type: LinkedItemType, q: string): Promise<LookupItem[]> {
  await requireStaff();
  if (!(LINKED_ITEM_TYPES as readonly string[]).includes(type)) return [];
  const query = q.trim().slice(0, 100);
  const contains = { contains: query, mode: "insensitive" as const };
  const take = 12;
  switch (type) {
    case "BUSINESS": {
      const rows = await db.business.findMany({ where: publicBusinessWhere(query ? { name: contains } : {}), take, orderBy: { name: "asc" }, select: { id: true, name: true, city: true } });
      return rows.map((r) => ({ id: r.id, label: r.name, sub: r.city }));
    }
    case "ARTICLE": {
      const rows = await db.article.findMany({ where: publishedArticleWhere(query ? { title: contains } : {}), take, orderBy: { publishedAt: "desc" }, select: { id: true, title: true, kind: true, city: true } });
      return rows.map((r) => ({ id: r.id, label: r.title, sub: [r.kind.replace(/_/g, " ").toLowerCase(), r.city].filter(Boolean).join(" · ") }));
    }
    case "EVENT": {
      const rows = await db.event.findMany({ where: { AND: [upcomingEventWhere(), query ? { title: contains } : {}] }, take, orderBy: { startAt: "asc" }, select: { id: true, title: true, startAt: true, city: true, recurrence: true } });
      return rows.map((r) => ({ id: r.id, label: r.title, sub: [r.recurrence ? "Recurring" : r.startAt.toLocaleDateString("en-US", { timeZone: "America/New_York" }), r.city].filter(Boolean).join(" · ") }));
    }
    case "ORGANIZATION": {
      const rows = await db.organization.findMany({ where: publicOrgWhere(query ? { name: contains } : {}), take, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, kind: true } });
      return rows.map((r) => ({ id: r.id, label: r.name, sub: [r.kind === "CHURCH" ? "Church" : r.kind === "COMMUNITY_GROUP" ? "Community group" : "Nonprofit", r.city].filter(Boolean).join(" · ") }));
    }
    case "PULSE": {
      const rows = await db.communityPulse.findMany({ where: publicPulseWhere(query ? { title: contains } : {}), take, orderBy: { publishedAt: "desc" }, select: { id: true, title: true } });
      return rows.map((r) => ({ id: r.id, label: r.title }));
    }
  }
}

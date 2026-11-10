import "server-only";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Atomic enforcement of per-listing membership limits (gallery photos, events).
 * Every check that leads to an insert runs inside a transaction that first
 * locks the Business row (`SELECT … FOR UPDATE`), so simultaneous uploads,
 * replayed server actions or parallel API calls are serialized and can never
 * push a listing past its limit. Organizations never use these helpers.
 */
type Tx = Prisma.TransactionClient;

export async function lockBusinessRow(tx: Tx, businessId: string) {
  await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
}

// ───────────── Events ─────────────

/** Events that count toward a listing's limit: every non-removed event (past, pending, draft, rejected, published). */
export const countedEventWhere = (businessId: string) => ({ businessId, deletedAt: null });

export function countListingEvents(businessId: string) {
  return db.event.count({ where: countedEventWhere(businessId) });
}

export function eventLimitMessage(max: number) {
  return `You've used all ${max} event listings. Remove an existing event or upgrade to Premium for unlimited events.`;
}

/**
 * Runs `create` only if the listing has an event slot left (maxEvents null = unlimited).
 * The count and the insert happen in one transaction holding the Business row lock.
 */
export async function createEventWithinLimit<T>(businessId: string, maxEvents: number | null, create: (tx: Tx) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  return db.$transaction(async (tx) => {
    await lockBusinessRow(tx, businessId);
    if (maxEvents !== null) {
      const used = await tx.event.count({ where: countedEventWhere(businessId) });
      if (used >= maxEvents) return { ok: false as const, error: eventLimitMessage(maxEvents) };
    }
    return { ok: true as const, value: await create(tx) };
  });
}

// ───────────── Gallery photos ─────────────

export function photoLimitMessage(max: number, premium: boolean) {
  return premium
    ? `Your plan includes up to ${max} gallery photos. Remove a photo to add another.`
    : `Your Free Listing includes ${max} gallery photos. Upgrade to Premium to add up to 20 photos.`;
}

/**
 * Inserts as many photos as still fit under `maxPhotos` (logo and cover never count).
 * Returns how many were added and how many were refused.
 */
export async function addPhotosWithinLimit(businessId: string, maxPhotos: number, items: { url: string; alt: string | null }[]) {
  return db.$transaction(async (tx) => {
    await lockBusinessRow(tx, businessId);
    const existing = await tx.businessPhoto.count({ where: { businessId } });
    const slots = Math.max(0, maxPhotos - existing);
    const accepted = items.slice(0, slots);
    if (accepted.length) {
      const last = await tx.businessPhoto.aggregate({ where: { businessId }, _max: { sortOrder: true } });
      const base = (last._max.sortOrder ?? -1) + 1;
      await tx.businessPhoto.createMany({ data: accepted.map((p, i) => ({ businessId, url: p.url, alt: p.alt, sortOrder: base + i })) });
    }
    return { added: accepted.length, rejected: items.length - accepted.length, total: existing + accepted.length };
  });
}

type OrderablePhoto = { isPrimary: boolean; visibleOnFree: boolean; sortOrder: number; createdAt: Date };

/** Primary photo first, then the owner's order. */
export function orderPhotos<P extends OrderablePhoto>(photos: P[]): P[] {
  return [...photos].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Photos shown publicly. Within the plan limit: all of them. Over the limit
 * (e.g. after a downgrade): the owner's chosen ones, or else the first
 * `maxPhotos` by primary/order. Nothing is ever deleted.
 */
export function publicGalleryPhotos<P extends OrderablePhoto>(photos: P[], maxPhotos: number): P[] {
  const ordered = orderPhotos(photos);
  if (ordered.length <= maxPhotos) return ordered;
  const chosen = ordered.filter((p) => p.visibleOnFree);
  return (chosen.length ? chosen : ordered).slice(0, maxPhotos);
}

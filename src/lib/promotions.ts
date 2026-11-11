import type { Prisma } from "@/generated/prisma/client";
import { entitledBusinessWhere } from "./entitlements";

export type EffectivePromotionStatus = "Draft" | "Pending approval" | "Scheduled" | "Active" | "Expired" | "Unpublished" | "Rejected";

export function promotionStatus(p: { status: string; startsAt: Date; endsAt: Date | null }, now = new Date()): EffectivePromotionStatus {
  switch (p.status) {
    case "DRAFT": return "Draft";
    case "PENDING": return "Pending approval";
    case "REJECTED": return "Rejected";
    case "UNPUBLISHED": return "Unpublished";
  }
  if (p.endsAt && p.endsAt < now) return "Expired";
  if (p.startsAt > now) return "Scheduled";
  return "Active";
}

/** Status/date part of "currently live" (no membership check). Use publicPromotionWhere for anything public. */
function liveStatusWhere(now: Date): Prisma.PromotionWhereInput {
  return {
    status: "APPROVED",
    deletedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    business: { deletedAt: null, status: "PUBLISHED" },
  };
}

/**
 * Prisma business filter for listings whose specials may be public: published, not deleted,
 * and (unless the Free plan includes specials) currently entitled to `promotions`.
 * Specials are business content, so this applies regardless of who created them.
 */
export async function promotionBusinessWhere(now = new Date()): Promise<Prisma.BusinessWhereInput> {
  const ent = await entitledBusinessWhere("promotions", now);
  return { deletedAt: null, status: "PUBLISHED", ...(ent ?? {}) };
}

/**
 * Prisma filter for promotions that are currently PUBLIC: live (approved, started, not
 * expired) and the business currently has the `promotions` entitlement. Expired offers and
 * specials of downgraded listings drop out automatically (nothing is deleted; they come
 * back if the listing regains the entitlement). Top-level keys are status/deletedAt/
 * startsAt/OR/business, so callers may spread it and add other keys (not OR/business).
 */
export async function publicPromotionWhere(now = new Date()): Promise<Prisma.PromotionWhereInput> {
  return { ...liveStatusWhere(now), business: await promotionBusinessWhere(now) };
}

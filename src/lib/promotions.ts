import type { Prisma } from "@/generated/prisma/client";

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

/** Prisma filter for promotions that are currently live. Expired offers drop out automatically. */
export function activePromotionWhere(now = new Date()): Prisma.PromotionWhereInput {
  return {
    status: "APPROVED",
    deletedAt: null,
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    business: { deletedAt: null, status: "PUBLISHED" },
  };
}

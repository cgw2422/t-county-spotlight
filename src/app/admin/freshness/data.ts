import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { startOfNyDay } from "@/components/public/dates";
import { todayKey } from "@/lib/garage-sales";

/** Shared "stale content" filters for the freshness overview and its bulk actions. */
export function freshnessWhere(now = new Date()) {
  const today = startOfNyDay(todayKey(now));
  return {
    endedEvents: {
      status: "PUBLISHED", deletedAt: null, recurrence: { equals: Prisma.AnyNull },
      OR: [{ endAt: { lt: now } }, { endAt: null, startAt: { lt: now } }],
    } satisfies Prisma.EventWhereInput,
    expiredSpecials: { status: "APPROVED", deletedAt: null, endsAt: { lt: now } } satisfies Prisma.PromotionWhereInput,
    pastDeadlineNeeds: { status: { in: ["OPEN", "PARTIALLY_FULFILLED"] }, deletedAt: null, deadline: { lt: today } } satisfies Prisma.CommunityNeedWhereInput,
    endedOpportunities: {
      status: "PUBLISHED", deletedAt: null, isOngoing: false,
      OR: [{ endAt: { lt: now } }, { endAt: null, startAt: { lt: now } }],
    } satisfies Prisma.VolunteerOpportunityWhereInput,
    oldAnnouncements: { kind: "ANNOUNCEMENT", status: "PUBLISHED", deletedAt: null, publishedAt: { lt: new Date(now.getTime() - 60 * 86400_000) } } satisfies Prisma.ArticleWhereInput,
    staleFoodTrucks: {
      isFoodTruck: true, deletedAt: null, status: "PUBLISHED",
      foodTruckStops: { none: { OR: [{ endAt: { gte: now } }, { updatedAt: { gte: new Date(now.getTime() - 14 * 86400_000) } }] } },
    } satisfies Prisma.BusinessWhereInput,
  };
}

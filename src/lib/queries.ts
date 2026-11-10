import { db } from "./db";
import { activePromotionWhere } from "./promotions";
import { expandOccurrences, upcomingEventWhere } from "./events";
import type { Prisma } from "@/generated/prisma/client";

export const publishedArticleWhere = (extra: Prisma.ArticleWhereInput = {}): Prisma.ArticleWhereInput => ({
  status: "PUBLISHED",
  deletedAt: null,
  publishedAt: { lte: new Date() },
  ...extra,
});

export const publicBusinessWhere = (extra: Prisma.BusinessWhereInput = {}): Prisma.BusinessWhereInput => ({
  status: "PUBLISHED",
  deletedAt: null,
  ...extra,
});

const articleCardSelect = {
  id: true, slug: true, title: true, excerpt: true, featuredImageUrl: true, featuredImageAlt: true,
  publishedAt: true, legacyPath: true, kind: true, categories: { select: { name: true } },
} satisfies Prisma.ArticleSelect;

const businessCardSelect = {
  id: true, slug: true, name: true, tagline: true, description: true, city: true, coverUrl: true, coverFocusX: true, coverFocusY: true, logoUrl: true,
  isSpotlighted: true, categories: { select: { name: true } },
  // Community recommendation count for the card badge (hidden while recommendationsDisabled).
  recommendationCount: true, recommendationsDisabled: true,
} satisfies Prisma.BusinessSelect;

const eventCardSelect = {
  id: true, slug: true, title: true, imageUrl: true, locationName: true, city: true, startAt: true, endAt: true,
  allDay: true, isSponsored: true, isFeatured: true, recurrence: true, isFree: true, price: true, organizer: true, address: true,
} satisfies Prisma.EventSelect;

/** Featured ids first (admin-picked), then fill with the default ordering. */
function pinFirst<T extends { id: string }>(featured: T[], rest: T[], ids: string[], limit: number) {
  const order = new Map(ids.map((id, i) => [id, i]));
  const pinned = [...featured].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const seen = new Set(pinned.map((x) => x.id));
  return [...pinned, ...rest.filter((x) => !seen.has(x.id))].slice(0, limit);
}

/**
 * Community updates (ANNOUNCEMENT) leave prominent placement after `expiresAt`
 * (null = no end). Other kinds are unaffected. Archives don't use this.
 */
export const notExpiredAnnouncementWhere = (now = new Date()): Prisma.ArticleWhereInput => ({
  OR: [{ kind: { not: "ANNOUNCEMENT" } }, { expiresAt: null }, { expiresAt: { gt: now } }],
});

/** Homepage / featured placements: pinned ids first, then the default order. Expired community updates are left out. */
export async function getArticlesForSection(kind: Prisma.ArticleWhereInput, featuredIds: string[], limit: number) {
  const current = notExpiredAnnouncementWhere();
  const [featured, rest] = await Promise.all([
    featuredIds.length ? db.article.findMany({ where: publishedArticleWhere({ AND: [{ id: { in: featuredIds } }, current] }), select: articleCardSelect }) : [],
    db.article.findMany({ where: publishedArticleWhere({ AND: [kind, current] }), orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: limit, select: articleCardSelect }),
  ]);
  return pinFirst(featured, rest, featuredIds, limit);
}

export async function getFeaturedBusinesses(featuredIds: string[], limit: number) {
  const [featured, rest] = await Promise.all([
    featuredIds.length ? db.business.findMany({ where: publicBusinessWhere({ id: { in: featuredIds } }), select: businessCardSelect }) : [],
    db.business.findMany({ where: publicBusinessWhere(), orderBy: [{ isFeatured: "desc" }, { isSpotlighted: "desc" }, { updatedAt: "desc" }], take: limit, select: businessCardSelect }),
  ]);
  return pinFirst(featured, rest, featuredIds, limit);
}

/**
 * Directory "Most recommended" sort: strictly recommendationCount desc, then name — membership,
 * featured flags and payments play no part. Listings with recommendations switched off count as 0,
 * so they are interleaved by name with the zero-count listings. Exact pagination over two tiers:
 * (1) enabled listings with count > 0, (2) everything else, by name.
 */
export async function getBusinessesByRecommendations(where: Prisma.BusinessWhereInput, skip: number, take: number) {
  const ranked: Prisma.BusinessWhereInput = { AND: [where, { recommendationsDisabled: false, recommendationCount: { gt: 0 } }] };
  const rest: Prisma.BusinessWhereInput = { AND: [where, { OR: [{ recommendationsDisabled: true }, { recommendationCount: { lte: 0 } }] }] };
  const rankedTotal = await db.business.count({ where: ranked });
  const fromRanked = skip < rankedTotal
    ? await db.business.findMany({ where: ranked, select: businessCardSelect, orderBy: [{ recommendationCount: "desc" }, { name: "asc" }, { id: "asc" }], skip, take })
    : [];
  const need = take - fromRanked.length;
  const fromRest = need > 0
    ? await db.business.findMany({ where: rest, select: businessCardSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: Math.max(0, skip - rankedTotal), take: need })
    : [];
  return [...fromRanked, ...fromRest];
}

export async function getUpcomingOccurrences(opts: { from?: Date; to?: Date; limit?: number; featuredIds?: string[]; where?: Prisma.EventWhereInput } = {}) {
  const from = opts.from ?? new Date();
  const to = opts.to ?? new Date(from.getTime() + 120 * 86400_000);
  const events = await db.event.findMany({
    where: { AND: [upcomingEventWhere(from), { startAt: { lte: to } }, opts.where ?? {}] },
    select: eventCardSelect,
    take: 300,
  });
  let occ = expandOccurrences(events, from, to);
  // one occurrence per event in card lists
  const seen = new Set<string>();
  occ = occ.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
  const ids = opts.featuredIds ?? [];
  occ.sort((a, b) => {
    const fa = ids.includes(a.id) || a.isFeatured ? 0 : 1;
    const fb = ids.includes(b.id) || b.isFeatured ? 0 : 1;
    return fa - fb || a.occurrenceStart.getTime() - b.occurrenceStart.getTime();
  });
  return opts.limit ? occ.slice(0, opts.limit) : occ;
}

export async function getActiveSpecials(limit: number, featuredIds: string[] = []) {
  const select = {
    id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true,
    business: { select: { name: true, logoUrl: true, coverUrl: true } },
  } satisfies Prisma.PromotionSelect;
  const [featured, rest] = await Promise.all([
    featuredIds.length ? db.promotion.findMany({ where: { ...activePromotionWhere(), id: { in: featuredIds } }, select }) : [],
    db.promotion.findMany({ where: activePromotionWhere(), orderBy: [{ isSponsored: "desc" }, { isFeatured: "desc" }, { startsAt: "desc" }], take: limit, select }),
  ]);
  return pinFirst(featured, rest, featuredIds, limit);
}

export async function getActivePlacements(slot: string) {
  const now = new Date();
  return db.placement.findMany({
    where: { slot, isActive: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    include: { business: { select: businessCardSelect } },
  });
}

export { articleCardSelect, businessCardSelect, eventCardSelect };

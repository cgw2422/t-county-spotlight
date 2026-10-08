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
  id: true, slug: true, name: true, tagline: true, description: true, city: true, coverUrl: true, logoUrl: true,
  isSpotlighted: true, categories: { select: { name: true } },
} satisfies Prisma.BusinessSelect;

const eventCardSelect = {
  id: true, slug: true, title: true, imageUrl: true, locationName: true, city: true, startAt: true, endAt: true,
  allDay: true, isSponsored: true, isFeatured: true, recurrence: true, isFree: true,
} satisfies Prisma.EventSelect;

/** Featured ids first (admin-picked), then fill with the default ordering. */
function pinFirst<T extends { id: string }>(featured: T[], rest: T[], ids: string[], limit: number) {
  const order = new Map(ids.map((id, i) => [id, i]));
  const pinned = [...featured].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const seen = new Set(pinned.map((x) => x.id));
  return [...pinned, ...rest.filter((x) => !seen.has(x.id))].slice(0, limit);
}

export async function getArticlesForSection(kind: Prisma.ArticleWhereInput, featuredIds: string[], limit: number) {
  const [featured, rest] = await Promise.all([
    featuredIds.length ? db.article.findMany({ where: publishedArticleWhere({ id: { in: featuredIds } }), select: articleCardSelect }) : [],
    db.article.findMany({ where: publishedArticleWhere(kind), orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: limit, select: articleCardSelect }),
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

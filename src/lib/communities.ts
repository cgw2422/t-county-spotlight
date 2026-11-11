import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { articleCardSelect, businessCardSelect, getUpcomingOccurrences, publicBusinessWhere, publishedArticleWhere } from "./queries";
import { publicPromotionWhere } from "./promotions";
import { getPublicStops } from "./food-trucks";
import { getUpcomingGarageSales } from "./garage-sales";
import { activeSignupCounts, needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect, orgCardSelect, pledgedTotals, publicOrgWhere } from "./gives/queries";
import { getOpenings } from "./openings";
import { COMMUNITIES } from "./my-t-county-shared";
import { communityBySlug } from "./communities-shared";

export * from "./communities-shared";

const RESTAURANT_CATEGORY = "food-dining";
const ATTRACTION_CATEGORY = "attractions-recreation";
const EVENT_DAYS = 30;

/** Case-insensitive exact match on a free-text city column. */
const cityEq = (name: string) => ({ equals: name, mode: "insensitive" as const });

/** The known community for a URL slug plus its optional admin profile (cover + intro). */
export async function loadCommunity(slug: string) {
  const c = communityBySlug(slug);
  if (!c) return null;
  const profile = await db.communityProfile.findUnique({ where: { slug: c.slug } });
  return { ...c, profile };
}

const specialSelect = {
  id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true,
  business: { select: { name: true, logoUrl: true, coverUrl: true } },
} satisfies Prisma.PromotionSelect;

/**
 * Everything shown on a community page, pulled from existing records by city.
 * Each list may be empty; the page hides empty blocks. Nothing is invented.
 */
export async function getCommunityPageData(name: string, now = new Date()) {
  const city = cityEq(name);
  const eventsTo = new Date(now.getTime() + EVENT_DAYS * 86400_000);
  const orgCity: Prisma.OrganizationWhereInput = { city };

  const [
    events, stops, sales, businessCount, businesses, restaurantCount, restaurants, specials, openings,
    news, attractions, thingsArticles, churches, churchCount, nonprofits, nonprofitCount, opportunities, needs,
  ] = await Promise.all([
    getUpcomingOccurrences({ from: now, to: eventsTo, where: { city } }),
    getPublicStops({ window: "upcoming", city: name, limit: 6, now }),
    getUpcomingGarageSales({ city: name, limit: 6, now }),
    db.business.count({ where: publicBusinessWhere({ city }) }),
    db.business.findMany({ where: publicBusinessWhere({ city, isFoodTruck: false }), select: businessCardSelect, orderBy: [{ isFeatured: "desc" }, { isSpotlighted: "desc" }, { updatedAt: "desc" }], take: 8 }),
    db.business.count({ where: publicBusinessWhere({ city, categories: { some: { slug: RESTAURANT_CATEGORY } } }) }),
    db.business.findMany({ where: publicBusinessWhere({ city, categories: { some: { slug: RESTAURANT_CATEGORY } } }), select: businessCardSelect, orderBy: [{ isFeatured: "desc" }, { isSpotlighted: "desc" }, { name: "asc" }], take: 4 }),
    db.promotion.findMany({ where: { AND: [await publicPromotionWhere(now), { business: { city } }] }, select: specialSelect, orderBy: [{ isFeatured: "desc" }, { startsAt: "desc" }], take: 4 }),
    getOpenings({ city: name }).then((o) => o.current.slice(0, 4)),
    db.article.findMany({ where: publishedArticleWhere({ city, kind: { not: "THINGS_TO_DO" } }), select: articleCardSelect, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: 6 }),
    db.business.findMany({ where: publicBusinessWhere({ city, categories: { some: { slug: ATTRACTION_CATEGORY } } }), select: businessCardSelect, orderBy: [{ isFeatured: "desc" }, { isSpotlighted: "desc" }, { name: "asc" }], take: 4 }),
    db.article.findMany({ where: publishedArticleWhere({ city, kind: "THINGS_TO_DO" }), select: articleCardSelect, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: 3 }),
    db.organization.findMany({ where: publicOrgWhere({ ...orgCity, kind: "CHURCH" }), select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: 4 }),
    db.organization.count({ where: publicOrgWhere({ ...orgCity, kind: "CHURCH" }) }),
    db.organization.findMany({ where: publicOrgWhere({ ...orgCity, kind: { in: ["NONPROFIT", "COMMUNITY_GROUP"] } }), select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: 3 }),
    db.organization.count({ where: publicOrgWhere({ ...orgCity, kind: { in: ["NONPROFIT", "COMMUNITY_GROUP"] } }) }),
    db.volunteerOpportunity.findMany({
      where: openOpportunityWhere({ OR: [{ city }, { city: null, organization: orgCity }] }, now),
      select: opportunityCardSelect, orderBy: [{ isOngoing: "asc" }, { startAt: { sort: "asc", nulls: "last" } }], take: 3,
    }),
    db.communityNeed.findMany({
      where: openNeedWhere({ OR: [{ city }, { city: null, organization: orgCity }] }),
      select: needCardSelect, orderBy: [{ urgency: "desc" }, { deadline: { sort: "asc", nulls: "last" } }], take: 3,
    }),
  ]);

  // Stories linked to local businesses (spotlights etc.) that are not already tagged to this community.
  const shownArticleIds = [...news, ...thingsArticles].map((a) => a.id);
  const related = await db.article.findMany({
    where: publishedArticleWhere({ id: { notIn: shownArticleIds }, businesses: { some: { business: publicBusinessWhere({ city }) } } }),
    select: articleCardSelect, orderBy: { publishedAt: "desc" }, take: 3,
  });

  const [signups, pledged] = await Promise.all([activeSignupCounts(opportunities.map((o) => o.id)), pledgedTotals(needs.map((n) => n.id))]);

  return {
    events: events.slice(0, 6), eventCount: events.length,
    stops, sales, businessCount, businesses, restaurantCount, restaurants, specials, openings, news, attractions, thingsArticles, related,
    churches, churchCount, nonprofits, nonprofitCount, opportunities, needs, signups, pledged,
  };
}

export type CommunityPageData = Awaited<ReturnType<typeof getCommunityPageData>>;

export type CommunityCounts = { events: number; businesses: number; organizations: number; articles: number; sales: number; stops: number };

/**
 * Per-community counts for the /communities/ index and the sitemap. Keyed by
 * community slug. Counts are real record counts (city text match, any case).
 */
export async function getCommunityCounts(now = new Date()): Promise<Map<string, CommunityCounts>> {
  const [events, biz, orgs, arts, sales, stops] = await Promise.all([
    getUpcomingOccurrences({ from: now, to: new Date(now.getTime() + EVENT_DAYS * 86400_000) }),
    db.business.groupBy({ by: ["city"], where: publicBusinessWhere({ city: { not: null } }), _count: { _all: true } }),
    db.organization.groupBy({ by: ["city"], where: publicOrgWhere({ city: { not: null } }), _count: { _all: true } }),
    db.article.groupBy({ by: ["city"], where: publishedArticleWhere({ city: { not: null } }), _count: { _all: true } }),
    getUpcomingGarageSales({ now, limit: 1000 }),
    getPublicStops({ window: "upcoming", now, limit: 1000 }),
  ]);
  const key = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();
  const byName = new Map(COMMUNITIES.map((c) => [c.name.toLowerCase(), c.slug]));
  const out = new Map<string, CommunityCounts>(COMMUNITIES.map((c) => [c.slug, { events: 0, businesses: 0, organizations: 0, articles: 0, sales: 0, stops: 0 }]));
  const bump = (city: string | null | undefined, field: keyof CommunityCounts, n = 1) => {
    const slug = byName.get(key(city));
    if (slug) out.get(slug)![field] += n;
  };
  for (const e of events) bump(e.city, "events");
  for (const g of biz) bump(g.city, "businesses", g._count._all);
  for (const g of orgs) bump(g.city, "organizations", g._count._all);
  for (const g of arts) bump(g.city, "articles", g._count._all);
  for (const s of sales) bump(s.city, "sales");
  for (const s of stops) bump(s.city, "stops");
  return out;
}

export function hasCommunityContent(c: CommunityCounts | undefined) {
  return !!c && Object.values(c).some((n) => n > 0);
}

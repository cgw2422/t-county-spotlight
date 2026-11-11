import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { publicPromotionWhere } from "./promotions";
import { expandOccurrences, upcomingEventWhere } from "./events";
import { articleCardSelect, businessCardSelect, eventCardSelect, notExpiredAnnouncementWhere, publicBusinessWhere, publishedArticleWhere } from "./queries";
import { publicPulseWhere, pulseCardSelect } from "./pulse";
import { searchFoodTrucks } from "./food-trucks";
import { searchGarageSales } from "./garage-sales";
import { needCityWhere, opportunityCityWhere } from "./gives";
import { openingCardSelect, openingCityWhere, publicOpeningsWhere } from "./openings";
import { activeSignupCounts, needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect, orgCardSelect, pledgedTotals, publicOrgWhere, spotsLeft } from "./gives/queries";

/**
 * Unified site search. Every type returns `{ count, rows }` for one page
 * (`skip`/`take`; `take: 0` = count only). Queries are bounded and run in
 * parallel. Only public, current content is returned: published listings,
 * upcoming events (past events only on request), active garage sales (public
 * projection — private addresses never leave the server), non-expired needs,
 * volunteer opportunities and community updates.
 */

export const SEARCH_TYPES = [
  { key: "businesses", label: "Businesses", more: "/businesses/" },
  { key: "events", label: "Events", more: "/events/" },
  { key: "food-trucks", label: "Food trucks", more: "/food-trucks/" },
  { key: "things-to-do", label: "Things to do", more: "/things-to-do/" },
  { key: "gives", label: "Volunteer & needs", more: "/gives/" },
  { key: "garage-sales", label: "Garage sales", more: "/garage-sales/" },
  { key: "churches", label: "Churches", more: "/churches/" },
  { key: "nonprofits", label: "Nonprofits", more: "/gives/organizations/" },
  { key: "announcements", label: "Community updates", more: "/announcements/" },
  { key: "new", label: "New & Coming Soon", more: "/new/" },
  { key: "specials", label: "Specials", more: "/specials/" },
  { key: "articles", label: "Stories", more: "/articles/" },
  { key: "community-pulse", label: "Community Pulse", more: "/community-pulse/" },
  { key: "pages", label: "Pages", more: null },
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number]["key"];
export function searchType(v: string | null | undefined): SearchType | null {
  return SEARCH_TYPES.find((t) => t.key === v)?.key ?? null;
}
/** Types with no community/city information: left out while a community filter is on. */
export const CITYLESS_TYPES: SearchType[] = ["community-pulse", "pages"];

export const ATTRACTION_CATEGORIES = ["attractions-recreation", "arts-entertainment"];

export type SearchCtx = { q: string; city: string | null; now: Date; includePast: boolean };
type Page<T> = { count: number; rows: T[] };

const ci = (v: string) => ({ equals: v, mode: "insensitive" as const });

/** A paged source: total `count` plus `find(skip, take)` for its own order. */
type Source<T> = { count: () => Promise<number>; find: (skip: number, take: number) => Promise<T[]> };

/**
 * Pages through several sources as if they were one list (source 1 first, then
 * source 2, …). Used for "name matches first" ordering and mixed lists.
 */
async function chain<T>(sources: Source<T>[], skip: number, take: number): Promise<Page<T>> {
  const counts = await Promise.all(sources.map((s) => s.count()));
  const total = counts.reduce((a, b) => a + b, 0);
  if (take <= 0) return { count: total, rows: [] };
  const jobs: Promise<T[]>[] = [];
  let offset = 0;
  for (let i = 0; i < sources.length; i++) {
    const start = Math.max(0, skip - offset);
    const end = Math.min(counts[i], skip + take - offset);
    if (end > start) jobs.push(sources[i].find(start, end - start));
    offset += counts[i];
  }
  return { count: total, rows: (await Promise.all(jobs)).flat() };
}

/** Two tiers of one model: rows whose name/title starts with (or contains) the query first. */
function tiers<W extends object, T>(base: W, first: W, count: (w: W) => Promise<number>, find: (w: W, skip: number, take: number) => Promise<T[]>): Source<T>[] {
  const w1 = { AND: [base, first] } as W;
  const w2 = { AND: [base, { NOT: first }] } as W;
  return [
    { count: () => count(w1), find: (s, t) => find(w1, s, t) },
    { count: () => count(w2), find: (s, t) => find(w2, s, t) },
  ];
}

// ───────── per type ─────────

async function businesses(ctx: SearchCtx, skip: number, take: number) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  // Food trucks and attractions have their own groups (no double counting).
  const base: Prisma.BusinessWhereInput = publicBusinessWhere({
    AND: [
      { OR: [{ name: c }, { tagline: c }, { description: c }, { city: c }, { categories: { some: { name: c } } }] },
      { isFoodTruck: false },
      { NOT: { categories: { some: { slug: { in: ATTRACTION_CATEGORIES } } } } },
      ctx.city ? { city: ci(ctx.city) } : {},
    ],
  });
  return chain(tiers<Prisma.BusinessWhereInput, Prisma.BusinessGetPayload<{ select: typeof businessCardSelect }>>(
    base, { name: { startsWith: ctx.q, mode: "insensitive" } },
    (where) => db.business.count({ where }),
    (where, s, t) => db.business.findMany({ where, select: businessCardSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: s, take: t }),
  ), skip, take);
}

type EventRow = ReturnType<typeof expandOccurrences<Prisma.EventGetPayload<{ select: typeof eventCardSelect }>>>[number];
async function events(ctx: SearchCtx, skip: number, take: number): Promise<Page<EventRow> & { past: Page<Prisma.EventGetPayload<{ select: typeof eventCardSelect }>> | null }> {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const match: Prisma.EventWhereInput = { AND: [{ OR: [{ title: c }, { description: c }, { locationName: c }, { city: c }] }, ctx.city ? { city: ci(ctx.city) } : {}] };
  const pastWhere: Prisma.EventWhereInput = {
    AND: [{ status: "PUBLISHED", deletedAt: null, recurrence: { equals: Prisma.AnyNull } }, { OR: [{ endAt: { lt: ctx.now } }, { endAt: null, startAt: { lt: ctx.now } }] }, match],
  };
  const [raw, pastCount, pastRows] = await Promise.all([
    db.event.findMany({ where: { AND: [upcomingEventWhere(ctx.now), match] }, select: eventCardSelect, take: 150 }),
    ctx.includePast ? db.event.count({ where: pastWhere }) : Promise.resolve(0),
    ctx.includePast ? db.event.findMany({ where: pastWhere, select: eventCardSelect, orderBy: { startAt: "desc" }, take: 12 }) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const q = ctx.q.toLowerCase();
  const occ = expandOccurrences(raw, ctx.now, new Date(ctx.now.getTime() + 365 * 86400_000))
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    // Exact title matches first, then the soonest.
    .sort((a, b) => Number(b.title.toLowerCase() === q) - Number(a.title.toLowerCase() === q) || a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
  return { count: occ.length, rows: occ.slice(skip, skip + take), past: ctx.includePast ? { count: pastCount, rows: pastRows } : null };
}

async function foodTrucks(ctx: SearchCtx, skip: number, take: number) {
  return searchFoodTrucks(ctx.q, take, { city: ctx.city, skip });
}

async function garageSales(ctx: SearchCtx, skip: number, take: number) {
  return searchGarageSales(ctx.q, take, { city: ctx.city, skip });
}

type ThingsRow = { kind: "business"; b: Prisma.BusinessGetPayload<{ select: typeof businessCardSelect }> } | { kind: "article"; a: Prisma.ArticleGetPayload<{ select: typeof articleCardSelect }> };
async function thingsToDo(ctx: SearchCtx, skip: number, take: number): Promise<Page<ThingsRow>> {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const bizWhere = publicBusinessWhere({
    AND: [
      { categories: { some: { slug: { in: ATTRACTION_CATEGORIES } } } },
      { OR: [{ name: c }, { tagline: c }, { description: c }, { city: c }, { categories: { some: { name: c } } }] },
      ctx.city ? { city: ci(ctx.city) } : {},
    ],
  });
  const artWhere = publishedArticleWhere({ AND: [{ kind: "THINGS_TO_DO" }, { OR: [{ title: c }, { excerpt: c }, { content: c }] }, ctx.city ? { city: ci(ctx.city) } : {}] });
  return chain<ThingsRow>([
    ...tiers<Prisma.BusinessWhereInput, ThingsRow>(bizWhere, { name: { startsWith: ctx.q, mode: "insensitive" } }, (where) => db.business.count({ where }),
      async (where, s, t) => (await db.business.findMany({ where, select: businessCardSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: s, take: t })).map((b) => ({ kind: "business" as const, b }))),
    {
      count: () => db.article.count({ where: artWhere }),
      find: async (s, t) => (await db.article.findMany({ where: artWhere, select: articleCardSelect, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip: s, take: t })).map((a) => ({ kind: "article" as const, a })),
    },
  ], skip, take);
}

type GivesRow =
  | { kind: "need"; n: Prisma.CommunityNeedGetPayload<{ select: typeof needCardSelect }>; pledged?: number }
  | { kind: "opportunity"; o: Prisma.VolunteerOpportunityGetPayload<{ select: typeof opportunityCardSelect }>; left: number | null };
async function gives(ctx: SearchCtx, skip: number, take: number): Promise<Page<GivesRow>> {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  // openNeedWhere / openOpportunityWhere already drop expired needs and ended opportunities.
  const needWhere = openNeedWhere({ AND: [{ OR: [{ title: c }, { description: c }, { organization: { name: c } }] }, ctx.city ? needCityWhere(ctx.city) : {}] });
  const oppWhere = openOpportunityWhere({ AND: [{ OR: [{ title: c }, { description: c }, { locationName: c }, { organization: { name: c } }] }, ctx.city ? opportunityCityWhere(ctx.city) : {}] }, ctx.now);
  const page = await chain<GivesRow>([
    {
      count: () => db.volunteerOpportunity.count({ where: oppWhere }),
      find: async (s, t) => (await db.volunteerOpportunity.findMany({ where: oppWhere, select: opportunityCardSelect, orderBy: [{ isOngoing: "asc" }, { startAt: { sort: "asc", nulls: "last" } }, { id: "asc" }], skip: s, take: t })).map((o) => ({ kind: "opportunity" as const, o, left: null })),
    },
    {
      count: () => db.communityNeed.count({ where: needWhere }),
      find: async (s, t) => (await db.communityNeed.findMany({ where: needWhere, select: needCardSelect, orderBy: [{ urgency: "desc" }, { deadline: { sort: "asc", nulls: "last" } }, { id: "asc" }], skip: s, take: t })).map((n) => ({ kind: "need" as const, n })),
    },
  ], skip, take);
  if (page.rows.length) {
    const [pledged, signups] = await Promise.all([
      pledgedTotals(page.rows.flatMap((r) => (r.kind === "need" ? [r.n.id] : []))),
      activeSignupCounts(page.rows.flatMap((r) => (r.kind === "opportunity" ? [r.o.id] : []))),
    ]);
    for (const r of page.rows) {
      if (r.kind === "need") r.pledged = pledged.get(r.n.id);
      else r.left = spotsLeft(r.o.spots, signups.get(r.o.id) ?? 0);
    }
  }
  return page;
}

async function orgs(ctx: SearchCtx, skip: number, take: number, church: boolean) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const base = publicOrgWhere({
    AND: [
      { kind: church ? "CHURCH" : { not: "CHURCH" } },
      { OR: [{ name: c }, { tagline: c }, { mission: c }, { orgType: c }, { denomination: c }, { city: c }, { ministries: { has: ctx.q } }] },
      ctx.city ? { city: ci(ctx.city) } : {},
    ],
  });
  return chain(tiers<Prisma.OrganizationWhereInput, Prisma.OrganizationGetPayload<{ select: typeof orgCardSelect }>>(
    base, { name: { startsWith: ctx.q, mode: "insensitive" } },
    (where) => db.organization.count({ where }),
    (where, s, t) => db.organization.findMany({ where, select: orgCardSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip: s, take: t }),
  ), skip, take);
}

function articleSearch(ctx: SearchCtx, kind: Prisma.ArticleWhereInput) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  return (skip: number, take: number) => chain(tiers<Prisma.ArticleWhereInput, Prisma.ArticleGetPayload<{ select: typeof articleCardSelect }>>(
    publishedArticleWhere({ AND: [kind, { OR: [{ title: c }, { excerpt: c }, { content: c }] }, ctx.city ? { city: ci(ctx.city) } : {}] }),
    { title: c },
    (where) => db.article.count({ where }),
    (where, s, t) => db.article.findMany({ where, select: articleCardSelect, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip: s, take: t }),
  ), skip, take);
}

const specialSelect = {
  id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true,
  business: { select: { name: true, logoUrl: true, coverUrl: true } },
} satisfies Prisma.PromotionSelect;
async function specials(ctx: SearchCtx, skip: number, take: number) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const where: Prisma.PromotionWhereInput = { ...(await publicPromotionWhere(ctx.now)), AND: [{ OR: [{ title: c }, { description: c }, { business: { name: c } }] }, ctx.city ? { business: { city: ci(ctx.city) } } : {}] };
  const [count, rows] = await Promise.all([
    db.promotion.count({ where }),
    take > 0 ? db.promotion.findMany({ where, select: specialSelect, orderBy: [{ endsAt: { sort: "asc", nulls: "last" } }, { id: "asc" }], skip, take }) : Promise.resolve([]),
  ]);
  return { count, rows };
}

async function openings(ctx: SearchCtx, skip: number, take: number) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const base = await publicOpeningsWhere({ AND: [{ OR: [{ title: c }, { body: c }, { businessName: c }, { business: { name: c } }] }, ctx.city ? openingCityWhere(ctx.city) : {}] });
  return chain(tiers<Prisma.BusinessUpdateWhereInput, Prisma.BusinessUpdateGetPayload<{ select: typeof openingCardSelect }>>(
    base, { OR: [{ title: c }, { businessName: c }, { business: { name: c } }] },
    (where) => db.businessUpdate.count({ where }),
    (where, s, t) => db.businessUpdate.findMany({ where, select: openingCardSelect, orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }, { id: "asc" }], skip: s, take: t }),
  ), skip, take);
}

async function pulses(ctx: SearchCtx, skip: number, take: number) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const base = publicPulseWhere({ OR: [{ title: c }, { description: c }, { results: { some: { name: c } } }] }, { includeArchived: true });
  return chain(tiers<Prisma.CommunityPulseWhereInput, Prisma.CommunityPulseGetPayload<{ select: typeof pulseCardSelect }>>(
    base, { title: c },
    (where) => db.communityPulse.count({ where }),
    (where, s, t) => db.communityPulse.findMany({ where, select: pulseCardSelect, orderBy: [{ status: "asc" }, { publishedAt: "desc" }, { id: "asc" }], skip: s, take: t }),
  ), skip, take);
}

async function pages(ctx: SearchCtx, skip: number, take: number) {
  const c = { contains: ctx.q, mode: "insensitive" as const };
  const where: Prisma.PageWhereInput = { status: "PUBLISHED", deletedAt: null, OR: [{ title: c }, { content: c }] };
  const [count, rows] = await Promise.all([
    db.page.count({ where }),
    take > 0 ? db.page.findMany({ where, select: { id: true, slug: true, title: true, legacyPath: true, content: true }, orderBy: [{ title: "asc" }, { id: "asc" }], skip, take }) : Promise.resolve([]),
  ]);
  return { count, rows };
}

/**
 * Runs the search. With `only`, that type gets `skip/take` and every other
 * type is counted only (for the chips). Without it, each type returns its
 * first `take` rows.
 */
export async function runSearch(ctx: SearchCtx, opts: { only?: SearchType | null; skip?: number; take: number }) {
  const skipped = (t: SearchType) => !!ctx.city && CITYLESS_TYPES.includes(t);
  const want = (t: SearchType) => (skipped(t) ? -1 : !opts.only || opts.only === t ? opts.take : 0);
  const sk = (t: SearchType) => (opts.only === t ? opts.skip ?? 0 : 0);
  const empty = { count: 0, rows: [] as never[] };
  const run = <T,>(t: SearchType, f: (skip: number, take: number) => Promise<T>) => (want(t) < 0 ? Promise.resolve(null) : f(sk(t), want(t)));

  const [biz, ev, trucks, things, give, sales, churches, nonprofits, updates, opening, sp, arts, pulse, pg] = await Promise.all([
    run("businesses", (s, t) => businesses(ctx, s, t)),
    run("events", (s, t) => events(ctx, s, t)),
    run("food-trucks", (s, t) => foodTrucks(ctx, s, t)),
    run("things-to-do", (s, t) => thingsToDo(ctx, s, t)),
    run("gives", (s, t) => gives(ctx, s, t)),
    run("garage-sales", (s, t) => garageSales(ctx, s, t)),
    run("churches", (s, t) => orgs(ctx, s, t, true)),
    run("nonprofits", (s, t) => orgs(ctx, s, t, false)),
    run("announcements", articleSearch(ctx, { AND: [{ kind: "ANNOUNCEMENT" }, notExpiredAnnouncementWhere(ctx.now)] })),
    run("new", (s, t) => openings(ctx, s, t)),
    run("specials", (s, t) => specials(ctx, s, t)),
    run("articles", articleSearch(ctx, { kind: { notIn: ["ANNOUNCEMENT", "THINGS_TO_DO"] } })),
    run("community-pulse", (s, t) => pulses(ctx, s, t)),
    run("pages", (s, t) => pages(ctx, s, t)),
  ]);
  const results = {
    businesses: biz ?? empty, events: ev ?? { ...empty, past: null }, "food-trucks": trucks ?? empty, "things-to-do": things ?? empty, gives: give ?? empty,
    "garage-sales": sales ?? empty, churches: churches ?? empty, nonprofits: nonprofits ?? empty, announcements: updates ?? empty, new: opening ?? empty, specials: sp ?? empty,
    articles: arts ?? empty, "community-pulse": pulse ?? empty, pages: pg ?? empty,
  };
  const counts = Object.fromEntries(SEARCH_TYPES.map((t) => {
    const r = results[t.key];
    return [t.key, r.count + (t.key === "events" && results.events.past ? results.events.past.count : 0)];
  })) as Record<SearchType, number>;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { results, counts, total, skippedTypes: SEARCH_TYPES.map((t) => t.key).filter(skipped) };
}

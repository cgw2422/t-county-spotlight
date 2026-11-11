import "server-only";
import { db } from "@/lib/db";
import { getUpcomingOccurrences } from "@/lib/queries";
import { publicPromotionWhere } from "@/lib/promotions";
import { businessHref, eventHref, specialHref } from "@/lib/links";
import { publicStopWhere, stopSelect, shortTime, nyDateKey } from "@/lib/food-trucks";
import { activeSaleWhere, garageSaleCardSelect, garageSaleHref, overlapsRange, toPublicSale } from "@/lib/garage-sales";
import { formatSaleDates, formatHours } from "@/lib/garage-sales-shared";
import { isArchivedOpening, openingCardSelect, openingCity, openingCityWhere, openingHref, openingName, publicOpeningsWhere, OPENING_LABELS, isOpeningKind } from "@/lib/openings";
import { needCityWhere, opportunityCityWhere, givesCity } from "@/lib/gives";
import { needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect } from "@/lib/gives/queries";
import { needHref, opportunityHref } from "@/lib/gives/constants";
import { prioritizeByCommunity, sameCity } from "@/lib/my-t-county-shared";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * Real, public site content for community emails (the newsletter's "Around your
 * community" block and the member email updates). Never invented: every item is
 * a published record with a public link. Paid placements (sponsored events and
 * specials) are always left out of these personalized emails, and garage sales
 * only ever use the public projection (toPublicSale).
 */
export type LocalItemType = "event" | "food_truck" | "garage_sale" | "opening" | "need" | "volunteer" | "special";

export type LocalItem = {
  key: string;
  type: LocalItemType;
  title: string;
  /** Site-relative path. */
  url: string;
  /** "Sat, Nov 14 · 10am · Dover" */
  meta: string;
  city: string | null;
};

export const TYPE_LABEL: Record<LocalItemType, string> = {
  event: "Event",
  food_truck: "Food truck",
  garage_sale: "Garage sale",
  opening: "New & coming soon",
  need: "Way to help",
  volunteer: "Volunteer",
  special: "Local special",
};

const ci = (names: string[]) => ({ in: names, mode: "insensitive" as const });
const day = (d: Date) => formatDate(d, { weekday: "short", month: "short", day: "numeric" });

export type FetchOpts = {
  /** Community names; null or empty = countywide. */
  communities: string[] | null;
  /** Happening window for events / food trucks / garage sales. */
  start: Date;
  end: Date;
  /** Only records newly listed since this time ("new in my communities"). */
  createdSince?: Date;
  now?: Date;
  take?: number;
  types?: LocalItemType[];
};

/** Fetches each requested type, community-first within each list. */
export async function fetchLocalItems(o: FetchOpts): Promise<Record<LocalItemType, LocalItem[]>> {
  const now = o.now ?? new Date();
  const names = o.communities?.length ? o.communities : null;
  const take = o.take ?? 12;
  const want = (t: LocalItemType) => !o.types || o.types.includes(t);
  const since = o.createdSince;

  const [events, stops, sales, openings, needs, opps, specials] = await Promise.all([
    want("event")
      ? getUpcomingOccurrences({
        from: o.start, to: o.end, limit: take * 3,
        where: { AND: [{ isSponsored: false }, names ? { city: ci(names) } : {}, since ? { createdAt: { gte: since } } : {}] },
      })
      : [],
    want("food_truck")
      ? db.foodTruckStop.findMany({
        where: { AND: [publicStopWhere({ start: o.start > now ? o.start : now, end: o.end }), names ? { city: ci(names) } : {}, since ? { createdAt: { gte: since } } : {}] },
        orderBy: [{ startAt: "asc" }, { id: "asc" }], take: take * 3, select: stopSelect,
      })
      : [],
    want("garage_sale")
      ? db.garageSale.findMany({
        where: { AND: [activeSaleWhere(now), overlapsRange({ from: nyDateKey(o.start), to: nyDateKey(o.end) }), names ? { city: ci(names) } : {}, since ? { publishedAt: { gte: since } } : {}] },
        orderBy: [{ startDate: "asc" }, { id: "asc" }], take: take * 3, select: garageSaleCardSelect,
      }).then((rows) => rows.map(toPublicSale))
      : [],
    want("opening")
      ? db.businessUpdate.findMany({
        where: await publicOpeningsWhere({ AND: [names ? { OR: names.map((c) => openingCityWhere(c)) } : {}, { publishedAt: { gte: since ?? new Date(now.getTime() - 14 * 86400_000) } }] }),
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }], take: take * 2, select: openingCardSelect,
      })
      : [],
    want("need")
      ? db.communityNeed.findMany({
        where: openNeedWhere({ AND: [names ? { OR: names.map((c) => needCityWhere(c)) } : {}, since ? { createdAt: { gte: since } } : {}] }),
        orderBy: [{ urgency: "desc" }, { deadline: { sort: "asc", nulls: "last" } }], take: take * 2, select: needCardSelect,
      })
      : [],
    want("volunteer")
      ? db.volunteerOpportunity.findMany({
        where: openOpportunityWhere({ AND: [names ? { OR: names.map((c) => opportunityCityWhere(c)) } : {}, since ? { createdAt: { gte: since } } : {}] }, now),
        orderBy: [{ isOngoing: "asc" }, { startAt: { sort: "asc", nulls: "last" } }], take: take * 2, select: opportunityCardSelect,
      })
      : [],
    want("special")
      ? db.promotion.findMany({
        where: { AND: [await publicPromotionWhere(now), { isSponsored: false }, names ? { business: { city: ci(names) } } : {}] },
        orderBy: [{ isFeatured: "desc" }, { startsAt: "desc" }], take: take * 2,
        select: { id: true, slug: true, title: true, endsAt: true, business: { select: { name: true, city: true } } },
      })
      : [],
  ]);

  const order = names ?? [];
  const sortBy = <T,>(rows: T[], city: (x: T) => string | null | undefined) => prioritizeByCommunity(rows, city, order).slice(0, take);

  return {
    event: sortBy(events, (e) => e.city).map((e) => ({
      key: `event:${e.id}`, type: "event", title: e.title, url: eventHref(e), city: e.city,
      meta: [day(e.occurrenceStart), e.allDay ? null : formatTime(e.occurrenceStart), e.city].filter(Boolean).join(" · "),
    })),
    food_truck: sortBy(stops, (s) => s.city).map((s) => ({
      key: `stop:${s.id}`, type: "food_truck", title: `${s.business.name} at ${s.locationName}`, url: businessHref(s.business), city: s.city,
      meta: [day(s.startAt), `${shortTime(s.startAt)}–${shortTime(s.endAt)}`, s.city].filter(Boolean).join(" · "),
    })),
    garage_sale: sortBy(sales, (s) => s.city).map((s) => ({
      key: `sale:${s.id}`, type: "garage_sale", title: s.title, url: garageSaleHref(s), city: s.city,
      meta: [formatSaleDates(s.startDate, s.endDate), formatHours(s.dailyStart, s.dailyEnd), s.locationLine || s.city].filter(Boolean).join(" · "),
    })),
    opening: sortBy(openings.filter((r) => !isArchivedOpening(r, now)), openingCity).map((r) => ({
      key: `opening:${r.id}`, type: "opening", title: openingName(r), url: openingHref(r), city: openingCity(r),
      meta: [isOpeningKind(r.kind) ? OPENING_LABELS[r.kind] : null, openingCity(r)].filter(Boolean).join(" · "),
    })),
    need: sortBy(needs, givesCity).map((n) => ({
      key: `need:${n.id}`, type: "need", title: n.title, url: needHref(n), city: givesCity(n),
      meta: [n.organization.name, n.urgency === "CRITICAL" || n.urgency === "HIGH" ? "Urgent" : null, givesCity(n)].filter(Boolean).join(" · "),
    })),
    volunteer: sortBy(opps, givesCity).map((v) => ({
      key: `opp:${v.id}`, type: "volunteer", title: v.title, url: opportunityHref(v), city: givesCity(v),
      meta: [v.organization.name, v.isOngoing ? "Ongoing" : v.startAt ? day(v.startAt) : null, givesCity(v)].filter(Boolean).join(" · "),
    })),
    special: sortBy(specials, (p) => p.business.city).map((p) => ({
      key: `special:${p.id}`, type: "special", title: p.title, url: specialHref(p), city: p.business.city,
      meta: [p.business.name, p.endsAt ? `Ends ${formatDate(p.endsAt, { month: "short", day: "numeric" })}` : null, p.business.city].filter(Boolean).join(" · "),
    })),
  };
}

/** Round-robin across the given type order so a short list shows a mix, not four events. */
export function mixItems(byType: Partial<Record<LocalItemType, LocalItem[]>>, order: LocalItemType[], limit: number): LocalItem[] {
  const queues = order.map((t) => [...(byType[t] ?? [])]);
  const out: LocalItem[] = [];
  const seen = new Set<string>();
  while (out.length < limit && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && !seen.has(next.key)) {
        seen.add(next.key);
        out.push(next);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

/** Keeps only items located in one of `communities`. */
export function inCommunities(items: LocalItem[], communities: string[]) {
  return items.filter((i) => communities.some((c) => sameCity(i.city, c)));
}

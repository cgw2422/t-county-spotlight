import "server-only";
import { cache } from "react";
import { db } from "./db";
import { expandOccurrences, upcomingEventWhere } from "./events";
import { eventCardSelect } from "./queries";
import { activeSaleWhere, overlapsRange, todayKey } from "./garage-sales";
import { publicStopWhere } from "./food-trucks";
import { addDaysKey, endOfNyDay } from "@/components/public/dates";
import { sameCity } from "./my-t-county-shared";

/**
 * Homepage data shared between sections (computed once per request).
 *
 * - Upcoming Events (HomepageSection type "weekend"): the next published events by their next
 *   eligible occurrence — one card per event, in-progress occurrences included.
 * - Food trucks / garage sales availability: whether anything is scheduled in the next 7 days
 *   (America/New_York, today + 6 days) for the visitor's scope. Drives the homepage sections and
 *   the hero / explore-grid shortcuts. Menus, footer and /explore/ always keep both links.
 */

// ───────────── Section titles ─────────────

export const UPCOMING_EVENTS_TITLE = "Upcoming Events";
export const GARAGE_SALES_TITLE = "Garage Sales";
export const GARAGE_SALES_SUBTITLE = "Yard, rummage and estate sales coming up this week";

const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/[‘’]/g, "'").toLowerCase();
/** Seeded defaults that were replaced — a stored value equal to one of these was never customized. */
const OLD_TITLES: Record<string, string[]> = {
  weekend: ["what's happening this weekend"],
  garage_sales: ["garage sales & community markets"],
};
const OLD_SUBTITLES: Record<string, string[]> = {
  garage_sales: ["yard sales, rummage sales and markets coming up"],
};
const NEW_TITLES: Record<string, string> = { weekend: UPCOMING_EVENTS_TITLE, garage_sales: GARAGE_SALES_TITLE };
const NEW_SUBTITLES: Record<string, string> = { garage_sales: GARAGE_SALES_SUBTITLE };

/** Title to display: the new default when the stored title is empty or still the old seeded default; the admin's own title otherwise. */
export function sectionTitle(s: { type: string; title: string | null }) {
  const next = NEW_TITLES[s.type];
  if (!next) return s.title ?? "";
  const t = norm(s.title);
  return !t || OLD_TITLES[s.type]?.includes(t) ? next : s.title!;
}

/** Subtitle to display (same rule as sectionTitle; an empty subtitle stays empty). */
export function sectionSubtitle(s: { type: string; subtitle: string | null }) {
  const next = NEW_SUBTITLES[s.type];
  return next && OLD_SUBTITLES[s.type]?.includes(norm(s.subtitle)) ? next : s.subtitle;
}

// ───────────── Upcoming events ─────────────

const HORIZON_DAYS = 366;

/** Section limit → 3–4 cards (default 4). */
export function upcomingLimit(limit: number | null | undefined) {
  return Math.min(4, Math.max(3, limit || 4));
}

export type UpcomingEvent = Awaited<ReturnType<typeof nextOccurrences>>[number];

/**
 * Next eligible occurrence of every published, non-deleted event (one per event), soonest first.
 * In progress (start ≤ now < end) counts; an event without an end time follows the existing
 * expandOccurrences convention (eligible until its start time). Ended, draft, pending, rejected,
 * unpublished, archived and deleted events never appear.
 */
async function nextOccurrences(now: Date, excludeIds: string[]) {
  const to = new Date(now.getTime() + HORIZON_DAYS * 86400_000);
  const events = await db.event.findMany({
    where: { AND: [upcomingEventWhere(now), { startAt: { lte: to } }, excludeIds.length ? { id: { notIn: excludeIds } } : {}] },
    select: eventCardSelect,
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  // maxPerEvent = 1 → only the next occurrence that hasn't ended yet.
  return expandOccurrences(events, now, to, 1);
}

/**
 * Homepage Upcoming Events.
 * - All of T County: the next `limit` events countywide.
 * - A community: that community's next events; when fewer than 3, countywide events fill up to `limit`
 *   (shown under "Around T County" by CommunityGroups).
 * Admin-pinned ids (section featuredIds) are guaranteed a place when they have an upcoming occurrence;
 * every list is shown in chronological order. `excludeIds`: events already shown higher on the page.
 */
export async function getUpcomingEventsForHome(opts: { limit: number; community: string | null; featuredIds?: string[]; excludeIds?: string[]; now?: Date }) {
  const now = opts.now ?? new Date();
  const limit = upcomingLimit(opts.limit);
  const pins = (opts.featuredIds ?? []).filter((id) => !(opts.excludeIds ?? []).includes(id));
  const pool = await nextOccurrences(now, opts.excludeIds ?? []);
  const byTime = (a: UpcomingEvent, b: UpcomingEvent) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime();
  const pick = (list: UpcomingEvent[], n: number) => {
    const pinned = pins.map((id) => list.find((e) => e.id === id)).filter((e): e is UpcomingEvent => !!e).slice(0, n);
    const ids = new Set(pinned.map((e) => e.id));
    return [...pinned, ...list.filter((e) => !ids.has(e.id))].slice(0, n).sort(byTime);
  };
  if (!opts.community) return { items: pick(pool, limit), local: null, rest: null };
  const community = opts.community;
  const local = pick(pool.filter((e) => sameCity(e.city, community)), limit);
  const rest = local.length >= 3 ? [] : pick(pool.filter((e) => !sameCity(e.city, community)), limit - local.length);
  return { items: [...local, ...rest], local, rest };
}

// ───────────── Food trucks & garage sales availability ─────────────

/** Next 7 days in New York: now → end of today + 6 days. */
export function nextWeekWindow(now = new Date()) {
  const today = todayKey(now);
  const last = addDaysKey(today, 6);
  return { now, end: endOfNyDay(last), fromKey: today, toKey: last };
}

export type HomeAvailability = { foodTrucks: boolean; garageSales: boolean };

/**
 * Whether food trucks / garage sales have anything in the next 7 days for the visitor's scope:
 * the selected community only, or the whole county in the All of T County view.
 * Food trucks: public SCHEDULED stops of published trucks overlapping the window.
 * Garage sales: published sales running on at least one day of the window.
 */
export const getHomeAvailability = cache(async (community: string | null): Promise<HomeAvailability> => {
  const w = nextWeekWindow();
  const [stops, sales] = await Promise.all([
    db.foodTruckStop.count({ where: publicStopWhere({ start: w.now, end: w.end, city: community ?? undefined }) }),
    db.garageSale.count({
      where: { AND: [activeSaleWhere(w.now), overlapsRange({ from: w.fromKey, to: w.toKey }), community ? { city: { equals: community, mode: "insensitive" } } : {}] },
    }),
  ]);
  return { foodTrucks: stops > 0, garageSales: sales > 0 };
});

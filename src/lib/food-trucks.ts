import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getBusinessEntitlements } from "./entitlements";
import { businessHref } from "./links";
import { fromDateInput, toDateInput } from "./utils";

/**
 * Food Truck Tracker helpers. A food truck is a Business with isFoodTruck; its
 * stops are FoodTruckStop rows. Schedules are what the truck *plans* — never
 * present a stop as "open" just because it's scheduled. Only `confirmedAt`
 * (set by the truck owner for that stop) means the truck confirmed it.
 *
 * All day math is America/New_York wall-clock time (DST-safe).
 */

const TZ = "America/New_York";
export const FOOD_TRUCK_LIMITS = {
  maxDurationHours: 16,
  maxDaysAhead: 366,
  maxSeriesWeeks: 12,
  maxSeriesStops: 60,
  maxUpcomingPerTruck: 300,
  locationName: 120,
  address: 200,
  city: 80,
  notes: 500,
  cuisine: 60,
} as const;
/** No upcoming stops and no schedule change for this long → "Outdated" in admin. */
export const OUTDATED_DAYS = 14;

// ───────────── New York day math ─────────────

/** yyyy-mm-dd of `d` in New York. */
export function nyDateKey(d: Date) {
  return toDateInput(d).slice(0, 10);
}

/** Midnight (New York) of a yyyy-mm-dd key, as an instant. */
export function nyMidnight(key: string): Date {
  return fromDateInput(`${key}T00:00`)!;
}

/** Add calendar days to a yyyy-mm-dd key. */
export function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a yyyy-mm-dd key. */
export function weekdayOfKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export type TruckWindow = "today" | "tomorrow" | "weekend" | "upcoming";
export const TRUCK_WINDOWS: { key: TruckWindow; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This Weekend" },
  { key: "upcoming", label: "Upcoming" },
];

/**
 * Time window for a tab. Stops overlap the window when startAt < end and endAt > start.
 * "start" is never earlier than now, so finished stops never show.
 */
export function truckWindow(w: TruckWindow, now = new Date()): { start: Date; end: Date } {
  const today = nyDateKey(now);
  const dayStart = (k: string) => nyMidnight(k);
  switch (w) {
    case "today":
      return { start: now, end: dayStart(addDaysKey(today, 1)) };
    case "tomorrow":
      return { start: dayStart(addDaysKey(today, 1)), end: dayStart(addDaysKey(today, 2)) };
    case "weekend": {
      const wd = weekdayOfKey(today); // Fri(5) Sat(6) Sun(0) = already the weekend
      const toFri = wd === 0 ? -2 : wd === 6 ? -1 : 5 - wd;
      const fri = addDaysKey(today, toFri);
      const start = dayStart(fri);
      return { start: start > now ? start : now, end: dayStart(addDaysKey(fri, 3)) };
    }
    default:
      return { start: now, end: dayStart(addDaysKey(today, FOOD_TRUCK_LIMITS.maxDaysAhead)) };
  }
}

// ───────────── Public queries ─────────────

export const publicTruckWhere = (extra: Prisma.BusinessWhereInput = {}): Prisma.BusinessWhereInput => ({
  isFoodTruck: true, status: "PUBLISHED", deletedAt: null, ...extra,
});

/** Publicly visible stops: published truck, SCHEDULED (not cancelled), not finished. */
export function publicStopWhere(opts: { start?: Date; end?: Date; city?: string; cuisine?: string; businessId?: string } = {}): Prisma.FoodTruckStopWhereInput {
  const start = opts.start ?? new Date();
  return {
    status: "SCHEDULED",
    endAt: { gt: start },
    ...(opts.end ? { startAt: { lt: opts.end } } : {}),
    ...(opts.city ? { city: { equals: opts.city, mode: "insensitive" } } : {}),
    ...(opts.businessId ? { businessId: opts.businessId } : {}),
    business: publicTruckWhere(opts.cuisine ? { cuisine: { equals: opts.cuisine, mode: "insensitive" } } : {}),
  };
}

export const truckSelect = {
  id: true, slug: true, name: true, logoUrl: true, coverUrl: true, cuisine: true, menuUrl: true, website: true, socials: true, city: true, updatedAt: true,
} satisfies Prisma.BusinessSelect;

export const stopSelect = {
  id: true, startAt: true, endAt: true, locationName: true, address: true, city: true, notes: true, confirmedAt: true, updatedAt: true,
  business: { select: truckSelect },
} satisfies Prisma.FoodTruckStopSelect;

export type PublicStop = Prisma.FoodTruckStopGetPayload<{ select: typeof stopSelect }>;
export type TruckInfo = Prisma.BusinessGetPayload<{ select: typeof truckSelect }>;

export function getPublicStops(opts: { window: TruckWindow; city?: string; cuisine?: string; limit?: number; now?: Date }) {
  const { start, end } = truckWindow(opts.window, opts.now);
  return db.foodTruckStop.findMany({
    where: publicStopWhere({ start, end, city: opts.city, cuisine: opts.cuisine }),
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: opts.limit ?? 200,
    select: stopSelect,
  });
}

/** "Last schedule update" per truck = newest stop change, falling back to the listing's own update time. */
export async function lastScheduleUpdates(trucks: { id: string; updatedAt: Date }[]) {
  const out = new Map<string, Date>();
  if (!trucks.length) return out;
  const rows = await db.foodTruckStop.groupBy({ by: ["businessId"], where: { businessId: { in: trucks.map((t) => t.id) } }, _max: { updatedAt: true } });
  const byId = new Map(rows.map((r) => [r.businessId, r._max.updatedAt]));
  for (const t of trucks) out.set(t.id, byId.get(t.id) ?? t.updatedAt);
  return out;
}

/**
 * Menu link per truck: its own menuUrl, otherwise the profile's menu section when the
 * truck has a Premium menu (menus only display publicly with Premium).
 */
export async function menuLinks(trucks: { id: string; slug: string; menuUrl: string | null }[]) {
  const out = new Map<string, { href: string; external: boolean }>();
  const need: string[] = [];
  for (const t of trucks) {
    const u = safeHttpUrl(t.menuUrl);
    if (u) out.set(t.id, { href: u, external: true });
    else need.push(t.id);
  }
  if (need.length) {
    const withMenus = await db.businessOfferingSection.findMany({
      where: { businessId: { in: need }, kind: "MENU", items: { some: {} } }, distinct: ["businessId"], select: { businessId: true },
    });
    for (const { businessId } of withMenus) {
      const { entitlements } = await getBusinessEntitlements(businessId);
      const t = trucks.find((x) => x.id === businessId)!;
      if (entitlements.servicesMenus) out.set(businessId, { href: `${businessHref(t)}#offerings-menu`, external: false });
    }
  }
  return out;
}

// ───────────── Formatting ─────────────

/** "11am", "2:30pm" (New York). */
export function shortTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
    .format(d).replace(":00", "").replace(/\s?AM$/i, "am").replace(/\s?PM$/i, "pm");
}

/** "11am–2pm" */
export function timeRange(start: Date, end: Date) {
  return `${shortTime(start)}–${shortTime(end)}`;
}

/** Honest status label: never "Open now" from a schedule alone. */
export function stopLabel(s: { startAt: Date; endAt: Date }, now = new Date()) {
  if (s.startAt <= now && s.endAt > now) return `Scheduled now · until ${shortTime(s.endAt)}`;
  return `Scheduled ${timeRange(s.startAt, s.endAt)}`;
}

/** "Today", "Tomorrow" or "Saturday, Nov 14". */
export function dayHeading(key: string, now = new Date()) {
  const today = nyDateKey(now);
  const date = nyMidnight(key);
  const long = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" }).format(date);
  if (key === today) return `Today · ${long}`;
  if (key === addDaysKey(today, 1)) return `Tomorrow · ${long}`;
  return long;
}

export function groupByDay<T extends { startAt: Date; endAt: Date }>(stops: T[], now = new Date()) {
  const groups = new Map<string, T[]>();
  for (const s of stops) {
    // A stop already underway (started before today) is listed under today.
    const key = nyDateKey(s.startAt < now && s.endAt > now ? now : s.startAt);
    const arr = groups.get(key);
    if (arr) arr.push(s); else groups.set(key, [s]);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, label: dayHeading(key, now), items }));
}

/** Plain Google Maps search link (no API key, no embed). */
export function directionsHref(s: { locationName: string; address: string | null; city: string | null }) {
  const q = [s.address ? null : s.locationName, s.address, s.city, "OH"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function safeHttpUrl(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function facebookUrl(socials: unknown) {
  const fb = socials && typeof socials === "object" ? (socials as Record<string, unknown>).facebook : null;
  return typeof fb === "string" ? safeHttpUrl(fb) : null;
}

/** A stop can be confirmed on its day (New York) until it ends, while it isn't cancelled. */
export function canConfirm(s: { startAt: Date; endAt: Date; status: string }, now = new Date()) {
  if (s.status !== "SCHEDULED" || s.endAt <= now) return false;
  const today = nyDateKey(now);
  return nyDateKey(s.startAt) === today || s.startAt <= now;
}

/** Site search: food trucks by name or type of food, with each truck's next public stop. */
export async function searchFoodTrucks(q: string, limit = 8, opts: { city?: string | null; skip?: number } = {}) {
  const c = { contains: q, mode: "insensitive" as const };
  // Community: the truck's home city or an upcoming public stop there.
  const cityWhere: Prisma.BusinessWhereInput = opts.city
    ? { OR: [{ city: { equals: opts.city, mode: "insensitive" } }, { foodTruckStops: { some: publicStopWhere({ city: opts.city }) } }] }
    : {};
  const where = publicTruckWhere({ AND: [{ OR: [{ name: c }, { cuisine: c }] }, cityWhere] });
  const [count, rows] = await Promise.all([
    db.business.count({ where }),
    limit > 0 ? db.business.findMany({ where, orderBy: { name: "asc" }, skip: opts.skip ?? 0, take: limit, select: truckSelect }) : Promise.resolve([]),
  ]);
  const next = rows.length
    ? await db.foodTruckStop.findMany({ where: { ...publicStopWhere(), businessId: { in: rows.map((r) => r.id) } }, orderBy: { startAt: "asc" }, distinct: ["businessId"], select: { businessId: true, startAt: true, endAt: true, locationName: true } })
    : [];
  const byId = new Map(next.map((n) => [n.businessId, n]));
  return { count, rows: rows.map((r) => ({ ...r, next: byId.get(r.id) ?? null })) };
}

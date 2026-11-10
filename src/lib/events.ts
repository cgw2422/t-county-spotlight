import type { Prisma } from "@/generated/prisma/client";

export type Recurrence = { freq: "DAILY" | "WEEKLY" | "MONTHLY"; interval?: number; until?: string; count?: number };

export type Occurrence<T> = T & { occurrenceStart: Date; occurrenceEnd: Date | null };

type EventLike = { startAt: Date; endAt: Date | null; recurrence: unknown };

import { fromDateInput, toDateInput } from "./utils";

/** Adds days/weeks/months in America/New_York wall-clock time (DST-safe). */
function addInterval(d: Date, freq: Recurrence["freq"], n: number) {
  const local = toDateInput(d); // yyyy-mm-ddThh:mm in New York time
  const [datePart, timePart] = local.split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, day));
  if (freq === "DAILY") x.setUTCDate(x.getUTCDate() + n);
  else if (freq === "WEEKLY") x.setUTCDate(x.getUTCDate() + 7 * n);
  else x.setUTCMonth(x.getUTCMonth() + n);
  const next = `${x.toISOString().slice(0, 10)}T${timePart}`;
  return fromDateInput(next) ?? x;
}

/**
 * Expands recurring events into occurrences within [from, to] without
 * storing duplicate rows. Non-recurring events yield a single occurrence.
 */
export function expandOccurrences<T extends EventLike>(events: T[], from: Date, to: Date, maxPerEvent = 60): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const e of events) {
    const duration = e.endAt ? e.endAt.getTime() - e.startAt.getTime() : null;
    const rec = e.recurrence as Recurrence | null;
    if (!rec || !rec.freq) {
      const end = e.endAt ?? e.startAt;
      if (end >= from && e.startAt <= to) out.push({ ...e, occurrenceStart: e.startAt, occurrenceEnd: e.endAt });
      continue;
    }
    const until = rec.until ? new Date(rec.until) : null;
    const interval = Math.max(1, rec.interval || 1);
    let cur = new Date(e.startAt);
    let i = 0;
    let n = 0;
    while (cur <= to && n < maxPerEvent && i < 2000) {
      if (until && cur > until) break;
      if (rec.count && i >= rec.count) break;
      const curEnd = duration != null ? new Date(cur.getTime() + duration) : null;
      if ((curEnd ?? cur) >= from) {
        out.push({ ...e, occurrenceStart: cur, occurrenceEnd: curEnd });
        n++;
      }
      i++;
      cur = addInterval(e.startAt, rec.freq, interval * i);
    }
  }
  return out.sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime());
}

/** Events that could produce an occurrence on/after `from`. */
export function upcomingEventWhere(from = new Date()): Prisma.EventWhereInput {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    OR: [
      { startAt: { gte: from } },
      { endAt: { gte: from } },
      { recurrence: { not: { equals: null } } as Prisma.JsonNullableFilter<"Event"> },
    ],
  };
}

export function describeRecurrence(r: unknown) {
  const rec = r as Recurrence | null;
  if (!rec?.freq) return null;
  const n = rec.interval && rec.interval > 1 ? rec.interval : 1;
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month" }[rec.freq];
  let s = n === 1 ? `Repeats every ${unit}` : `Repeats every ${n} ${unit}s`;
  if (rec.until) s += ` until ${new Date(rec.until).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" })}`;
  return s;
}

// ───────────── Discovery windows (America/New_York, DST-safe) ─────────────
// Each window is computed from New York calendar days/wall-clock times and then
// converted to instants with fromDateInput, so DST changes between "now" and the
// window boundaries are handled correctly. Windows never start before `now`
// (past events are never "upcoming"); events still in progress overlap the window.

export type TimeWindow = { start: Date; end: Date };

const nyKey = (d: Date) => toDateInput(d).slice(0, 10);
const nyHour = (d: Date) => Number(toDateInput(d).slice(11, 13));
function addDays(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** NY wall-clock time → instant. Re-checks the result so DST-change days land on the right hour. */
function at(key: string, hhmm = "00:00") {
  const want = `${key}T${hhmm}`;
  const d = fromDateInput(want)!;
  const got = toDateInput(d);
  if (got === want) return d;
  const wall = (v: string) => Date.parse(`${v}:00Z`);
  return new Date(d.getTime() - (wall(got) - wall(want)));
}
/** Last millisecond of a New York calendar day. */
const endOf = (key: string) => new Date(at(addDays(key, 1)).getTime() - 1);
const clampStart = (start: Date, now: Date) => (start < now ? now : start);

/** Now → end of today (NY). */
export function todayWindow(now = new Date()): TimeWindow {
  return { start: now, end: endOf(nyKey(now)) };
}

/**
 * Tonight: 5 pm today → 3 am tomorrow (NY). Between midnight and 3 am it is the
 * night still in progress. `evening` is the unclamped 5 pm start of that night.
 */
export function tonightWindow(now = new Date()): TimeWindow & { evening: Date } {
  const today = nyKey(now);
  if (nyHour(now) < 3) return { start: now, end: at(today, "03:00"), evening: at(addDays(today, -1), "17:00") };
  const evening = at(today, "17:00");
  return { start: clampStart(evening, now), end: at(addDays(today, 1), "03:00"), evening };
}

/** Tomorrow, midnight to midnight (NY). */
export function tomorrowWindow(now = new Date()): TimeWindow {
  const t = addDays(nyKey(now), 1);
  return { start: at(t), end: endOf(t) };
}

/** Now → last day of the current month (NY). */
export function monthWindow(now = new Date()): TimeWindow {
  const [y, m] = nyKey(now).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start: now, end: endOf(last) };
}

/** Weekend window (Fri 00:00 → Sun 23:59 America/New_York) for "This Weekend". */
export function weekendWindow(now = new Date()) {
  const today = nyKey(now);
  const [y, m, d] = today.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun .. 6 Sat
  const fri = addDays(today, day === 0 ? -2 : day === 6 ? -1 : 5 - day);
  return { start: clampStart(at(fri), now), end: endOf(addDays(fri, 2)) };
}

/**
 * "Tonight" keeps occurrences that start in the window, plus timed events that
 * are still going well into the evening (ending 7 pm or later). All-day events
 * and afternoon events that wrap up early are left out.
 */
export function isTonight(o: { occurrenceStart: Date; occurrenceEnd: Date | null; allDay?: boolean }, w: TimeWindow & { evening: Date }) {
  if (o.occurrenceStart >= w.start && o.occurrenceStart <= w.end) return true;
  if (o.allDay || !o.occurrenceEnd) return false;
  return o.occurrenceStart < w.start && o.occurrenceEnd >= w.start && o.occurrenceEnd.getTime() >= w.evening.getTime() + 2 * 3600_000;
}

// ───────────── Resident-friendly event attributes ─────────────

export const EVENT_TAGS = [
  { key: "family", label: "Family-friendly" },
  { key: "indoor", label: "Indoor" },
  { key: "outdoor", label: "Outdoor" },
  { key: "fundraiser", label: "Fundraiser" },
  { key: "church", label: "Church/ministry event" },
  { key: "music", label: "Live music" },
  { key: "food", label: "Food" },
  { key: "market", label: "Market/vendor event" },
] as const;
export type EventTag = (typeof EVENT_TAGS)[number]["key"];
const TAG_KEYS = new Set<string>(EVENT_TAGS.map((t) => t.key));

/** Keeps only known tag keys (deduped, in canonical order). */
export function parseEventTags(values: unknown[]): EventTag[] {
  const picked = new Set(values.map((v) => String(v)).filter((v) => TAG_KEYS.has(v)));
  return EVENT_TAGS.map((t) => t.key).filter((k) => picked.has(k));
}

export function eventTagLabel(key: string): string | null {
  return EVENT_TAGS.find((t) => t.key === key)?.label ?? null;
}

/** Plain-text vendor information (markets, craft shows), max 2000 characters. */
export const VENDOR_INFO_MAX = 2000;

/** Public attribute filters on /events/ — each maps to category slugs, tags and/or organization kind. */
export const EVENT_ATTRIBUTE_FILTERS = [
  { key: "family", label: "Family-friendly", tags: ["family"], categories: ["family-kids"] },
  { key: "music", label: "Live music", tags: ["music"], categories: ["live-music"] },
  { key: "festivals", label: "Festivals", tags: [], categories: ["festivals-fairs"] },
  { key: "food", label: "Food", tags: ["food"], categories: ["food-drink"] },
  { key: "markets", label: "Markets", tags: ["market"], categories: ["markets"] },
  { key: "church", label: "Church activities", tags: ["church"], categories: [], orgKind: "CHURCH" },
  { key: "fundraisers", label: "Fundraisers", tags: ["fundraiser"], categories: [] },
  { key: "indoor", label: "Indoor", tags: ["indoor"], categories: [] },
  { key: "outdoor", label: "Outdoor", tags: ["outdoor"], categories: ["sports-outdoors"] },
] as const satisfies readonly { key: string; label: string; tags: readonly string[]; categories: readonly string[]; orgKind?: "CHURCH" }[];

/** Where clause for one attribute filter (OR of its tag/category/organization conditions). */
export function attributeWhere(key: string): Prisma.EventWhereInput | null {
  const f = EVENT_ATTRIBUTE_FILTERS.find((x) => x.key === key);
  if (!f) return null;
  const or: Prisma.EventWhereInput[] = [];
  if (f.tags.length) or.push({ tags: { hasSome: [...f.tags] } });
  if (f.categories.length) or.push({ category: { slug: { in: [...f.categories] } } });
  if ("orgKind" in f && f.orgKind) or.push({ organization: { kind: f.orgKind } });
  return { OR: or };
}

/** Google Maps search link (no API key) for an event's place. */
export function directionsUrl(e: { locationName?: string | null; address?: string | null; city?: string | null }) {
  const q = [e.locationName, e.address, e.city, e.city ? "OH" : null].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** "Free", the price text, or null when unknown. */
export function admissionLabel(e: { isFree?: boolean | null; price?: string | null }) {
  if (e.isFree) return "Free";
  return e.price?.trim() || null;
}

export function googleCalendarUrl(e: { title: string; occurrenceStart: Date; occurrenceEnd: Date | null; locationName?: string | null; address?: string | null; description?: string | null }, url: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = e.occurrenceEnd ?? new Date(e.occurrenceStart.getTime() + 3600_000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${fmt(e.occurrenceStart)}/${fmt(end)}`,
    location: [e.locationName, e.address].filter(Boolean).join(", "),
    details: url,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

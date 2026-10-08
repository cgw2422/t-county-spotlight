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

/** Weekend window (Fri 00:00 → Sun 23:59 America/New_York) for "This Weekend". */
export function weekendWindow(now = new Date()) {
  const ny = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = now.getTime() - ny.getTime();
  const day = ny.getDay(); // 0 Sun .. 6 Sat
  const start = new Date(ny);
  start.setHours(0, 0, 0, 0);
  if (day >= 1 && day <= 4) start.setDate(start.getDate() + (5 - day));
  else if (day === 6) start.setDate(start.getDate() - 1);
  else if (day === 0) start.setDate(start.getDate() - 2);
  const end = new Date(start);
  end.setDate(end.getDate() + 2);
  end.setHours(23, 59, 59, 999);
  const s = new Date(Math.max(start.getTime() + offset, now.getTime()));
  return { start: s, end: new Date(end.getTime() + offset) };
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

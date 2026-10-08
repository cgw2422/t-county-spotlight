export type HoursRow = { day: string; open?: string; close?: string; closed?: boolean };

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_NAMES: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
const SCHEMA_DAYS: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

function dayKey(d: string) {
  const k = d.slice(0, 3);
  return (k.charAt(0).toUpperCase() + k.slice(1).toLowerCase()) as (typeof DAYS)[number];
}

/** Validates and normalizes the Business.hours JSON. Returns [] when absent or malformed. */
export function parseHours(raw: unknown): HoursRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: HoursRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.day !== "string") continue;
    const day = dayKey(o.day);
    if (!DAYS.includes(day)) continue;
    const valid = (t: unknown) => typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t);
    rows.push({ day, open: valid(o.open) ? (o.open as string) : undefined, close: valid(o.close) ? (o.close as string) : undefined, closed: !!o.closed || !valid(o.open) || !valid(o.close) });
  }
  // Monday-first display order
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return rows.sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
}

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export function format12(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 && h < 24 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${ap}` : `${hh} ${ap}`;
}

/** Current weekday + minutes in America/New_York. */
export function nyNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(g("hour")) % 24;
  return { day: g("weekday") as (typeof DAYS)[number], minutes: hour * 60 + Number(g("minute")) };
}

/** Open-now status computed in America/New_York (handles hours past midnight). Null when unknown. */
export function openStatus(rows: HoursRow[], now = new Date()): { open: boolean; label: string } | null {
  if (!rows.length) return null;
  const { day, minutes } = nyNow(now);
  const idx = DAYS.indexOf(day);
  const today = rows.find((r) => r.day === day);
  const yesterday = rows.find((r) => r.day === DAYS[(idx + 6) % 7]);
  // Overnight hours from yesterday (e.g. 18:00–02:00)
  if (yesterday && !yesterday.closed && yesterday.open && yesterday.close && toMin(yesterday.close) <= toMin(yesterday.open) && minutes < toMin(yesterday.close)) {
    return { open: true, label: `Open until ${format12(yesterday.close)}` };
  }
  if (today && !today.closed && today.open && today.close) {
    const o = toMin(today.open), c = toMin(today.close);
    const overnight = c <= o;
    if (minutes >= o && (overnight || minutes < c)) return { open: true, label: `Open until ${format12(today.close)}` };
    if (minutes < o) return { open: false, label: `Closed · Opens ${format12(today.open)}` };
  }
  for (let i = 1; i <= 7; i++) {
    const d = DAYS[(idx + i) % 7];
    const r = rows.find((x) => x.day === d);
    if (r && !r.closed && r.open) return { open: false, label: `Closed · Opens ${i === 1 ? "tomorrow" : DAY_NAMES[d]} ${format12(r.open)}` };
  }
  return { open: false, label: "Closed" };
}

export function openingHoursSpec(rows: HoursRow[]) {
  return rows.filter((r) => !r.closed && r.open && r.close).map((r) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: `https://schema.org/${SCHEMA_DAYS[r.day]}`,
    opens: r.open!.padStart(5, "0"),
    closes: r.close!.padStart(5, "0"),
  }));
}

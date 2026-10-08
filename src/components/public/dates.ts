import { fromDateInput } from "@/lib/utils";

const TZ = "America/New_York";

/** "YYYY-MM-DD" for a moment, in America/New_York. */
export function nyDateKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Start of a NY calendar day (as a UTC instant). */
export function startOfNyDay(key: string) {
  return fromDateInput(`${key}T00:00`)!;
}

/** End of a NY calendar day. */
export function endOfNyDay(key: string) {
  return new Date(startOfNyDay(addDaysKey(key, 1)).getTime() - 1);
}

export function isDateKey(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function isMonthKey(s: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthInfo(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  return { first, last: `${month}-${String(days).padStart(2, "0")}`, days, firstWeekday, prev, next, label };
}

/**
 * Garage sale constants and pure helpers, safe for client components.
 * Server queries live in `src/lib/garage-sales.ts`.
 */

export const GARAGE_SALE_TYPES = [
  { value: "GARAGE", label: "Garage sale" },
  { value: "YARD", label: "Yard sale" },
  { value: "MULTI_FAMILY", label: "Multi-family sale" },
  { value: "ESTATE", label: "Estate sale" },
  { value: "CHURCH_RUMMAGE", label: "Church / rummage sale" },
  { value: "COMMUNITY_WIDE", label: "Community-wide sale" },
  { value: "OTHER", label: "Other sale" },
] as const;

export type GarageSaleTypeValue = (typeof GARAGE_SALE_TYPES)[number]["value"];

export function saleTypeLabel(t: string) {
  return GARAGE_SALE_TYPES.find((x) => x.value === t)?.label ?? "Sale";
}

export const GARAGE_SALE_CATEGORIES = [
  { key: "furniture", label: "Furniture" },
  { key: "clothing", label: "Clothing" },
  { key: "kids-baby", label: "Kids & baby" },
  { key: "tools", label: "Tools" },
  { key: "household", label: "Household" },
  { key: "electronics", label: "Electronics" },
  { key: "antiques", label: "Antiques & collectibles" },
  { key: "books-media", label: "Books & media" },
  { key: "sports-outdoors", label: "Sports & outdoors" },
  { key: "crafts", label: "Crafts" },
  { key: "other", label: "Other" },
] as const;

export function categoryLabel(key: string) {
  return GARAGE_SALE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export const GARAGE_SALE_LIMITS = {
  maxPhotos: 4,
  maxPhotoBytes: 8 * 1024 * 1024,
  maxSpanDays: 7,
  maxDaysAhead: 60,
  maxLinksInDescription: 1,
  minSecondsOnForm: 4,
};

export type PublicLocationInput = { addressVisibility: string; address?: string | null; generalLocation?: string | null; city?: string | null; zip?: string | null };

/**
 * What the public may see. EXACT → street address + city; GENERAL → the
 * general location + city only. The private street address is never returned
 * for GENERAL sales.
 */
export function publicLocation(s: PublicLocationInput) {
  const city = s.city?.trim() || "";
  if (s.addressVisibility === "EXACT" && s.address) return { line: s.address, city, exact: true };
  return { line: s.generalLocation?.trim() || "", city, exact: false };
}

/** Google Maps search link built only from public location fields. */
export function directionsUrl(s: PublicLocationInput) {
  const loc = publicLocation(s);
  const q = [loc.line, loc.city ? `${loc.city}, OH` : "Tuscarawas County, OH", loc.exact ? s.zip : null].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** "08:00" → "8 AM", "13:30" → "1:30 PM". */
export function formatClock(hhmm: string) {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === "00" ? `${h12} ${suffix}` : `${h12}:${m[2]} ${suffix}`;
}

export function formatHours(start: string, end: string) {
  return `${formatClock(start)}–${formatClock(end)}`;
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...o }).format(d);

/** "Sat, Nov 14" or "Fri, Nov 13 – Sun, Nov 15". */
export function formatSaleDates(start: Date, end: Date) {
  const a = fmt(start, { weekday: "short", month: "short", day: "numeric" });
  const b = fmt(end, { weekday: "short", month: "short", day: "numeric" });
  return a === b ? a : `${a} – ${b}`;
}

/** Counts links in free text (http(s)://, www., or bare domains). */
export function countLinks(text: string) {
  return (text.match(/(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|info|biz|ru|xyz|io|co|us|shop|top)\b/gi) ?? []).length;
}

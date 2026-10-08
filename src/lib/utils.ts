export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

const TZ = "America/New_York";

export function formatDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(new Date(d));
}

export function formatTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  return `${formatDate(d, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${formatTime(d)}`;
}

export function formatMoney(cents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function stripHtml(html: string | null | undefined) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“")
    .replace(/&#8221;|&rdquo;/g, "”")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8230;|&hellip;/g, "…")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(text: string, len = 160) {
  if (text.length <= len) return text;
  return text.slice(0, len).replace(/\s+\S*$/, "") + "…";
}

export function absoluteUrl(path = "/") {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function toDateInput(d: Date | null | undefined) {
  if (!d) return "";
  // Local (America/New_York) yyyy-mm-ddThh:mm for <input type="datetime-local">
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** Parse a datetime-local value as America/New_York time. */
export function fromDateInput(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  const asUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // Determine NY offset at that instant
  const probe = new Date(asUtc);
  const nyStr = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const off = nyStr.match(/GMT([+-]\d+)(?::(\d+))?/);
  const offsetMin = off ? parseInt(off[1]) * 60 + (off[2] ? Math.sign(parseInt(off[1])) * parseInt(off[2]) : 0) : -300;
  return new Date(asUtc - offsetMin * 60_000);
}

export const TUSCARAWAS_CITIES = [
  "New Philadelphia", "Dover", "Uhrichsville", "Dennison", "Newcomerstown", "Gnadenhutten",
  "Sugarcreek", "Strasburg", "Bolivar", "Zoar", "Baltic", "Port Washington", "Mineral City",
  "Midvale", "Roswell", "Stone Creek", "Tuscarawas", "Barnhill", "Ragersville", "Gilmore",
  "Zoarville", "Parral", "Bakersville", "Sandyville", "Shanesville", "Somerdale", "Trenton",
];

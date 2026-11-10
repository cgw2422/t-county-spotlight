/**
 * My T County: community + interest allowlists shared by server and client code.
 * Pure data and helpers only (no DB, no cookies) so client components can import it.
 */
import { TUSCARAWAS_CITIES, slugify } from "./utils";

/** The main towns, in the order residents expect to see them, then every other community. */
export const MAIN_COMMUNITIES = [
  "New Philadelphia", "Dover", "Uhrichsville", "Dennison", "Sugarcreek", "Newcomerstown", "Gnadenhutten", "Strasburg", "Bolivar",
] as const;

export const COMMUNITIES: { slug: string; name: string; main: boolean }[] = [
  ...MAIN_COMMUNITIES.map((name) => ({ slug: slugify(name), name, main: true })),
  ...TUSCARAWAS_CITIES.filter((c) => !(MAIN_COMMUNITIES as readonly string[]).includes(c))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ slug: slugify(name), name, main: false })),
];

/** Value meaning "All of Tuscarawas County" (stored as null on the account). */
export const ALL_COUNTY = "all";
export const ALL_COUNTY_LABEL = "All of Tuscarawas County";
export const ALL_COUNTY_SHORT = "All of T County";

/** Plain, non-sensitive cookies (readable by client code on purpose). */
export const COMMUNITY_COOKIE = "tct_community"; // community slug or "all"
export const SCOPE_COOKIE = "tct_scope"; // "all" = temporarily show the whole county
export const PROMPT_DISMISSED_COOKIE = "tct_cp_dismissed"; // "1" after "Not now"
export const COOKIE_MAX_AGE = 365 * 24 * 3600;

/** Guest extras (additional communities, interests) live only in this browser. */
export const GUEST_PREFS_KEY = "tct_prefs_v1";

const BY_SLUG = new Map(COMMUNITIES.map((c) => [c.slug, c]));
const BY_NAME = new Map(COMMUNITIES.map((c) => [c.name.toLowerCase(), c]));

/** Accepts a community slug or name (any case). Returns the canonical name, or null when unknown. */
export function communityName(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return (BY_SLUG.get(v) ?? BY_NAME.get(v))?.name ?? null;
}

export function communitySlug(name: string | null | undefined): string | null {
  const n = communityName(name);
  return n ? slugify(n) : null;
}

/** Validated, deduped list of community names (max 8), excluding `exclude`. */
export function cleanCommunities(values: unknown, exclude?: string | null): string[] {
  const arr = Array.isArray(values) ? values : [];
  const out: string[] = [];
  for (const v of arr) {
    const n = typeof v === "string" ? communityName(v) : null;
    if (n && n !== exclude && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 8);
}

/**
 * Interests ("favorite categories"). `attr` is an /events/ attribute filter key
 * (EVENT_ATTRIBUTE_FILTERS) and `category` an event category slug, used for the
 * "Picked for you" strip; `href` is where the interest chip links.
 */
export const INTERESTS = [
  { key: "events-family", label: "Family-friendly events", attr: "family", href: "/events/?attr=family" },
  { key: "live-music", label: "Live music", attr: "music", href: "/events/?attr=music" },
  { key: "food-drink", label: "Food & drink", attr: "food", href: "/events/?attr=food" },
  { key: "markets", label: "Markets & craft shows", attr: "markets", href: "/events/?attr=markets" },
  { key: "festivals", label: "Festivals & fairs", attr: "festivals", href: "/events/?attr=festivals" },
  { key: "outdoors", label: "Outdoors", attr: "outdoor", href: "/events/?attr=outdoor" },
  { key: "faith", label: "Church & faith", attr: "church", href: "/events/?attr=church" },
  { key: "arts-culture", label: "Arts & culture", category: "arts-culture", href: "/events/?category=arts-culture" },
  { key: "sports", label: "Sports", category: "sports-outdoors", href: "/events/?category=sports-outdoors" },
  { key: "fundraisers", label: "Fundraisers", attr: "fundraisers", href: "/events/?attr=fundraisers" },
  { key: "volunteering", label: "Volunteering", href: "/gives/volunteer/" },
  { key: "shopping-local", label: "Shopping local", href: "/businesses/" },
  { key: "specials", label: "Local specials", href: "/specials/" },
  { key: "food-trucks", label: "Food trucks", href: "/food-trucks/" },
  { key: "garage-sales", label: "Garage sales", href: "/garage-sales/" },
] as const satisfies readonly { key: string; label: string; href: string; attr?: string; category?: string }[];

export type InterestKey = (typeof INTERESTS)[number]["key"];
const INTEREST_KEYS = new Set<string>(INTERESTS.map((i) => i.key));

/** Validated, deduped interest keys in canonical order. */
export function cleanInterests(values: unknown): InterestKey[] {
  const picked = new Set((Array.isArray(values) ? values : []).filter((v): v is string => typeof v === "string" && INTEREST_KEYS.has(v)));
  return INTERESTS.map((i) => i.key).filter((k) => picked.has(k));
}

export function interestByKey(key: string) {
  return INTERESTS.find((i) => i.key === key) ?? null;
}

/** Guest preferences stored in localStorage (never sent anywhere except the one-time merge on sign-in). */
export type GuestPrefs = { extraCommunities: string[]; interests: InterestKey[]; updatedAt?: number };

export function parseGuestPrefs(raw: string | null | undefined): GuestPrefs {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== "object") return { extraCommunities: [], interests: [] };
    return { extraCommunities: cleanCommunities(v.extraCommunities), interests: cleanInterests(v.interests), updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : undefined };
  } catch {
    return { extraCommunities: [], interests: [] };
  }
}

/** Lowercased city match (event/stop/sale/business cities are free text). */
export function sameCity(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Community-first ordering (sort, never filter): items in `communities[0]` come
 * first, then the other listed communities, then everything else — each group
 * keeps its original order.
 */
export function prioritizeByCommunity<T>(items: T[], cityOf: (x: T) => string | null | undefined, communities: (string | null | undefined)[]): T[] {
  const list = communities.filter((c): c is string => !!c).map((c) => c.toLowerCase());
  if (!list.length) return items;
  const rank = (x: T) => {
    const c = cityOf(x)?.trim().toLowerCase();
    const i = c ? list.indexOf(c) : -1;
    return i === -1 ? list.length : i;
  };
  return items.map((x, i) => ({ x, i, r: rank(x) })).sort((a, b) => a.r - b.r || a.i - b.i).map((v) => v.x);
}

/**
 * Splits a list into "In {community}" and "Around T County" groups. Local items
 * fill up to `limit`; countywide items always stay visible (at least
 * `minRest`, or the full limit when nothing local is listed).
 */
export function splitByCommunity<T>(items: T[], cityOf: (x: T) => string | null | undefined, community: string, limit: number, minRest = 2) {
  const local = items.filter((x) => sameCity(cityOf(x), community)).slice(0, limit);
  const restAll = items.filter((x) => !sameCity(cityOf(x), community));
  const restCount = local.length ? Math.max(minRest, limit - local.length) : limit;
  return { local, rest: restAll.slice(0, restCount) };
}

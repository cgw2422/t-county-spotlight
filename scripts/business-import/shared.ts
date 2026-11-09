/**
 * Shared helpers for the one-time Tuscarawas County business import.
 * Data source: OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0).
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

export function getDb() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

export const OSM_LICENSE = "ODbL 1.0 — © OpenStreetMap contributors";

/** ZIP codes whose post offices are in (or primarily serve) Tuscarawas County. */
export const TUSC_ZIPS: Record<string, string> = {
  "43804": "Baltic", "43832": "Newcomerstown", "43837": "Port Washington", "43840": "Stone Creek",
  "44612": "Bolivar", "44621": "Dennison", "44622": "Dover", "44624": "Dundee", "44629": "Gnadenhutten",
  "44653": "Midvale", "44656": "Mineral City", "44663": "New Philadelphia", "44671": "Sandyville",
  "44678": "Somerdale", "44680": "Strasburg", "44681": "Sugarcreek", "44682": "Tuscarawas",
  "44683": "Uhrichsville", "44697": "Zoar", "44699": "Tippecanoe",
};

/** CSV columns, in order. Edit `approve` (yes/no) before importing. */
export const COLUMNS = [
  "approve", "review_flags", "town_note", "name", "category", "category_slug", "address", "city", "state", "zip", "phone", "website",
  "missing_fields", "duplicate_of", "duplicate_reason", "source", "source_id", "source_url", "license", "osm_type",
] as const;
export type Row = Record<(typeof COLUMNS)[number], string>;

// ── normalization ──
export const normName = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/['’`]/g, "")
    .replace(/\b(the|inc|llc|ltd|co|corp|company|incorporated)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
export const normPhone = (s?: string | null) => {
  const d = (s || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? d : "";
};
export const fmtPhone = (s?: string | null) => {
  const d = normPhone(s);
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (s || "").trim();
};
export const normWebsite = (s?: string | null) => {
  let v = (s || "").trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try { const u = new URL(v); return u.protocol.startsWith("http") ? u.toString() : ""; } catch { return ""; }
};
export const hostOf = (s?: string | null) => {
  try { return new URL(normWebsite(s)).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
};
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|twitter|x|tiktok|youtube|linkedin|yelp|google|goo)\.(com|gl)$/;
/** Website host usable for duplicate matching (social/aggregator hosts are shared by many businesses). */
export const matchHost = (s?: string | null) => { const h = hostOf(s); return h && !SOCIAL_HOSTS.test(h) ? h : ""; };
export const normAddr = (s?: string | null) =>
  (s || "").toLowerCase().replace(/\b(street)\b/g, "st").replace(/\b(avenue)\b/g, "ave").replace(/\b(road)\b/g, "rd")
    .replace(/\b(drive)\b/g, "dr").replace(/\b(boulevard)\b/g, "blvd").replace(/\b(north)\b/g, "n").replace(/\b(south)\b/g, "s")
    .replace(/\b(east)\b/g, "e").replace(/\b(west)\b/g, "w").replace(/[^a-z0-9]+/g, " ").trim();
export const normCity = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

// ── OSM tag → T County Connect business category ──
type Tags = Record<string, string>;
const CAT: [slug: string, label: string, test: (t: Tags) => boolean][] = [
  ["food-dining", "Food & Dining", (t) => /^(restaurant|cafe|bar|pub|fast_food|ice_cream|food_court|biergarten)$/.test(t.amenity || "") || /^(bakery|butcher|deli|confectionery|coffee|tea|wine|alcohol|beverages|cheese|farm|greengrocer|chocolate|pastry|seafood|spices)$/.test(t.shop || "") || /^(brewery|winery|distillery)$/.test(t.craft || "") || t.tourism === "winery"],
  ["lodging", "Lodging", (t) => /^(hotel|motel|guest_house|bed_and_breakfast|hostel|camp_site|caravan_site|chalet)$/.test(t.tourism || "")],
  ["automotive", "Automotive", (t) => /^(car|car_repair|car_parts|tyres|motorcycle|atv|truck|caravan)$/.test(t.shop || "") || /^(fuel|car_wash|car_rental|vehicle_inspection)$/.test(t.amenity || "")],
  ["health-wellness", "Health & Wellness", (t) => !!t.healthcare || /^(pharmacy|dentist|doctors|clinic|veterinary|hospital)$/.test(t.amenity || "") || /^(optician|medical_supply|hearing_aids|nutrition_supplements|chemist)$/.test(t.shop || "") || t.leisure === "fitness_centre"],
  ["beauty-personal-care", "Beauty & Personal Care", (t) => /^(hairdresser|beauty|cosmetics|massage|tattoo|nails|perfumery|piercing)$/.test(t.shop || "")],
  ["arts-entertainment", "Arts & Entertainment", (t) => /^(cinema|theatre|arts_centre|nightclub|events_venue|casino)$/.test(t.amenity || "") || /^(gallery|museum)$/.test(t.tourism || "") || /^(art|music|musical_instrument|books|games|video_games|craft|frame|photo)$/.test(t.shop || "") || /^(bowling_alley|amusement_arcade|escape_game)$/.test(t.leisure || "")],
  ["attractions-recreation", "Attractions & Recreation", (t) => /^(attraction|theme_park|zoo|aquarium|viewpoint)$/.test(t.tourism || "") || /^(golf_course|miniature_golf|water_park|sports_centre|marina|horse_riding|park_ride)$/.test(t.leisure || "") || /^(outdoor|sports|bicycle|fishing|hunting|boat)$/.test(t.shop || "")],
  ["photography-media", "Photography & Media", (t) => t.craft === "photographer" || t.shop === "photo_studio" || /^(newspaper|advertising_agency)$/.test(t.office || "")],
  ["home-services", "Home Services", (t) => /^(hardware|doityourself|furniture|interior_decoration|kitchen|bathroom_furnishing|flooring|garden_centre|appliance|lighting|paint|houseware|bed|curtain|carpet|tiles|trade|fireplace|swimming_pool|security)$/.test(t.shop || "") || /^(electrician|plumber|carpenter|roofer|hvac|painter|builder|gardener|landscaper|stonemason|window_construction|tiler|floorer|cleaning|locksmith|glaziery|insulation|metal_construction)$/.test(t.craft || "")],
  ["professional-services", "Professional Services", (t) => !!t.office || /^(bank|bureau_de_change|post_office|childcare|driving_school|coworking_space)$/.test(t.amenity || "") || /^(copyshop|dry_cleaning|laundry|funeral_directors|travel_agency|storage_rental|computer|mobile_phone|electronics|money_lender|pawnbroker)$/.test(t.shop || "") || /^(tailor|shoemaker|sign_maker|printer|key_cutter|upholsterer)$/.test(t.craft || "")],
  ["shopping", "Shopping", (t) => !!t.shop],
];
export function categorize(t: Tags): { slug: string; label: string } {
  for (const [slug, label, test] of CAT) if (test(t)) return { slug, label };
  return { slug: "", label: "" };
}

/**
 * National/regional chains: the business's own name IS a known brand (OSM brand
 * tags). Local businesses that merely carry a brand (e.g. "Parkway Honda", a
 * local dealer) are not flagged. Flagged for review — this is a local directory.
 */
export const isChain = (t: Tags) => {
  const brand = normName(t.brand || "");
  if (!brand || !(t["brand:wikidata"] || t.brand)) return false;
  const name = normName(t.name || "");
  return name === brand || name.startsWith(`${brand} `);
};

// ── duplicate detection against existing T County Connect businesses ──
export type ExistingBiz = { id: string; slug: string; name: string; city: string | null; phone: string | null; website: string | null; address: string | null; wpMeta: unknown };

export function indexExisting(existing: ExistingBiz[]) {
  const byName = new Map<string, ExistingBiz>(), byNameAny = new Map<string, ExistingBiz>(), byPhone = new Map<string, ExistingBiz>(), byHost = new Map<string, ExistingBiz>(), byAddr = new Map<string, ExistingBiz>(), bySource = new Map<string, ExistingBiz>();
  for (const b of existing) {
    byName.set(`${normName(b.name)}|${normCity(b.city)}`, b);
    if (!byNameAny.has(normName(b.name))) byNameAny.set(normName(b.name), b);
    if (normPhone(b.phone)) byPhone.set(normPhone(b.phone), b);
    if (matchHost(b.website)) byHost.set(matchHost(b.website), b);
    if (b.address) byAddr.set(`${normAddr(b.address)}|${normCity(b.city)}`, b);
    const src = (b.wpMeta as { import?: { sourceId?: string } } | null)?.import?.sourceId;
    if (src) bySource.set(src, b);
  }
  return { byName, byNameAny, byPhone, byHost, byAddr, bySource };
}

/** Shared corporate phones/websites only count when the name or town also agrees. */
function sameNameOrTown(r: { name: string; city: string }, b: ExistingBiz | undefined) {
  if (!b) return undefined;
  return normName(b.name) === normName(r.name) || (r.city && normCity(b.city) === normCity(r.city)) ? b : undefined;
}

export function findExisting(r: Pick<Row, "name" | "city" | "phone" | "website" | "address" | "source_id">, ix: ReturnType<typeof indexExisting>): { reason: string; biz: ExistingBiz } | null {
  const checks: [string, ExistingBiz | undefined][] = [
    ["already imported from this source record", r.source_id ? ix.bySource.get(r.source_id) : undefined],
    ["same name and city", ix.byName.get(`${normName(r.name)}|${normCity(r.city)}`) ?? (r.city ? undefined : ix.byNameAny.get(normName(r.name)))],
    ["same phone number", sameNameOrTown(r, normPhone(r.phone) ? ix.byPhone.get(normPhone(r.phone)) : undefined)],
    ["same website", sameNameOrTown(r, matchHost(r.website) ? ix.byHost.get(matchHost(r.website)) : undefined)],
    ["same street address", r.address ? ix.byAddr.get(`${normAddr(r.address)}|${normCity(r.city)}`) : undefined],
  ];
  const hit = checks.find(([, b]) => b);
  return hit ? { reason: hit[0], biz: hit[1]! } : null;
}

export const EXISTING_SELECT = { id: true, slug: true, name: true, city: true, phone: true, website: true, address: true, wpMeta: true } as const;

/** Approximate centers of Tuscarawas County towns, used only to SUGGEST a town for records with no address town (flagged for review). */
export const TOWN_CENTERS: [string, number, number][] = [
  ["New Philadelphia", 40.4898, -81.4457], ["Dover", 40.5206, -81.474], ["Uhrichsville", 40.3931, -81.3468],
  ["Dennison", 40.3934, -81.3332], ["Sugarcreek", 40.5031, -81.641], ["Strasburg", 40.5948, -81.5265],
  ["Bolivar", 40.6503, -81.4526], ["Zoar", 40.6142, -81.4226], ["Newcomerstown", 40.2723, -81.606],
  ["Gnadenhutten", 40.3584, -81.4343], ["Port Washington", 40.327, -81.5193], ["Mineral City", 40.6014, -81.3637],
  ["Baltic", 40.4406, -81.6987], ["Midvale", 40.4373, -81.3729], ["Tuscarawas", 40.3948, -81.4065],
  ["Stone Creek", 40.3973, -81.5604], ["Ragersville", 40.4342, -81.6207], ["Dundee", 40.5884, -81.6007],
];

/** Nearest town within `maxKm` of a point, or null. */
export function nearestTown(lat: number, lon: number, maxKm = 3) {
  let best: { town: string; km: number } | null = null;
  for (const [town, tlat, tlon] of TOWN_CENTERS) {
    const dLat = ((tlat - lat) * Math.PI) / 180, dLon = ((tlon - lon) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((tlat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const km = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (km <= maxKm && (!best || km < best.km)) best = { town, km };
  }
  return best;
}

/**
 * Same real-world place mapped twice in OpenStreetMap (e.g. a point and a
 * building outline)? Requires the same name, plus a matching street address,
 * or — when an address is missing on either side — the same town.
 * Different locations of a chain (different addresses) are kept separate.
 */
export function sameOsmPlace(a: Row, b: Row) {
  if (normName(a.name) !== normName(b.name)) return false;
  const aa = normAddr(a.address), ba = normAddr(b.address);
  if (aa && ba) return aa === ba;
  const ac = normCity(a.city), bc = normCity(b.city);
  if (ac && bc && ac !== bc) return false;
  // one side has no address: same phone or same town is enough
  if (normPhone(a.phone) && normPhone(a.phone) === normPhone(b.phone)) return true;
  return !!(ac && bc && ac === bc);
}

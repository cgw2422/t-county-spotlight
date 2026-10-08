/**
 * Field and classification heuristics. Values are copied as-is; nothing is
 * invented. Every raw value is also kept in wpMeta so unmapped data survives.
 */
import type { ArticleKind, ArticleStatus, PublishStatus } from "@/generated/prisma/client";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { decodeEntities } from "./html";

export function articleStatus(wp: string): ArticleStatus {
  switch (wp) {
    case "publish": return "PUBLISHED";
    case "future": return "SCHEDULED";
    case "pending": return "PENDING";
    case "private": return "UNPUBLISHED";
    default: return "DRAFT"; // draft, auto-draft, inherit, trash…
  }
}

export function businessStatus(wp: string): PublishStatus {
  switch (wp) {
    case "publish": return "PUBLISHED";
    case "pending": return "PENDING";
    default: return "DRAFT"; // draft, future, private — not public in WordPress either
  }
}

/** CPTs that represent business listings. */
export function isBusinessType(name: string, label?: string) {
  const s = `${name} ${label ?? ""}`.toLowerCase();
  if (/job|event|product|order|coupon|review|form|entry|submission/.test(s)) return false;
  return /business|listing|directory|compan(y|ies)|vendor|merchant|member_?directory|place|gd_place|at_biz_dir|wpbdp|lsvr/.test(s);
}

/** Post types holding form submissions — never imported as public content. */
export function isFormSubmissionType(name: string) {
  return /^(flamingo_inbound|flamingo_contact|nf_sub|wpforms_entry|frm_entry|wpcf7s|cfdb7|vfb_entry|gf_entry|fluentform_submission|feedback)$/.test(name);
}

const KIND_RULES: [ArticleKind, RegExp][] = [
  ["SPOTLIGHT", /spot\s*-?light|featured business|business feature|meet the owner|business profile/i],
  ["ANNOUNCEMENT", /announce|press release|notice|grand opening|community news|alert/i],
  ["THINGS_TO_DO", /things[\s-]+to[\s-]+do|events?\b|weekend|activit|attraction|what'?s happening|family fun|festival/i],
  ["NEWS", /\bnews\b/i],
];

export function articleKind(input: { title: string; categoryNames: string[]; tagNames: string[]; categorySlugs: string[] }): ArticleKind {
  const taxText = [...input.categoryNames, ...input.categorySlugs, ...input.tagNames].join(" | ");
  for (const [kind, re] of KIND_RULES) if (re.test(taxText)) return kind;
  // the title alone only decides spotlights (e.g. "Business Spotlight: …")
  if (KIND_RULES[0][1].test(input.title)) return "SPOTLIGHT";
  return "GENERAL";
}

/** Resolve Yoast %%variables%% in SEO templates stored in postmeta. */
export function resolveSeoTemplate(tpl: string | undefined, vars: { title: string; siteName?: string; excerpt?: string; category?: string }) {
  if (!tpl) return undefined;
  if (!tpl.includes("%%")) return decodeEntities(tpl).trim() || undefined;
  const out = tpl
    .replace(/%%title%%/g, vars.title)
    .replace(/%%sitename%%/g, vars.siteName ?? "")
    .replace(/%%sep%%/g, "-")
    .replace(/%%excerpt%%/g, vars.excerpt ?? "")
    .replace(/%%(primary_)?category%%/g, vars.category ?? "")
    .replace(/%%[a-z_]+%%/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*-\s*|\s*-\s*$/g, "")
    .trim();
  return decodeEntities(out) || undefined;
}

// ───────── business fields ─────────

export type MappedBusiness = {
  tagline?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  website?: string;
  socials: Record<string, string>;
  hours?: { day: string; open: string; close: string; closed: boolean }[];
  hoursText?: string;
  logo?: unknown; // media id, url, or ACF image object
  gallery: unknown[];
  relatedIds: number[];
  usedKeys: string[];
};

type Flat = [string, unknown][];

/** Flatten nested ACF groups: { contact: { phone } } → "contact.phone". */
export function flattenMeta(meta: Record<string, unknown>, prefix = "", out: Flat = [], depth = 0): Flat {
  for (const [k, v] of Object.entries(meta)) {
    const key = prefix ? `${prefix}.${k}` : k;
    out.push([key, v]);
    if (depth < 3 && v && typeof v === "object" && !Array.isArray(v) && !isImageObject(v) && !isMapObject(v)) flattenMeta(v as Record<string, unknown>, key, out, depth + 1);
  }
  return out;
}

export function isImageObject(v: unknown): v is { url?: string; ID?: number; id?: number; alt?: string; sizes?: unknown } {
  return !!v && typeof v === "object" && !Array.isArray(v) && ("url" in v || "sizes" in v) && ("ID" in v || "id" in v || "filename" in v || "mime_type" in v);
}
function isMapObject(v: unknown): v is { address?: string; lat?: number | string; lng?: number | string } {
  return !!v && typeof v === "object" && !Array.isArray(v) && "lat" in v && "lng" in v;
}

const leaf = (k: string) => k.split(".").pop()!.toLowerCase().replace(/^_+/, "").replace(/^(wpcf-|business_|biz_|listing_|company_|gd_|_?job_|contact_|field_)/, "");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

const SOCIAL_KEYS: Record<string, RegExp> = {
  facebook: /^(facebook|fb)(_?(url|link|page))?$/,
  instagram: /^(instagram|insta|ig)(_?(url|link|handle))?$/,
  x: /^(twitter|x)(_?(url|link|handle))?$/,
  tiktok: /^tik_?tok(_?(url|link))?$/,
  youtube: /^(youtube|yt)(_?(url|link|channel))?$/,
  linkedin: /^linked_?in(_?(url|link))?$/,
  pinterest: /^pinterest(_?(url|link))?$/,
};
const SOCIAL_HOSTS: Record<string, RegExp> = {
  facebook: /facebook\.com|fb\.com/i, instagram: /instagram\.com/i, x: /twitter\.com|\/\/x\.com/i,
  tiktok: /tiktok\.com/i, youtube: /youtube\.com|youtu\.be/i, linkedin: /linkedin\.com/i, pinterest: /pinterest\.com/i,
};

const DAY_NAMES: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function parseHours(v: unknown): MappedBusiness["hours"] | undefined {
  // ACF repeater: [{ day: "Monday", open: "9:00", close: "17:00", closed: false }]
  if (!Array.isArray(v) || !v.length) return undefined;
  const out: NonNullable<MappedBusiness["hours"]> = [];
  for (const row of v) {
    if (!row || typeof row !== "object") return undefined;
    const r = row as Record<string, unknown>;
    const day = DAY_NAMES[str(r.day ?? r.weekday ?? r.days).slice(0, 3).toLowerCase()];
    if (!day) return undefined;
    const open = str(r.open ?? r.opens ?? r.open_time ?? r.from ?? r.start);
    const close = str(r.close ?? r.closes ?? r.close_time ?? r.to ?? r.end);
    const closed = r.closed === true || r.closed === "1" || /closed/i.test(`${open} ${close}`) || (!open && !close);
    out.push({ day, open: closed ? "" : open, close: closed ? "" : close, closed });
  }
  return out;
}

/** Split "123 Main St, Dover, OH 44622" into parts (only when the pattern is unambiguous). */
export function splitAddress(full: string): { street?: string; city?: string; state?: string; zip?: string } {
  const m = full.match(/^(.*?),\s*([A-Za-z .'-]+?),?\s+(OH|Ohio)\.?,?\s*(\d{5}(?:-\d{4})?)?\s*(?:,?\s*(USA|United States))?$/i);
  if (m) return { street: m[1].trim() || undefined, city: m[2].trim(), state: "OH", zip: m[4] };
  for (const c of TUSCARAWAS_CITIES) {
    const re = new RegExp(`^(.*?),\\s*${c}\\b`, "i");
    const mm = full.match(re);
    if (mm) return { street: mm[1].trim(), city: c, zip: full.match(/\b(\d{5})(?:-\d{4})?\b\s*$/)?.[1] };
  }
  return {};
}

export function mapBusinessFields(meta: Record<string, unknown>, businessIds: Set<number>): MappedBusiness {
  const out: MappedBusiness = { socials: {}, gallery: [], relatedIds: [], usedKeys: [] };
  const markUsed = (k: string) => out.usedKeys.push(k);
  for (const [key, v] of flattenMeta(meta)) {
    if (key.startsWith("__")) continue;
    const k = leaf(key);
    const s = str(v);
    if (isMapObject(v)) {
      const mv = v as { address?: string; lat?: number | string; lng?: number | string; city?: string; post_code?: string; state_short?: string };
      if (!out.address && mv.address) out.address = mv.address;
      if (out.latitude === undefined && mv.lat !== undefined && mv.lat !== "") out.latitude = Number(mv.lat);
      if (out.longitude === undefined && mv.lng !== undefined && mv.lng !== "") out.longitude = Number(mv.lng);
      if (!out.city && mv.city) out.city = mv.city;
      if (!out.zip && mv.post_code) out.zip = mv.post_code;
      markUsed(key);
      continue;
    }
    if (/^(street_?)?address(_?1|_?line_?1)?$|^street(_address)?$|^location_address$|^full_address$/.test(k) && s) { if (!out.address) { out.address = s; markUsed(key); } continue; }
    if (/^(address_?2|address_line_?2|suite|unit)$/.test(k) && s) { markUsed(key); out.address = out.address ? `${out.address}, ${s}` : s; continue; }
    if (/^(city|town|locality|geolocation_city)$/.test(k) && s) { if (!out.city) { out.city = s; markUsed(key); } continue; }
    if (/^(state|region|province|geolocation_state_short)$/.test(k) && s) { if (!out.state) { out.state = s; markUsed(key); } continue; }
    if (/^(zip|zip_?code|postal_?code|postcode|post_code|geolocation_postcode)$/.test(k) && s) { if (!out.zip) { out.zip = s; markUsed(key); } continue; }
    if (/^(lat|latitude|geolocation_lat)$/.test(k) && s && Number.isFinite(Number(s))) { out.latitude = Number(s); markUsed(key); continue; }
    if (/^(lng|lon|long|longitude|geolocation_long)$/.test(k) && s && Number.isFinite(Number(s))) { out.longitude = Number(s); markUsed(key); continue; }
    if (/^(phone|telephone|tel|phone_?number|main_?phone|business_?phone|mobile|cell)$/.test(k) && s) { if (!out.phone) { out.phone = s; markUsed(key); } continue; }
    if (/^(e_?mail|email_?address|public_?email)$/.test(k) && s && s.includes("@")) { if (!out.email) { out.email = s; markUsed(key); } continue; }
    if (/^(website|web_?site|url|website_?url|web|homepage|site_?url|web_?address)$/.test(k) && s && /\.|^https?:/.test(s)) {
      if (!out.website) { out.website = /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, "")}`; markUsed(key); }
      continue;
    }
    let social = false;
    for (const [net, re] of Object.entries(SOCIAL_KEYS)) {
      if (re.test(k) && s) { out.socials[net] ??= s; markUsed(key); social = true; break; }
    }
    if (social) continue;
    if (/^(social|socials|social_?links|social_?media)$/.test(k) && v && typeof v === "object") {
      const vals = Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? Object.values(x as object) : [x])).flat() : Object.values(v as object);
      for (const x of vals.map(str)) for (const [net, re] of Object.entries(SOCIAL_HOSTS)) if (re.test(x)) out.socials[net] ??= x;
      markUsed(key);
      continue;
    }
    if (/^(hours|business_?hours|opening_?hours|hours_?of_?operation|open_?hours|store_?hours)$/.test(k)) {
      const parsed = parseHours(v);
      if (parsed) out.hours = parsed;
      else if (s) out.hoursText = s;
      else if (v && typeof v === "object") out.hoursText = JSON.stringify(v);
      markUsed(key);
      continue;
    }
    if (/^(logo|business_?logo|company_?logo|logo_?image|brand_?logo)$/.test(k) && v) { out.logo = v; markUsed(key); continue; }
    if (/^(gallery|photos|images|business_?gallery|photo_?gallery|image_?gallery)$/.test(k) && v) {
      if (Array.isArray(v)) out.gallery.push(...v);
      else if (typeof v === "string") out.gallery.push(...v.split(",").map((x) => x.trim()).filter(Boolean));
      markUsed(key);
      continue;
    }
    if (/^(tagline|slogan|subtitle|short_?description|summary)$/.test(k) && s && s.length < 300) { if (!out.tagline) { out.tagline = s; markUsed(key); } continue; }
  }
  if (out.address && !out.city) {
    const parts = splitAddress(out.address);
    if (parts.city) { out.address = parts.street ?? out.address; out.city = parts.city; out.zip ??= parts.zip; out.state ??= parts.state; }
  }
  void businessIds;
  return out;
}

/** IDs referenced by relationship-like meta fields (ACF relationship / post object). */
export function relationshipIds(meta: Record<string, unknown>, candidates: Set<number>): number[] {
  const ids = new Set<number>();
  for (const [key, v] of flattenMeta(meta)) {
    if (!/business|listing|company|related|relationship|spotlight|featured_?(post|item)|vendor/i.test(key)) continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) {
      let n: number | null = null;
      if (typeof x === "number") n = x;
      else if (typeof x === "string" && /^\d+$/.test(x.trim())) n = Number(x);
      else if (x && typeof x === "object") n = Number((x as Record<string, unknown>).ID ?? (x as Record<string, unknown>).id) || null;
      if (n && candidates.has(n)) ids.add(n);
    }
  }
  return [...ids];
}

import { RESERVED_ORG_SLUGS } from "./queries";
import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { sanitizePlain } from "@/lib/sanitize";
import { slugify } from "@/lib/utils";
import { normalizeUrl, textToHtml } from "@/components/dashboard/text";
import { Prisma, type OrgKind } from "@/generated/prisma/client";
import { IMAGE_RIGHTS, ORG_KINDS, websiteHost, type OrgKindValue } from "./constants";
import { memberEditedOrgIds } from "./admin";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

/** Importable fields with header synonyms used for auto-mapping. */
export const IMPORT_FIELDS = [
  { key: "name", label: "Name (required)", syn: ["name", "organization", "organizationname", "orgname", "churchname", "nonprofitname", "title"] },
  { key: "kind", label: "Kind (Nonprofit / Church / Community group)", syn: ["kind", "type", "orgkind", "organizationtype", "listingtype"] },
  { key: "orgType", label: "Type or cause", syn: ["orgtype", "category", "cause", "subtype"] },
  { key: "tagline", label: "Tagline", syn: ["tagline", "summary", "slogan"] },
  { key: "description", label: "Description", syn: ["description", "about", "details"] },
  { key: "mission", label: "Mission", syn: ["mission", "missionstatement"] },
  { key: "address", label: "Street address", syn: ["address", "street", "streetaddress", "address1", "addressline1"] },
  { key: "city", label: "City", syn: ["city", "town", "municipality"] },
  { key: "state", label: "State", syn: ["state", "st", "province"] },
  { key: "zip", label: "ZIP", syn: ["zip", "zipcode", "postalcode", "postcode"] },
  { key: "phone", label: "Public phone", syn: ["phone", "telephone", "phonenumber", "tel"] },
  { key: "email", label: "Public email", syn: ["email", "emailaddress", "mail", "contactemail"] },
  { key: "website", label: "Website", syn: ["website", "url", "web", "site", "homepage"] },
  { key: "facebook", label: "Facebook", syn: ["facebook", "fb"] },
  { key: "instagram", label: "Instagram", syn: ["instagram", "ig"] },
  { key: "x", label: "X / Twitter", syn: ["x", "twitter"] },
  { key: "youtube", label: "YouTube", syn: ["youtube"] },
  { key: "serviceArea", label: "Service area", syn: ["servicearea", "areaserved", "serves"] },
  { key: "donationUrl", label: "Donation link", syn: ["donationurl", "donation", "donate", "donationlink", "givingurl", "give"] },
  { key: "wishlistUrl", label: "Wish list link", syn: ["wishlisturl", "wishlist"] },
  { key: "denomination", label: "Denomination (churches)", syn: ["denomination", "affiliation"] },
  { key: "livestreamUrl", label: "Livestream link (churches)", syn: ["livestreamurl", "livestream", "streamurl"] },
  { key: "logoUrl", label: "Logo URL", syn: ["logourl", "logo"] },
  { key: "coverUrl", label: "Cover image URL", syn: ["coverurl", "cover", "coverimage", "coverphoto", "image", "photo"] },
  { key: "imageRights", label: "Image rights", syn: ["imagerights", "imagelicense", "photorights", "rights"] },
  { key: "ein", label: "EIN", syn: ["ein", "taxid", "fein"] },
  { key: "sourceUrl", label: "Source URL(s)", syn: ["sourceurl", "source", "sources", "sourceurls", "reference"] },
] as const;
export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export const IMPORT_FIELD_KEYS = IMPORT_FIELDS.map((f) => f.key) as string[];

export const TEMPLATE_HEADERS = [
  "name", "kind", "orgType", "description", "mission", "address", "city", "state", "zip", "phone", "email", "website",
  "facebook", "instagram", "x", "youtube", "serviceArea", "donationUrl", "denomination", "livestreamUrl", "logoUrl", "coverUrl", "imageRights", "ein", "sourceUrl",
];

const normHeader = (h: string) => h.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** Suggests a field for each header (each field used at most once). */
export function suggestMapping(headers: string[]): Record<number, string> {
  const used = new Set<string>();
  const out: Record<number, string> = {};
  headers.forEach((h, i) => {
    const n = normHeader(h);
    const f = IMPORT_FIELDS.find((x) => !used.has(x.key) && (x.syn as readonly string[]).includes(n));
    if (f) { out[i] = f.key; used.add(f.key); } else out[i] = "ignore";
  });
  return out;
}

export function readMapping(raw: unknown, width: number): Record<number, string> {
  const out: Record<number, string> = {};
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (let i = 0; i < width; i++) {
    const v = String(m[i] ?? "ignore");
    out[i] = IMPORT_FIELD_KEYS.includes(v) ? v : "ignore";
  }
  return out;
}

export type ImportDefaults = { kind: OrgKindValue; publish: boolean };
export function readDefaults(raw: unknown): ImportDefaults {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = (ORG_KINDS as readonly string[]).includes(String(d.kind)) ? (d.kind as OrgKindValue) : "NONPROFIT";
  return { kind, publish: d.publish === true };
}

// ───────── Normalisation for duplicate detection ─────────

/** Lowercase, strip accents/punctuation, drop a leading "the" and trailing inc/llc/incorporated/co. */
export function normalizeOrgName(name: string) {
  let s = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/^the\s+/, "");
  for (let i = 0; i < 2; i++) s = s.replace(/\s+(inc|incorporated|llc|co)$/, "");
  return s.replace(/\s+/g, " ").trim();
}

const ADDR_ABBR: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", boulevard: "blvd", lane: "ln", court: "ct", place: "pl", highway: "hwy", parkway: "pkwy",
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw", suite: "ste", circle: "cir", terrace: "ter",
};
export function normalizeAddress(address: string | null | undefined, city: string | null | undefined) {
  if (!address || !city) return null;
  const a = address.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).map((w) => ADDR_ABBR[w] ?? w).join(" ");
  const c = city.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return a && c ? `${a}|${c}` : null;
}
const normCity = (c: string | null | undefined) => (c ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Hosts shared by many organizations never count as a website match.
const SHARED_HOSTS = new Set(["facebook.com", "m.facebook.com", "instagram.com", "sites.google.com", "linktr.ee", "youtube.com", "twitter.com", "x.com", "wixsite.com", "weebly.com", "godaddysites.com"]);
const matchHost = (website: string | null | undefined) => {
  const h = websiteHost(website);
  return h && !SHARED_HOSTS.has(h) ? h : null;
};

// ───────── Row parsing & validation ─────────

export type ImportRowData = {
  name: string; kind: OrgKind; orgType: string | null; tagline: string | null; description: string | null; mission: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null; phone: string | null; email: string | null; website: string | null;
  socials: Record<string, string>; serviceArea: string | null; donationUrl: string | null; wishlistUrl: string | null; denomination: string | null;
  livestreamUrl: string | null; logoUrl: string | null; coverUrl: string | null; imageRights: string | null; ein: string | null; sourceUrls: string[];
};

const KIND_WORDS: Record<string, OrgKind> = {
  nonprofit: "NONPROFIT", "non profit": "NONPROFIT", "non-profit": "NONPROFIT", npo: "NONPROFIT", "501c3": "NONPROFIT", "501(c)(3)": "NONPROFIT", charity: "NONPROFIT", organization: "NONPROFIT",
  church: "CHURCH", congregation: "CHURCH", parish: "CHURCH", ministry: "CHURCH",
  community: "COMMUNITY_GROUP", "community group": "COMMUNITY_GROUP", "community_group": "COMMUNITY_GROUP", group: "COMMUNITY_GROUP", club: "COMMUNITY_GROUP",
};

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const d = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length === 10 && !/x|ext/i.test(raw)) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return /^[0-9+().\-\s xext]{7,30}$/i.test(raw) ? raw.replace(/\s+/g, " ").trim() : null;
}

function readImageRightsValue(raw: string) {
  const v = raw.trim();
  if (!v) return null;
  const low = v.toLowerCase();
  const hit = IMAGE_RIGHTS.find((r) => r.value === low || r.label.toLowerCase() === low);
  return hit ? hit.value : `other: ${sanitizePlain(v, 280)}`;
}

/** Parses one CSV row with the mapping. Errors make the row unimportable; warnings drop a value. */
export function parseImportRow(cells: string[], mapping: Record<number, string>, defaults: ImportDefaults) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw: Partial<Record<ImportFieldKey, string>> = {};
  for (const [i, field] of Object.entries(mapping)) {
    if (field === "ignore") continue;
    const v = (cells[Number(i)] ?? "").trim();
    if (v && !raw[field as ImportFieldKey]) raw[field as ImportFieldKey] = v;
  }
  const plain = (k: ImportFieldKey, max = 300) => (raw[k] ? sanitizePlain(raw[k], max) || null : null);
  const url = (k: ImportFieldKey, label: string, fatal = true) => {
    if (!raw[k]) return null;
    const u = normalizeUrl(raw[k]);
    if (!u) (fatal ? errors : warnings).push(`${label}: “${raw[k]!.slice(0, 60)}” isn't a valid web address${fatal ? "" : " (dropped)"}.`);
    return u;
  };

  const name = plain("name", 160) ?? "";
  if (!name) errors.push("Missing name.");

  let kind: OrgKind = defaults.kind;
  if (raw.kind) {
    const k = KIND_WORDS[raw.kind.toLowerCase().trim()] ?? (ORG_KINDS as readonly string[]).find((x) => x === raw.kind!.toUpperCase().trim());
    if (k) kind = k as OrgKind;
    else warnings.push(`Unknown kind “${raw.kind.slice(0, 40)}” — used ${defaults.kind.toLowerCase().replace("_", " ")}.`);
  }

  let email: string | null = null;
  if (raw.email) {
    const e = z.email().safeParse(raw.email.toLowerCase().trim());
    if (e.success) email = e.data;
    else errors.push(`Invalid email “${raw.email.slice(0, 60)}”.`);
  }
  let phone: string | null = null;
  if (raw.phone) {
    phone = formatPhone(raw.phone);
    if (!phone) errors.push(`Invalid phone “${raw.phone.slice(0, 40)}”.`);
  }
  let zip: string | null = null;
  if (raw.zip) {
    const z5 = raw.zip.trim().replace(/^(\d{4})$/, "0$1");
    if (/^\d{5}(-\d{4})?$/.test(z5)) zip = z5;
    else warnings.push(`ZIP “${raw.zip.slice(0, 12)}” dropped (expected 5 digits).`);
  }
  let ein: string | null = null;
  if (raw.ein) {
    if (/^\d{2}-?\d{7}$/.test(raw.ein.trim())) ein = raw.ein.trim();
    else warnings.push("EIN dropped (expected 9 digits like 12-3456789).");
  }
  let state: string | null = plain("state", 20);
  if (state && /^ohio$/i.test(state)) state = "OH";

  const website = url("website", "Website");
  const donationUrl = url("donationUrl", "Donation link");
  const wishlistUrl = url("wishlistUrl", "Wish list link");
  const livestreamUrl = url("livestreamUrl", "Livestream link");
  const socials: Record<string, string> = {};
  for (const k of ["facebook", "instagram", "x", "youtube"] as const) {
    const u = url(k, k === "x" ? "X / Twitter" : k[0].toUpperCase() + k.slice(1), false);
    if (u) socials[k] = u;
  }

  // Images: only https URLs (never downloaded), and only with a stated basis for using them.
  const imageRights = raw.imageRights ? readImageRightsValue(raw.imageRights) : null;
  const img = (k: "logoUrl" | "coverUrl", label: string) => {
    const v = raw[k];
    if (!v) return null;
    if (!/^https:\/\//i.test(v.trim()) || !normalizeUrl(v)) { warnings.push(`${label} dropped (only https:// image links are accepted).`); return null; }
    if (!imageRights) { warnings.push(`${label} dropped (no image rights value in the row).`); return null; }
    return normalizeUrl(v);
  };
  const logoUrl = img("logoUrl", "Logo");
  const coverUrl = img("coverUrl", "Cover image");

  const sourceUrls: string[] = [];
  for (const s of (raw.sourceUrl ?? "").split(/[\s,;|]+/).filter(Boolean).slice(0, 10)) {
    const u = /^http:\/\//i.test(s) ? null : normalizeUrl(s);
    if (u) { if (!sourceUrls.includes(u)) sourceUrls.push(u); } else warnings.push(`Source “${s.slice(0, 60)}” dropped (needs an https:// link).`);
  }
  const text = (k: ImportFieldKey, max: number) => (raw[k] ? textToHtml(sanitizePlain(raw[k]!.replace(/\r\n/g, "\n"), max)) || null : null);

  const data: ImportRowData = {
    name, kind, orgType: plain("orgType", 80), tagline: plain("tagline", 160), description: text("description", 8000), mission: plain("mission", 1000),
    address: plain("address", 200), city: plain("city", 80), state, zip, phone, email, website, socials, serviceArea: plain("serviceArea", 200),
    donationUrl, wishlistUrl, denomination: plain("denomination", 120), livestreamUrl, logoUrl, coverUrl,
    imageRights: logoUrl || coverUrl ? imageRights : null, ein, sourceUrls,
  };
  return { data, errors, warnings };
}

// ───────── Analysis (validation + duplicates) ─────────

export type ExistingMatch = { id: string; name: string; slug: string; kind: string; ownershipStatus: string; updatable: boolean; why: string; reasons: string[] };
export type AnalyzedRow = {
  index: number; cells: string[]; data: ImportRowData; errors: string[]; warnings: string[];
  existing: ExistingMatch[]; inFileDupOf: number | null; inFileReasons: string[]; defaultInclude: boolean;
};

type Keys = { name: string; city: string; host: string | null; addr: string | null };
const keysOf = (d: { name: string; city: string | null; website: string | null; address: string | null }): Keys => ({
  name: normalizeOrgName(d.name), city: normCity(d.city), host: matchHost(d.website), addr: normalizeAddress(d.address, d.city),
});
function matchReasons(a: Keys, b: Keys) {
  const r: string[] = [];
  if (a.name && a.name === b.name && (!a.city || !b.city || a.city === b.city)) r.push(a.city && b.city ? "same name and city" : "same name");
  if (a.host && a.host === b.host) r.push(`same website (${a.host})`);
  if (a.addr && a.addr === b.addr) r.push("same address");
  return r;
}

/** Validates every row and finds duplicates against existing organizations and earlier rows in the file. */
export async function analyzeImport(rows: string[][], mapping: Record<number, string>, defaults: ImportDefaults): Promise<AnalyzedRow[]> {
  const existing = await db.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, slug: true, kind: true, city: true, website: true, address: true, ownershipStatus: true, _count: { select: { members: true } } },
  });
  const edited = await memberEditedOrgIds(existing.filter((o) => o.ownershipStatus === "UNCLAIMED").map((o) => o.id));
  const exKeys = existing.map((o) => ({ o, k: keysOf(o) }));
  const byName = new Map<string, typeof exKeys>();
  const byHost = new Map<string, typeof exKeys>();
  const byAddr = new Map<string, typeof exKeys>();
  const push = (m: Map<string, typeof exKeys>, key: string | null, v: (typeof exKeys)[number]) => { if (key) m.set(key, [...(m.get(key) ?? []), v]); };
  for (const e of exKeys) { push(byName, e.k.name, e); push(byHost, e.k.host, e); push(byAddr, e.k.addr, e); }

  const seen: { index: number; k: Keys }[] = [];
  return rows.map((cells, index) => {
    const { data, errors, warnings } = parseImportRow(cells, mapping, defaults);
    const k = keysOf(data);
    const cands = new Map<string, (typeof exKeys)[number]>();
    for (const c of [...(byName.get(k.name) ?? []), ...(k.host ? byHost.get(k.host) ?? [] : []), ...(k.addr ? byAddr.get(k.addr) ?? [] : [])]) cands.set(c.o.id, c);
    const matches: ExistingMatch[] = [];
    for (const { o, k: ok } of cands.values()) {
      const reasons = matchReasons(k, ok);
      if (!reasons.length) continue;
      const updatable = o.ownershipStatus === "UNCLAIMED" && o._count.members === 0 && !edited.has(o.id);
      const why = o.ownershipStatus === "CLAIMED" ? "claimed — managed by its representatives, never updated by imports"
        : o.ownershipStatus === "CLAIM_PENDING" ? "a claim is pending — not updated by imports"
        : !updatable ? "edited by a member — not updated by imports" : "unclaimed — empty fields can be filled";
      matches.push({ id: o.id, name: o.name, slug: o.slug, kind: o.kind, ownershipStatus: o.ownershipStatus, updatable, why, reasons });
    }
    let inFileDupOf: number | null = null;
    let inFileReasons: string[] = [];
    if (data.name) {
      for (const s of seen) {
        const r = matchReasons(k, s.k);
        if (r.length) { inFileDupOf = s.index; inFileReasons = r; break; }
      }
      seen.push({ index, k });
    }
    return {
      index, cells, data, errors, warnings, existing: matches, inFileDupOf, inFileReasons,
      defaultInclude: !errors.length && !matches.length && inFileDupOf === null,
    };
  });
}

// ───────── Writing ─────────

export function createDataFor(d: ImportRowData, extra: { slug: string; publish: boolean; importBatchId: string; createdById: string; now: Date }): Prisma.OrganizationCreateInput {
  return {
    slug: extra.slug, name: d.name, kind: d.kind, orgType: d.orgType, tagline: d.tagline, description: d.description, mission: d.mission,
    address: d.address, city: d.city, state: d.state ?? "OH", zip: d.zip, phone: d.phone, email: d.email, website: d.website,
    socials: Object.keys(d.socials).length ? d.socials : Prisma.DbNull, serviceArea: d.serviceArea, donationUrl: d.donationUrl,
    wishlistUrl: d.wishlistUrl, denomination: d.denomination, livestreamUrl: d.livestreamUrl, logoUrl: d.logoUrl, coverUrl: d.coverUrl,
    imageRights: d.imageRights, ein: d.ein, sourceUrls: d.sourceUrls, infoCheckedAt: d.sourceUrls.length ? extra.now : null,
    status: "APPROVED", isPublished: extra.publish, publishedAt: extra.publish ? extra.now : null, ownershipStatus: "UNCLAIMED",
    source: "import", importBatchId: extra.importBatchId, createdById: extra.createdById,
  };
}

const FILLABLE = [
  "orgType", "tagline", "description", "mission", "address", "city", "zip", "phone", "email", "website", "serviceArea", "donationUrl",
  "wishlistUrl", "denomination", "livestreamUrl", "ein",
] as const;

/** Update data that only fills fields the existing listing leaves empty. Returns null when nothing changes. */
export function fillEmptyData(existing: Record<string, unknown>, d: ImportRowData, now: Date): { data: Prisma.OrganizationUpdateInput; fields: string[] } | null {
  const data: Record<string, unknown> = {};
  const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
  for (const f of FILLABLE) if (d[f] && empty(existing[f])) data[f] = d[f];
  // Images share one image-rights value: only fill them when the listing has no images and no rights recorded.
  if ((d.logoUrl || d.coverUrl) && d.imageRights && empty(existing.logoUrl) && empty(existing.coverUrl) && empty(existing.imageRights)) {
    if (d.logoUrl) data.logoUrl = d.logoUrl;
    if (d.coverUrl) data.coverUrl = d.coverUrl;
    data.imageRights = d.imageRights;
  }
  const socials = (existing.socials && typeof existing.socials === "object" ? existing.socials : {}) as Record<string, string>;
  const addSoc = Object.fromEntries(Object.entries(d.socials).filter(([k]) => !socials[k]));
  if (Object.keys(addSoc).length) data.socials = { ...socials, ...addSoc };
  if (d.sourceUrls.length && empty(existing.sourceUrls)) data.sourceUrls = d.sourceUrls;
  if (d.sourceUrls.length && empty(existing.infoCheckedAt)) data.infoCheckedAt = now;
  const fields = Object.keys(data);
  return fields.length ? { data: data as Prisma.OrganizationUpdateInput, fields } : null;
}

/** Unique slug that also avoids slugs reserved earlier in the same import run. */
export async function importSlug(name: string, reserved: Set<string>) {
  const root = slugify(name).slice(0, 70).replace(/-+$/, "") || "organization";
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? root : `${root}-${i + 1}`;
    if (reserved.has(s) || RESERVED_ORG_SLUGS.has(s)) continue;
    if (!(await db.organization.findUnique({ where: { slug: s }, select: { id: true } }))) { reserved.add(s); return s; }
  }
  const s = `${root}-${Date.now().toString(36)}`;
  reserved.add(s);
  return s;
}

export type ImportOutcome = "created" | "updated" | "skipped_duplicate" | "skipped_claimed" | "skipped" | "error";
export type ImportResult = { row: number; name: string; outcome: ImportOutcome; orgId?: string; message?: string };
export const OUTCOME_LABEL: Record<ImportOutcome, string> = {
  created: "Created", updated: "Updated (empty fields filled)", skipped_duplicate: "Skipped — duplicate", skipped_claimed: "Skipped — claimed organization",
  skipped: "Skipped — not selected", error: "Error",
};

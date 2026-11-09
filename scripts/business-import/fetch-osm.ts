/**
 * Step 1 — build a REVIEW CSV of Tuscarawas County businesses from OpenStreetMap.
 * Nothing is written to the database.
 *
 *   npx tsx scripts/business-import/fetch-osm.ts                   # query the Overpass API
 *   npx tsx scripts/business-import/fetch-osm.ts --input osm.json  # use a saved Overpass JSON response
 *   (DATABASE_URL decides which T County Connect database is checked for duplicates)
 *
 * Output: data/business-import/<timestamp>/candidates.csv + duplicate-report.md
 */
import fs from "node:fs";
import path from "node:path";
import { toCsv } from "../../src/lib/gives/csv";
import {
  COLUMNS, EXISTING_SELECT, OSM_LICENSE, TUSC_ZIPS, categorize, findExisting, fmtPhone, getDb, indexExisting, isChain,
  nearestTown, normWebsite, sameOsmPlace, type Row,
} from "./shared";

const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const QUERY = `[out:json][timeout:300];
area["name"="Ohio"]["admin_level"="4"]->.oh;
area["name"="Tuscarawas County"]["admin_level"="6"](area.oh)->.tc;
(
  nwr["name"]["shop"](area.tc);
  nwr["name"]["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|food_court|biergarten|pharmacy|dentist|doctors|clinic|veterinary|bank|fuel|car_wash|car_rental|cinema|theatre|arts_centre|nightclub|events_venue|childcare|driving_school|coworking_space)$"](area.tc);
  nwr["name"]["craft"](area.tc);
  nwr["name"]["office"~"^(company|estate_agent|insurance|lawyer|accountant|financial|financial_advisor|architect|travel_agent|tax_advisor|it|employment_agency|advertising_agency|newspaper|surveyor|engineer|consulting|property_management)$"](area.tc);
  nwr["name"]["tourism"~"^(hotel|motel|guest_house|bed_and_breakfast|hostel|camp_site|caravan_site|chalet|attraction|museum|gallery|winery|theme_park|zoo)$"](area.tc);
  nwr["name"]["leisure"~"^(fitness_centre|bowling_alley|golf_course|miniature_golf|amusement_arcade|escape_game|water_park|sports_centre|marina|horse_riding)$"](area.tc);
  nwr["name"]["healthcare"](area.tc);
);
out center tags;`;

type El = { type: "node" | "way" | "relation"; id: number; tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } };

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };

async function loadElements(): Promise<El[]> {
  const input = arg("--input");
  if (input) return JSON.parse(fs.readFileSync(input, "utf8")).elements;
  console.log(`Querying ${OVERPASS} …`);
  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "TCountyConnect-BusinessImport/1.0 (one-time import)" },
    body: new URLSearchParams({ data: QUERY }),
    signal: AbortSignal.timeout(400_000),
  });
  if (!res.ok) throw new Error(`Overpass error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.elements;
}

function toRow(el: El): Row | null {
  const t = el.tags || {};
  const name = (t.name || "").trim();
  if (!name) return null;
  if (t.disused === "yes" || t["disused:shop"] || t["abandoned:amenity"] || t.opening_hours === "closed") return null;
  const cat = categorize(t);
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const zip = (t["addr:postcode"] || "").slice(0, 5);
  let city = t["addr:city"] || (zip && TUSC_ZIPS[zip]) || "";
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  let inferred = "";
  if (!city && lat != null && lon != null) {
    const near = nearestTown(lat, lon);
    if (near) { city = near.town; inferred = `town inferred from map location (${near.km.toFixed(1)} km from ${near.town} center) — please confirm`; }
  }
  const phone = fmtPhone(t.phone || t["contact:phone"]);
  const website = normWebsite(t.website || t["contact:website"] || t.url);
  const flags: string[] = [];
  if (isChain(t)) flags.push("chain/brand (local directory?)");
  if (zip && !TUSC_ZIPS[zip]) flags.push(`ZIP ${zip} outside the Tuscarawas list`);
  if (!cat.slug) flags.push("no category match");
  if (city === "Tuscarawas County") { city = ""; flags.push("town not given (address says Tuscarawas County)"); }
  const missing = [!street && "address", !city && "city", !zip && "zip", !phone && "phone", !website && "website"].filter(Boolean) as string[];
  return {
    approve: "", review_flags: flags.join("; "), town_note: inferred, name, category: cat.label, category_slug: cat.slug, address: street, city,
    state: "OH", zip, phone, website, missing_fields: missing.join(", "), duplicate_of: "", duplicate_reason: "",
    source: "OpenStreetMap", source_id: `${el.type}/${el.id}`, source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    license: OSM_LICENSE, osm_type: Object.entries(t).filter(([k]) => ["shop", "amenity", "craft", "office", "tourism", "leisure", "healthcare"].includes(k)).map(([k, v]) => `${k}=${v}`).join(" "),
  };
}

async function main() {
  const elements = await loadElements();
  const rows = elements.map(toRow).filter((r): r is Row => !!r);

  // ── duplicates inside the OSM results (same place mapped as node + building, etc.) ──
  // Rows with an address are preferred as the kept record.
  rows.sort((a, b) => Number(!!b.address) - Number(!!a.address));
  const kept: Row[] = [];
  let internalDupes = 0;
  for (const r of rows) {
    const hit = kept.find((k) => sameOsmPlace(k, r));
    if (hit) {
      r.duplicate_of = `OSM ${hit.source_id} (${hit.name}${hit.address ? `, ${hit.address}` : ""})`; r.duplicate_reason = "same place mapped twice in OpenStreetMap"; internalDupes++;
      for (const f of ["address", "city", "zip", "phone", "website"] as const) if (!hit[f] && r[f]) hit[f] = r[f];
    } else kept.push(r);
  }
  // recompute missing fields after merging
  for (const r of kept) r.missing_fields = [!r.address && "address", !r.city && "city", !r.zip && "zip", !r.phone && "phone", !r.website && "website"].filter(Boolean).join(", ");

  // ── compare against existing T County Connect businesses (never modified) ──
  const db = getDb();
  const existing = await db.business.findMany({ select: EXISTING_SELECT });
  await db.$disconnect();
  const ix = indexExisting(existing);
  let existingDupes = 0;
  for (const r of rows) {
    if (r.duplicate_of) continue;
    const hit = findExisting(r, ix);
    if (hit) { r.duplicate_of = `existing: ${hit.biz.name} (/business/${hit.biz.slug}/)`; r.duplicate_reason = hit.reason; existingDupes++; }
  }

  // ── default approval: complete, local, non-duplicate records → yes; everything else → review ──
  for (const r of rows) {
    // a suggested (inferred) town is OK for pre-approval but stays visible in town_note for review
    const ok = !r.duplicate_of && !r.review_flags && r.city && (r.address || r.phone || r.website);
    r.approve = ok ? "yes" : "no";
  }
  rows.sort((a, b) => (a.approve === b.approve ? 0 : a.approve === "yes" ? -1 : 1) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

  const dir = path.join("data", "business-import", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "candidates.csv"), toCsv([[...COLUMNS], ...rows.map((r) => COLUMNS.map((c) => r[c]))]));

  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const byCity = Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[r.city || "(unknown)"] = (m[r.city || "(unknown)"] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const byCat = Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[r.category || "(none)"] = (m[r.category || "(none)"] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const dupLines = rows.filter((r) => r.duplicate_of).map((r) => `| ${r.name} | ${r.city} | ${r.duplicate_reason} | ${r.duplicate_of} |`);
  const report = `# Business import — candidate & duplicate report

Generated ${new Date().toISOString()} · Source: OpenStreetMap (Overpass API) · License: ${OSM_LICENSE}
Compared against ${existing.length} existing T County Connect businesses (database: ${new URL(process.env.DATABASE_URL!).host}).

| | Count |
|---|---|
| Records found in OpenStreetMap | ${rows.length} |
| Pre-approved (approve = yes) | ${count((r) => r.approve === "yes")} |
| Needs review (approve = no) | ${count((r) => r.approve === "no")} |
| Duplicate of an existing listing (will be skipped) | ${existingDupes} |
| Duplicate within OpenStreetMap | ${internalDupes} |
| Chains / brands (flagged) | ${count((r) => r.review_flags.includes("chain"))} |
| Missing address | ${count((r) => r.missing_fields.includes("address"))} |
| Missing city | ${count((r) => r.missing_fields.includes("city"))} |
| Town inferred from map location (please confirm) | ${count((r) => !!r.town_note)} |
| Missing phone | ${count((r) => r.missing_fields.includes("phone"))} |
| Missing website | ${count((r) => r.missing_fields.includes("website"))} |

## By town
${byCity.map(([c, n]) => `- ${c}: ${n}`).join("\n")}

## By category
${byCat.map(([c, n]) => `- ${c}: ${n}`).join("\n")}

## Duplicates (never imported, existing listings are not changed)
| Name | City | Reason | Matches |
|---|---|---|---|
${dupLines.join("\n") || "| — | | | |"}

Review \`candidates.csv\`: set **approve** to \`yes\` or \`no\` per row (you can also correct names, categories, addresses, phones and websites). Then run the import (dry run first).
`;
  fs.writeFileSync(path.join(dir, "duplicate-report.md"), report);
  console.log(report.split("## By town")[0]);
  console.log(`Wrote ${path.join(dir, "candidates.csv")} and duplicate-report.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });

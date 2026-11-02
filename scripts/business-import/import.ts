/**
 * Step 2 — import the APPROVED rows of a reviewed candidates CSV.
 *
 *   npx tsx scripts/business-import/import.ts --file data/business-import/<run>/candidates.csv            # dry run (default)
 *   npx tsx scripts/business-import/import.ts --file data/business-import/<run>/candidates.csv --commit   # write
 *
 * Rules: only rows with approve = yes; each row is re-checked against the
 * database at import time and skipped if it matches an existing listing
 * (existing businesses are never modified). Imported businesses are free,
 * unclaimed listings: no owners, no subscription, not featured, not
 * spotlighted. No user accounts are created and no emails are sent.
 * Safe to re-run: rows already imported (same source record) are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "../../src/lib/gives/csv";
import { slugify } from "../../src/lib/utils";
import { COLUMNS, EXISTING_SELECT, OSM_LICENSE, findExisting, fmtPhone, getDb, indexExisting, normWebsite, type Row } from "./shared";

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : undefined; };
const COMMIT = process.argv.includes("--commit");
const STATUS = process.argv.includes("--draft") ? "DRAFT" : "PUBLISHED";

async function main() {
  const file = arg("--file");
  if (!file) throw new Error("Pass --file <reviewed candidates.csv>");
  const table = parseCsv(fs.readFileSync(file, "utf8"));
  const header = table[0].map((h) => h.trim());
  for (const c of ["approve", "name", "source_id"]) if (!header.includes(c)) throw new Error(`CSV is missing the "${c}" column`);
  const rows: Row[] = table.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(COLUMNS.map((c) => [c, (r[header.indexOf(c)] ?? "").trim()])) as Row);

  const db = getDb();
  const cats = new Map((await db.businessCategory.findMany({ select: { id: true, slug: true } })).map((c) => [c.slug, c.id]));
  const existing = await db.business.findMany({ select: EXISTING_SELECT });
  const ix = indexExisting(existing);
  const slugs = new Set(existing.map((b) => b.slug));
  const batch = `osm-${new Date().toISOString().slice(0, 10)}`;

  const added: { name: string; city: string; slug: string }[] = [];
  const skipped: { name: string; city: string; reason: string }[] = [];
  const flagged: { name: string; city: string; flags: string }[] = [];

  for (const r of rows) {
    if (!/^(y|yes|true|1|x)$/i.test(r.approve)) { skipped.push({ name: r.name, city: r.city, reason: "not approved" }); continue; }
    if (!r.name) { skipped.push({ name: "(blank)", city: r.city, reason: "missing name" }); continue; }
    const dup = findExisting(r, ix);
    if (dup) { skipped.push({ name: r.name, city: r.city, reason: `duplicate — ${dup.reason}: ${dup.biz.name} (/business/${dup.biz.slug}/)` }); continue; }
    if (r.review_flags || r.missing_fields) flagged.push({ name: r.name, city: r.city, flags: [r.review_flags, r.missing_fields && `missing ${r.missing_fields}`].filter(Boolean).join("; ") });

    const base = slugify([r.name, r.city].filter(Boolean).join(" "));
    let slug = base, n = 2;
    while (slugs.has(slug)) slug = `${base}-${n++}`;
    slugs.add(slug);
    const categoryId = r.category_slug ? cats.get(r.category_slug) : undefined;
    const data = {
      slug, name: r.name.slice(0, 200), address: r.address || null, city: r.city || null, state: r.state || "OH", zip: r.zip || null,
      phone: r.phone ? fmtPhone(r.phone) : null, website: normWebsite(r.website) || null,
      status: STATUS as "PUBLISHED" | "DRAFT", isFeatured: false, isSpotlighted: false, emailPublic: false,
      publishedAt: STATUS === "PUBLISHED" ? new Date() : null,
      wpMeta: { import: { source: r.source || "OpenStreetMap", sourceId: r.source_id, sourceUrl: r.source_url, license: r.license || OSM_LICENSE, batch, importedAt: new Date().toISOString(), listing: "free", ownership: "unclaimed" } },
      ...(categoryId ? { categories: { connect: [{ id: categoryId }] } } : {}),
    };
    if (COMMIT) {
      const b = await db.business.create({ data, select: EXISTING_SELECT });
      // later rows in the same file are checked against what was just added
      Object.assign(ix, indexExisting([...existing, b]));
      existing.push(b);
    } else {
      existing.push({ id: "dry-run", slug, name: data.name, city: data.city, phone: data.phone, website: data.website, address: data.address, wpMeta: data.wpMeta });
      Object.assign(ix, indexExisting(existing));
    }
    added.push({ name: r.name, city: r.city, slug });
  }
  if (COMMIT) await db.auditLog.create({ data: { action: "business.bulk_import", entityType: "Business", details: { batch, file: path.basename(file), added: added.length, skipped: skipped.length, flagged: flagged.length } } });
  await db.$disconnect();

  const mode = COMMIT ? "IMPORTED" : "DRY RUN — nothing written";
  const report = `# Business import report — ${mode}

File: ${file} · Batch: ${batch} · Status for new listings: ${STATUS} · Free listing, unclaimed, not featured
Database: ${new URL(process.env.DATABASE_URL!).host}

| | Count |
|---|---|
| ${COMMIT ? "Added" : "Would add"} | ${added.length} |
| Skipped | ${skipped.length} |
| Added but flagged for review | ${flagged.length} |

## ${COMMIT ? "Added" : "Would add"}
${added.map((a) => `- ${a.name} — ${a.city || "?"} → /business/${a.slug}/`).join("\n") || "- none"}

## Skipped
${skipped.filter((s) => s.reason !== "not approved").map((s) => `- ${s.name} (${s.city || "?"}): ${s.reason}`).join("\n") || "- none (besides rows not approved)"}
- Not approved: ${skipped.filter((s) => s.reason === "not approved").length} rows

## Flagged for review (added, but incomplete or unusual)
${flagged.map((f) => `- ${f.name} (${f.city || "?"}): ${f.flags}`).join("\n") || "- none"}
`;
  const out = path.join(path.dirname(file), `import-report-${COMMIT ? "committed" : "dry-run"}.md`);
  fs.writeFileSync(out, report);
  console.log(report.split("## ")[0]);
  console.log(`Report: ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

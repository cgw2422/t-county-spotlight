/**
 * Removes everything the importer created from the FIXTURE site (fake WP
 * server / fixture WXR) so the dev database is left without fake content.
 * Only rows that are provably fixture data are touched:
 *   - Article / Business with wpMeta.base = fixture base
 *   - Page / terms / records whose WpRecord.sourceUrl starts with the base,
 *     or terms created by the importer whose name starts with "Fixture"
 *   - Media (+ blobs) whose sourceUrl starts with the base
 *   - Redirects listed in fixture runs' reports (source = migration)
 *   - MigrationRun rows for the fixture base, and settings pointing at fixture media
 *
 *   npx tsx --conditions=react-server scripts/fixtures/cleanup-fixture-data.ts
 */
import "dotenv/config";

export async function cleanupFixtureData(base = "http://localhost:8787") {
  const { db } = await import("../../src/lib/db");
  const { deleteObject } = await import("../../src/lib/storage");
  const out: Record<string, number> = {};

  const runs = await db.migrationRun.findMany({ select: { id: true, options: true, report: true } });
  const fixtureRuns = runs.filter((r) => {
    const o = (r.options ?? {}) as { baseUrl?: string };
    const rep = (r.report ?? {}) as { baseUrl?: string };
    return o.baseUrl?.startsWith(base) || rep.baseUrl?.startsWith(base);
  });
  const redirectFroms = new Set<string>();
  for (const r of fixtureRuns) for (const x of ((r.report as { redirects?: { list?: { from: string }[] } } | null)?.redirects?.list ?? [])) redirectFroms.add(x.from);

  const articles = await db.article.findMany({ where: { wpMeta: { path: ["base"], equals: base } }, select: { id: true, legacyPath: true, slug: true } });
  const businesses = await db.business.findMany({ where: { wpMeta: { path: ["base"], equals: base } }, select: { id: true, slug: true, legacyPath: true } });
  const records = await db.wpRecord.findMany({ where: { OR: [{ sourceUrl: { startsWith: base } }, { title: { startsWith: "Fixture" } }, { targetId: { in: [...articles.map((a) => a.id), ...businesses.map((b) => b.id)] } }] } });
  const pageIds = records.filter((r) => r.targetType === "Page" && r.targetId).map((r) => r.targetId!);

  // redirects: anything a fixture run created, plus migration redirects pointing at fixture records
  const fixturePaths = [...articles.map((a) => a.legacyPath ?? `/articles/${a.slug}/`), ...businesses.map((b) => `/business/${b.slug}/`)];
  out.redirects = (await db.redirect.deleteMany({ where: { source: "migration", OR: [{ fromPath: { in: [...redirectFroms] } }, { toPath: { in: fixturePaths } }] } })).count;

  out.articles = (await db.article.deleteMany({ where: { id: { in: articles.map((a) => a.id) } } })).count;
  out.businesses = (await db.business.deleteMany({ where: { id: { in: businesses.map((b) => b.id) } } })).count;
  out.pages = (await db.page.deleteMany({ where: { id: { in: pageIds }, title: { contains: "Fixture" } } })).count;

  const termTargets = (t: string) => records.filter((r) => r.targetType === t && r.targetId).map((r) => r.targetId!);
  out.categories = (await db.category.deleteMany({ where: { OR: [{ id: { in: termTargets("Category") } }, { name: { startsWith: "Fixture" }, wpId: { not: null } }], articles: { none: {} } } })).count;
  out.tags = (await db.tag.deleteMany({ where: { OR: [{ id: { in: termTargets("Tag") } }, { name: { startsWith: "Fixture" }, wpId: { not: null } }], articles: { none: {} } } })).count;
  out.businessCategories = (await db.businessCategory.deleteMany({ where: { name: { startsWith: "Fixture" }, wpTaxonomy: { not: null }, businesses: { none: {} } } })).count;
  // "Uncategorized" (wp id 1) created by the fixture run, only if nothing uses it and it came from the fixture
  const uncategorized = records.find((r) => r.wpType === "term:category" && r.wpId === 1 && r.sourceUrl?.startsWith(base));
  if (uncategorized?.targetId) out.categories += (await db.category.deleteMany({ where: { id: uncategorized.targetId, articles: { none: {} } } })).count;

  const media = await db.media.findMany({ where: { sourceUrl: { startsWith: base } }, select: { id: true, key: true, url: true } });
  for (const m of media) await deleteObject(m.key).catch(() => {});
  out.media = (await db.media.deleteMany({ where: { id: { in: media.map((m) => m.id) } } })).count;
  const mediaUrls = new Set(media.map((m) => m.url));

  out.settings = 0;
  for (const key of ["logoUrl", "faviconUrl"]) {
    const s = await db.setting.findUnique({ where: { key } });
    if (s && typeof s.value === "string" && mediaUrls.has(s.value)) { await db.setting.delete({ where: { key } }); out.settings++; }
  }
  const info = await db.setting.findUnique({ where: { key: "wpSiteInfo" } });
  if (info && String((info.value as { url?: string })?.url ?? "").startsWith(base)) { await db.setting.delete({ where: { key: "wpSiteInfo" } }); out.settings++; }
  const menus = await db.setting.findUnique({ where: { key: "wpMenus" } });
  if (menus && /Fixture/.test(JSON.stringify(menus.value))) { await db.setting.delete({ where: { key: "wpMenus" } }); out.settings++; }

  out.wpRecords = (await db.wpRecord.deleteMany({ where: { id: { in: records.map((r) => r.id) } } })).count;
  out.wpRecords += (await db.wpRecord.deleteMany({ where: { OR: [{ sourceUrl: { startsWith: base } }, { newPath: { in: [...mediaUrls] } }] } })).count;
  out.migrationRuns = (await db.migrationRun.deleteMany({ where: { id: { in: fixtureRuns.map((r) => r.id) } } })).count;
  return out;
}

if (process.argv[1] && /cleanup-fixture-data\.ts$/.test(process.argv[1])) {
  cleanupFixtureData(process.argv[2]).then(async (r) => {
    console.log("Removed fixture data:", r);
    const { db } = await import("../../src/lib/db");
    await db.$disconnect();
  }).catch((e) => { console.error(e); process.exit(1); });
}

/**
 * End-to-end importer test against the fake WordPress server and the fixture
 * WXR file, using the local dev database. Cleans up all fixture rows at the
 * end (pass --keep to inspect them; then run cleanup-fixture-data.ts).
 *
 *   npx tsx --conditions=react-server scripts/fixtures/run-fixture-tests.ts [--keep]
 *
 * Refuses to run when DATABASE_URL does not point at localhost.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (!process.execArgv.join(" ").includes("react-server")) {
  const r = spawnSync(process.execPath, [...process.execArgv, "--conditions=react-server", ...process.argv.slice(1)], { stdio: "inherit", env: process.env });
  process.exit(r.status ?? 1);
}

let failures = 0;
function check(name: string, cond: unknown, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl)) throw new Error("Fixture tests only run against a local database.");
  const keep = process.argv.includes("--keep");
  const { startFakeWpServer, FIXTURE_BASE, FIXTURE_USER, FIXTURE_PASS } = await import("./fake-wp-server");
  const { cleanupFixtureData } = await import("./cleanup-fixture-data");
  const { createRun, executeRun } = await import("../../src/lib/wordpress/run");
  const { parseWxr } = await import("../../src/lib/wordpress/wxr");
  const { wpautop } = await import("../../src/lib/wordpress/html");
  const { db } = await import("../../src/lib/db");

  let server: Awaited<ReturnType<typeof startFakeWpServer>> | null = null;
  try {
    server = await startFakeWpServer();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
    console.log("(fake WP server already running on :8787 — using it)");
  }

  const counts = async () => ({
    articles: await db.article.count(), businesses: await db.business.count(), pages: await db.page.count(),
    categories: await db.category.count(), tags: await db.tag.count(), businessCategories: await db.businessCategory.count(),
    media: await db.media.count(), redirects: await db.redirect.count(), wpRecords: await db.wpRecord.count(),
    links: await db.articleBusiness.count(), photos: await db.businessPhoto.count(),
  });
  const run = async (opts: Parameters<typeof executeRun>[1]) => {
    const r = await createRun(opts);
    return executeRun(r.id, opts);
  };

  try {
    await cleanupFixtureData(FIXTURE_BASE); // start clean
    const settingsBefore = new Map((await db.setting.findMany({ where: { key: { in: ["logoUrl", "faviconUrl", "wpSiteInfo", "wpMenus"] } } })).map((s) => [s.key, s.value]));
    const before = await counts();

    console.log("\n▶ unit: wpautop / WXR parser");
    check("wpautop wraps paragraphs and line breaks", wpautop("A\nB\n\nC") === "<p>A<br />\nB</p>\n<p>C</p>", wpautop("A\nB\n\nC"));
    const wxrSnap = parseWxr(fs.readFileSync(path.join(__dirname, "fixture-export.xml"), "utf8"));
    check("WXR: 8 content items (incl. form submission), 1 attachment", wxrSnap.items.length === 8 && wxrSnap.media.length === 1, { items: wxrSnap.items.length, media: wxrSnap.media.length });
    check("WXR: statuses draft/pending/private/future/publish", ["draft", "pending", "private", "future", "publish"].every((s) => wxrSnap.items.some((i) => i.status === s)));
    check("WXR: serialized ACF gallery unserialized", JSON.stringify(wxrSnap.items.find((i) => i.id === 721)?.meta.gallery) === '["120"]');
    check("WXR: attachment size variants parsed", wxrSnap.media[0].variants.some((v) => v.endsWith("fixture-wxr-photo-300x200.png")));
    check("WXR: menu parsed", wxrSnap.menus[0]?.items[0]?.title === "Fixture WXR Menu Link");

    console.log("\n▶ REST dry run (no writes)");
    const dry = await run({ source: "rest", baseUrl: FIXTURE_BASE, dryRun: true, username: FIXTURE_USER, appPassword: FIXTURE_PASS });
    const afterDry = await counts();
    check("dry run plans 14 records", dry.plan?.length === 14, dry.plan?.length);
    check("dry run writes no content", JSON.stringify({ ...afterDry, wpRecords: 0 }) === JSON.stringify({ ...before, wpRecords: 0 }), { before, afterDry });

    console.log("\n▶ REST import without credentials");
    const anon = await run({ source: "rest", baseUrl: FIXTURE_BASE, username: "", appPassword: "" });
    check("public run: 7 articles (no draft/scheduled)", anon.imported.articles === 7, anon.imported.articles);
    check("public run records menus endpoint as requiring credentials", anon.requiresCredentials.includes("/wp/v2/menus"), anon.requiresCredentials);

    console.log("\n▶ REST import with Application Password");
    const r1 = await run({ source: "rest", baseUrl: FIXTURE_BASE, username: FIXTURE_USER, appPassword: FIXTURE_PASS });
    const c1 = await counts();
    check("9 articles (7 posts + 2 other CPTs incl. sitemap-only type)", r1.imported.articles === 9, r1.imported);
    check("3 businesses, 2 pages", r1.imported.businesses === 3 && r1.imported.pages === 2);
    check("kinds: 2 SPOTLIGHT, 2 ANNOUNCEMENT, 1 THINGS_TO_DO, 1 NEWS, 3 GENERAL", JSON.stringify(r1.imported.articlesByKind) === JSON.stringify({ SPOTLIGHT: 2, ANNOUNCEMENT: 2, THINGS_TO_DO: 1, GENERAL: 3, NEWS: 1 }), r1.imported.articlesByKind);
    check("statuses: draft + scheduled imported", r1.imported.articlesByStatus.DRAFT === 1 && r1.imported.articlesByStatus.SCHEDULED === 1, r1.imported.articlesByStatus);
    check("no failed records", r1.failed.length === 0, r1.failed);
    check("missing file reported (fixture-missing.png)", r1.missingFiles.length === 1 && r1.missingFiles[0].url.endsWith("fixture-missing.png"), r1.missingFiles);
    check("broken link /fixture-missing-page/ reported", r1.brokenLinks.length === 1 && r1.brokenLinks[0].href === "/fixture-missing-page/", r1.brokenLinks);
    check("unmapped CPTs listed", r1.unmappedPostTypes.map((u) => u.type).sort().join() === "fixture_event,fixture_recipe", r1.unmappedPostTypes);
    check("unmapped fields listed", r1.unmappedFields.some((f) => f.field === "fixture_rating"), r1.unmappedFields);

    const spot = await db.article.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 11 } }, include: { businesses: { include: { business: true } }, categories: true, tags: true } });
    check("spotlight keeps WP path as legacyPath", spot?.legacyPath === "/2024/05/business-spotlight-fixture-coffee-co/");
    check("title decoded, text verbatim", spot?.title === "Business Spotlight: Fixture Coffee Co – Test Data" && !!spot?.content.includes("Fixture paragraph &#8220;quoted&#8221; — this is importer test data."));
    check("originalContent untouched", !!spot?.originalContent?.includes(`${FIXTURE_BASE}/wp-content/uploads/2024/05/fixture-latte-1024x768.jpg`));
    check("sized variants + srcset rewritten to stored original", !!spot && !spot.content.includes("/wp-content/uploads/") && (spot.content.match(/\/media\/[^"\s]+fixture-latte-scaled-[a-f0-9]+\.jpg/g)?.length ?? 0) >= 3, spot?.content);
    check("internal absolute links made relative", !!spot?.content.includes('href="/business/fixture-coffee-co/"') && !spot?.content.includes(`href="${FIXTURE_BASE}`));
    check("SEO title/description from Yoast", spot?.seoTitle === "Fixture Coffee Co Spotlight | Fixture SEO" && spot?.seoDescription === "Fixture SEO description.");
    check("featured + og image stored", !!spot?.featuredImageUrl?.startsWith("/media/") && !!spot?.ogImageUrl?.startsWith("/media/"));
    check("categories + tags linked", spot?.categories.length === 1 && spot?.tags.length === 1);
    check("spotlight linked to Fixture Coffee Co", spot?.businesses.some((b) => b.business.slug === "fixture-coffee-co"));
    const general = await db.article.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 14 } }, include: { businesses: { include: { business: true } } } });
    check("ACF relationship links article to Fixture Bakery & Bread", general?.businesses.some((b) => b.business.slug === "fixture-bakery-bread"));
    check("Photon (i0.wp.com) URL rewritten", !!general && !general.content.includes("wp.com"), general?.content);
    const weekend = await db.article.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 13 } }, include: { businesses: { include: { business: true } } } });
    check("business name in title links article", weekend?.businesses.some((b) => b.business.slug === "fixture-hardware-store"));
    const draft = await db.article.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 16 } } });
    check("draft: DRAFT status, generated slug, no legacy path", draft?.status === "DRAFT" && draft.slug === "fixture-draft-spotlight" && draft.legacyPath === null, draft && { s: draft.status, slug: draft.slug, lp: draft.legacyPath });
    const ann = await db.article.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 12 } } });
    check("PDF link rewritten to stored file", !!ann?.content.match(/href="\/media\/[^"]+fixture-flyer/));

    const coffee = await db.business.findUnique({ where: { slug: "fixture-coffee-co" }, include: { categories: true, photos: true } });
    check("business ACF fields mapped", coffee?.address === "123 Fixture St" && coffee.city === "Dover" && coffee.zip === "44622" && coffee.phone === "330-555-0101" && coffee.website === "https://fixture-coffee.test", coffee);
    check("business socials", (coffee?.socials as Record<string, string>)?.facebook === "https://facebook.com/fixturecoffee");
    check("business logo + cover + 2 gallery photos", !!coffee?.logoUrl?.startsWith("/media/") && !!coffee?.coverUrl?.startsWith("/media/") && coffee?.photos.length === 2);
    check("business category from custom taxonomy", coffee?.categories.some((c) => c.slug === "fixture-cafes"));
    check("business spotlighted (has published spotlight article)", coffee?.isSpotlighted === true);
    check("hours text kept in wpMeta", ((coffee?.wpMeta as { mapped?: { hoursText?: string } })?.mapped?.hoursText ?? "").includes("7am"));
    const hw = await db.business.findUnique({ where: { slug: "fixture-hardware-store" }, include: { categories: true } });
    check("ACF google map + hours repeater mapped", hw?.latitude === 40.5031 && hw.city === "Sugarcreek" && Array.isArray(hw.hours) && hw.categories.length === 2, hw && { lat: hw.latitude, city: hw.city, hours: hw.hours });
    const bakery = await db.business.findUnique({ where: { slug: "fixture-bakery-bread" } });
    check("REST meta fields mapped (business_phone/business_city)", bakery?.phone === "330-555-0102" && bakery.city === "New Philadelphia" && bakery.name === "Fixture Bakery & Bread");
    check("hidden CPT scraped from HTML", !!(await db.article.findUnique({ where: { wpType_wpId: { wpType: "fixture_event", wpId: 601 } } }))?.content.includes("Nested fixture block"));
    const child = await db.page.findUnique({ where: { wpId: 22 } });
    check("child page keeps nested path", child?.legacyPath === "/about-fixture-site/contact-fixture/");

    const redirects = await db.redirect.findMany({ where: { source: "migration" } });
    const rmap = new Map(redirects.map((r) => [r.fromPath, r.toPath]));
    check("redirect /?p=11 → legacy path", rmap.get("/?p=11") === "/2024/05/business-spotlight-fixture-coffee-co/");
    check("redirect /category/<slug>/ → /articles/?category=", rmap.get("/category/fixture-news/") === "/articles/?category=fixture-news");
    check("redirect /tag/<slug>/ → /articles/?tag=", rmap.get("/tag/fixture-tag/") === "/articles/?tag=fixture-tag");
    check("redirect business taxonomy archive", rmap.get("/business-category/fixture-cafes/") === "/businesses/?category=fixture-cafes");
    check("no redirect shadows imported content", !rmap.has("/2024/05/business-spotlight-fixture-coffee-co/"));
    const logo = await db.setting.findUnique({ where: { key: "logoUrl" } });
    if (!settingsBefore.has("logoUrl")) check("site logo imported into empty setting", typeof logo?.value === "string" && logo.value.startsWith("/media/"));
    else check("existing logo setting kept", JSON.stringify(logo?.value) === JSON.stringify(settingsBefore.get("logoUrl")));
    const recs = await db.wpRecord.groupBy({ by: ["status"], _count: true, where: { sourceUrl: { startsWith: FIXTURE_BASE } } });
    console.log("    WpRecord statuses:", Object.fromEntries(recs.map((r) => [r.status, r._count])));

    console.log("\n▶ idempotency (second run)");
    const r2 = await run({ source: "rest", baseUrl: FIXTURE_BASE, username: FIXTURE_USER, appPassword: FIXTURE_PASS });
    const c2 = await counts();
    check("no new rows anywhere", JSON.stringify(c1) === JSON.stringify(c2), { c1, c2 });
    check("0 created, all updated", r2.imported.created === 0 && r2.imported.updated === r1.imported.created + r1.imported.updated, r2.imported);
    check("0 media downloads (all reused)", r2.media.downloaded === 0 && r2.media.reused > 0, r2.media);
    check("0 redirects created", r2.redirects.created === 0, r2.redirects);

    console.log("\n▶ local edit protection");
    await db.article.update({ where: { id: spot!.id }, data: { content: "<p>LOCAL EDIT</p>", localEditedAt: new Date() } });
    await db.business.update({ where: { id: coffee!.id }, data: { phone: "LOCAL PHONE", email: null } });
    const r3 = await run({ source: "rest", baseUrl: FIXTURE_BASE, username: FIXTURE_USER, appPassword: FIXTURE_PASS });
    const a3 = await db.article.findUnique({ where: { id: spot!.id } });
    const b3 = await db.business.findUnique({ where: { id: coffee!.id } });
    check("edited article not overwritten", a3?.content === "<p>LOCAL EDIT</p>");
    check("edited business keeps local phone, empty email refilled", b3?.phone === "LOCAL PHONE" && b3.email === "hello@fixture-coffee.test", b3 && { phone: b3.phone, email: b3.email });
    check("report lists 2 preserved local edits", r3.preservedLocalEdits.length === 2, r3.preservedLocalEdits);
    const wr = await db.wpRecord.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 11 } } });
    check("WpRecord status preserved_local_edits", wr?.status === "preserved_local_edits");
    const r4 = await run({ source: "rest", baseUrl: FIXTURE_BASE, force: true, username: FIXTURE_USER, appPassword: FIXTURE_PASS });
    const a4 = await db.article.findUnique({ where: { id: spot!.id } });
    const b4 = await db.business.findUnique({ where: { id: coffee!.id } });
    check("--force restores WordPress content", a4?.content.includes("Fixture paragraph") && a4.localEditedAt === null && b4?.phone === "330-555-0101" && r4.preservedLocalEdits.length === 0);

    console.log("\n▶ WXR import");
    const xml = fs.readFileSync(path.join(__dirname, "fixture-export.xml"), "utf8");
    const w1 = await run({ source: "wxr", wxrXml: xml, wxrFilename: "fixture-export.xml" });
    check("WXR: 5 posts imported (publish/draft/pending/private/future)", w1.imported.articles === 5, w1.imported);
    check("WXR: statuses mapped", JSON.stringify(w1.imported.articlesByStatus) === JSON.stringify({ PUBLISHED: 1, DRAFT: 1, PENDING: 1, UNPUBLISHED: 1, SCHEDULED: 1 }), w1.imported.articlesByStatus);
    check("WXR: 1 business, 1 page", w1.imported.businesses === 1 && w1.imported.pages === 1);
    check("WXR: form submission skipped", w1.skipped.some((s) => s.type === "flamingo_inbound"), w1.skipped);
    check("WXR: unknown shortcode reported", w1.unexpandedShortcodes.some((s) => s.shortcode === "fixture_unknown_shortcode"), w1.unexpandedShortcodes);
    const wa = await db.article.findUnique({ where: { wpType_wpId: { wpType: "post", wpId: 701 } }, include: { businesses: { include: { business: true } } } });
    check("WXR: wpautop + [caption] → figure, variant rewritten", !!wa?.content.includes("<p>Fixture WXR first paragraph — test data only.<br />") && !!wa.content.includes('<figure id="attachment_120"') && !!wa.content.match(/src="\/media\/[^"]+fixture-wxr-photo/), wa?.content);
    check("WXR: original raw content kept", wa?.originalContent?.startsWith("Fixture WXR first paragraph"));
    check("WXR: Yoast %%vars%% resolved", wa?.seoTitle === "Fixture WXR Spotlight: Fixture WXR Salon - Fixture WXR Test Site", wa?.seoTitle);
    check("WXR: spotlight linked to business + business spotlighted", wa?.kind === "SPOTLIGHT" && wa.businesses[0]?.business.slug === "fixture-wxr-salon" && wa.businesses[0].business.isSpotlighted);
    const wb = await db.business.findUnique({ where: { slug: "fixture-wxr-salon" }, include: { categories: true, photos: true } });
    check("WXR: business postmeta mapped", wb?.address === "9 Fixture Rd" && wb.city === "Strasburg" && wb.phone === "330-555-0199" && !!wb.logoUrl && wb.photos.length === 1 && wb.categories[0]?.name === "Fixture WXR Salons & Spas", wb);
    const w2 = await run({ source: "wxr", wxrXml: xml, wxrFilename: "fixture-export.xml" });
    check("WXR: second run idempotent", w2.imported.created === 0 && w2.media.downloaded === 0, { created: w2.imported.created, dl: w2.media.downloaded });

    fs.mkdirSync("migration-reports", { recursive: true });
    const { reportToMarkdown } = await import("../../src/lib/wordpress/report");
    fs.writeFileSync("migration-reports/fixture-rest-report.md", reportToMarkdown(r1));
    fs.writeFileSync("migration-reports/fixture-wxr-report.md", reportToMarkdown(w1));
    console.log("\n  Sample reports written to migration-reports/fixture-*-report.md");
  } finally {
    if (!keep) {
      const removed = await cleanupFixtureData(FIXTURE_BASE);
      console.log("\n▶ cleanup:", removed);
      const left = {
        articles: await db.article.count({ where: { wpMeta: { path: ["base"], equals: FIXTURE_BASE } } }),
        media: await db.media.count({ where: { sourceUrl: { startsWith: FIXTURE_BASE } } }),
        runs: (await db.migrationRun.findMany()).filter((r) => JSON.stringify(r.report ?? r.options).includes(FIXTURE_BASE)).length,
      };
      check("no fixture rows left", left.articles === 0 && left.media === 0 && left.runs === 0, left);
    }
    server?.close();
    await db.$disconnect();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

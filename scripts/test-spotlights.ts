/**
 * Business Spotlight (derived) + Featured Local Businesses ordering tests against the local DB.
 *
 *   DATABASE_URL=postgresql://tcs:tcs@localhost:5432/tcs npx tsx --conditions=react-server scripts/test-spotlights.ts
 *
 * Creates TEST-prefixed businesses/articles/placements and deletes them at the end.
 * Refuses to run when DATABASE_URL does not point at localhost.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl)) throw new Error("test-spotlights only runs against a local database.");

const P = "test-spot-";
let n = 0;
async function t(name: string, fn: () => Promise<void> | void) { await fn(); n++; console.log(`  ✓ ${name}`); }

async function main() {
  const { db } = await import("../src/lib/db");
  const { businessCardSelect, getFeaturedBusinesses } = await import("../src/lib/queries");
  const { spotlightArticlesSelect, spotlightFrom, hasPublishedSpotlightWhere, getBusinessSpotlightArticles } = await import("../src/lib/spotlights");

  const cleanup = async () => {
    await db.placement.deleteMany({ where: { title: { startsWith: "TEST " } } });
    await db.article.deleteMany({ where: { slug: { startsWith: P } } });
    await db.business.deleteMany({ where: { slug: { startsWith: P } } });
  };
  await cleanup();

  const day = 86400_000;
  const now = Date.now();
  const biz = (slug: string, extra: Record<string, unknown> = {}) =>
    db.business.create({ data: { slug: P + slug, name: `TEST ${slug}`, status: "PUBLISHED", publishedAt: new Date(now - 30 * day), ...extra } });
  const article = (slug: string, businessId: string | null, extra: Record<string, unknown> = {}) =>
    db.article.create({
      data: {
        slug: P + slug, title: `TEST ${slug}`, content: "<p>TEST</p>", kind: "SPOTLIGHT", status: "PUBLISHED", publishedAt: new Date(now - day), ...extra,
        ...(businessId ? { businesses: { create: { businessId } } } : {}),
      },
    });
  const spot = async (id: string) =>
    spotlightFrom((await db.business.findUniqueOrThrow({ where: { id }, select: { articles: spotlightArticlesSelect() } })).articles);
  const card = async (id: string) => {
    const b = await db.business.findUniqueOrThrow({ where: { id }, select: businessCardSelect() });
    return spotlightFrom(b.articles);
  };

  try {
    console.log("Derived spotlight");
    const a = await biz("a");
    await t("published SPOTLIGHT linked → spotlight href + title (card select + direct select)", async () => {
      await article("a-story", a.id);
      assert.deepEqual(await spot(a.id), { href: `/articles/${P}a-story/`, title: "TEST a-story" });
      assert.deepEqual(await card(a.id), { href: `/articles/${P}a-story/`, title: "TEST a-story" });
    });
    await t("legacyPath is the canonical href", async () => {
      const b = await biz("legacy");
      await article("legacy-story", b.id, { legacyPath: `/2024/05/${P}legacy-story/` });
      assert.equal((await spot(b.id))?.href, `/2024/05/${P}legacy-story/`);
    });
    const none = async (slug: string, extra: Record<string, unknown>) => {
      const b = await biz(slug);
      await article(`${slug}-story`, b.id, extra);
      assert.equal(await spot(b.id), null);
      assert.equal(await card(b.id), null);
      assert.equal(await db.business.count({ where: { id: b.id, ...hasPublishedSpotlightWhere() } }), 0);
    };
    await t("DRAFT spotlight → null", () => none("draft", { status: "DRAFT", publishedAt: null }));
    await t("UNPUBLISHED spotlight → null", () => none("unpub", { status: "UNPUBLISHED" }));
    await t("SCHEDULED spotlight → null", () => none("sched", { status: "SCHEDULED", publishedAt: new Date(now + 3 * day) }));
    await t("PUBLISHED but future-dated spotlight → null", () => none("future", { publishedAt: new Date(now + 3 * day) }));
    await t("soft-deleted spotlight → null", () => none("deleted", { deletedAt: new Date() }));
    await t("GENERAL article linked → null", () => none("general", { kind: "GENERAL" }));
    await t("NEWS article linked → null", () => none("news", { kind: "NEWS" }));
    await t("isSpotlighted=true with no article → null", async () => {
      const b = await biz("flag-only", { isSpotlighted: true });
      assert.equal(await spot(b.id), null);
      assert.equal(await card(b.id), null);
    });

    await t("two published spotlights → most recent publishedAt; unpublishing the newest falls back; unpublishing all → null", async () => {
      const b = await biz("two");
      const older = await article("two-older", b.id, { publishedAt: new Date(now - 10 * day) });
      const newer = await article("two-newer", b.id, { publishedAt: new Date(now - 2 * day) });
      assert.equal((await spot(b.id))?.title, "TEST two-newer");
      await db.article.update({ where: { id: newer.id }, data: { status: "UNPUBLISHED" } });
      assert.equal((await spot(b.id))?.title, "TEST two-older");
      await db.article.update({ where: { id: older.id }, data: { status: "UNPUBLISHED" } });
      assert.equal(await spot(b.id), null);
    });
    await t("changing kind / deleting the story removes the badge", async () => {
      const b = await biz("rekind");
      const s = await article("rekind-story", b.id);
      assert.ok(await spot(b.id));
      await db.article.update({ where: { id: s.id }, data: { kind: "NEWS" } });
      assert.equal(await spot(b.id), null);
      await db.article.update({ where: { id: s.id }, data: { kind: "SPOTLIGHT" } });
      assert.ok(await spot(b.id));
      await db.article.delete({ where: { id: s.id } });
      assert.equal(await spot(b.id), null);
    });
    await t("admin helper lists linked spotlight articles with live flag", async () => {
      const b = await biz("admin");
      await article("admin-live", b.id, { publishedAt: new Date(now - 5 * day) });
      await article("admin-draft", b.id, { status: "DRAFT", publishedAt: null });
      await article("admin-general", b.id, { kind: "GENERAL" });
      const rows = await getBusinessSpotlightArticles(b.id);
      assert.deepEqual(rows.map((r) => [r.title, r.live]), [["TEST admin-live", true], ["TEST admin-draft", false]]);
    });

    console.log("Featured Local Businesses ordering");
    await t("pinned → isFeatured → others (updatedAt desc); spotlight articles and isSpotlighted have no effect", async () => {
      // Only TEST businesses exist in this local DB, so assert the relative order of ours.
      const plain1 = await biz("ord-plain-1");
      const featured = await biz("ord-featured", { isFeatured: true });
      const spotted = await biz("ord-spotlighted", { isSpotlighted: true });
      await article("ord-spot-story", spotted.id);
      const pinned = await biz("ord-pinned");
      const plain2 = await biz("ord-plain-2");
      // Make updatedAt order explicit: plain2 newest, then spotted, then plain1.
      await db.business.update({ where: { id: plain1.id }, data: { updatedAt: new Date(now - 3 * day) } });
      await db.business.update({ where: { id: spotted.id }, data: { updatedAt: new Date(now - 2 * day) } });
      await db.business.update({ where: { id: plain2.id }, data: { updatedAt: new Date(now - 1 * day) } });
      // A sponsored placement must not change the featured section.
      await db.placement.create({ data: { businessId: plain1.id, slot: "homepage_featured", title: "TEST sponsored", isActive: true, startsAt: new Date(now - day) } });
      const ids = [pinned.id, featured.id, plain1.id, plain2.id, spotted.id];
      const total = await db.business.count({ where: { status: "PUBLISHED", deletedAt: null } });
      const list = await getFeaturedBusinesses([pinned.id], total + 5);
      const order = list.map((b) => b.id).filter((id) => ids.includes(id));
      assert.equal(list[0].id, pinned.id, "pinned first");
      assert.deepEqual(order, [pinned.id, featured.id, plain2.id, spotted.id, plain1.id]);
      // every isFeatured business precedes every non-featured one (after the pinned)
      const flags = await db.business.findMany({ where: { id: { in: list.map((b) => b.id) } }, select: { id: true, isFeatured: true } });
      const isF = new Map(flags.map((f) => [f.id, f.isFeatured]));
      const rest = list.slice(1).map((b) => isF.get(b.id));
      assert.ok(rest.indexOf(false) === -1 || !rest.slice(rest.indexOf(false)).includes(true), "featured before others");
    });
    await t("limit respected; pinned unpublished business is skipped", async () => {
      const hidden = await biz("ord-hidden", { status: "DRAFT" });
      const list = await getFeaturedBusinesses([hidden.id], 2);
      assert.equal(list.length, 2);
      assert.ok(!list.some((b) => b.id === hidden.id));
    });
    await t("homepage businesses section no longer reads placements (source check)", () => {
      const src = readFileSync(path.join(__dirname, "../src/app/(site)/page.tsx"), "utf8");
      const block = src.slice(src.indexOf('case "businesses"'), src.indexOf('case "spotlights"'));
      assert.ok(block.length > 0);
      assert.ok(!block.includes("getActivePlacements"), "no placements in businesses section");
      assert.ok(!/sponsored[=I]|badge-sponsored/.test(block), "no sponsored cards in businesses section");
    });
  } finally {
    await cleanup();
    await db.$disconnect();
  }
  console.log(`\n${n} spotlight tests passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });

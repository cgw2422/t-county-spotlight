/**
 * Phase 1 fixes — library-level checks against the real database:
 *  - claim detection for business applications
 *  - premium-content visibility where-fragments (specials, updates, openings) for
 *    entitled / not entitled / expired / feature-off plans / Free-plan-grants cases,
 *    through the real public queries (specials list, homepage, My T County, search,
 *    saved items, communities, openings, notifications items)
 *  - sole-owner account-deletion blocks for businesses and organizations
 *
 *   npx tsx --conditions=react-server scripts/test-phase1.ts
 *
 * Creates only TEST-prefixed records and removes them (and restores the Free plan) at the end.
 * Server actions (claim approval, team page, account deletion, billing guards) are covered
 * end-to-end by the Playwright run.
 */
import assert from "node:assert/strict";

const P = "test-p1-";
const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 4).join(" | ")}`);
  }
}

async function main() {
  const { db } = await import("@/lib/db");
  const { applicationClaim } = await import("@/lib/applications");
  const { entitledBusinessWhere, publicUpdateEntitlementWhere, getBusinessEntitlements } = await import("@/lib/entitlements");
  const { publicPromotionWhere, promotionBusinessWhere } = await import("@/lib/promotions");
  const { publicOpeningsWhere, getOpenings } = await import("@/lib/openings");
  const { getActiveSpecials } = await import("@/lib/queries");
  const { runSearch } = await import("@/lib/search");
  const { findSaveableTarget, resolveSavedItems } = await import("@/lib/saved");
  const { getCommunityPageData } = await import("@/lib/communities");
  const { fetchLocalItems } = await import("@/lib/notifications/items");
  const { soleOwnershipBlocks } = await import("@/lib/sole-ownership");

  const now = new Date();
  const day = 86400_000;
  const freePlan = await db.membershipPlan.findFirst({ where: { interval: "FREE" }, orderBy: { sortOrder: "asc" } });
  const paidPlan = await db.membershipPlan.findFirst({ where: { interval: { not: "FREE" } }, orderBy: { sortOrder: "asc" } });
  assert.ok(freePlan && paidPlan, "seeded Free + paid plans required");
  const freeOriginal = freePlan.entitlements;

  const cleanup = async () => {
    const bizIds = (await db.business.findMany({ where: { slug: { startsWith: P } }, select: { id: true } })).map((b) => b.id);
    await db.businessUpdate.deleteMany({ where: { OR: [{ businessId: { in: bizIds } }, { title: { startsWith: P } }] } });
    await db.savedItem.deleteMany({ where: { user: { email: { startsWith: P } } } });
    await db.business.deleteMany({ where: { id: { in: bizIds } } }); // cascades promotions, subscriptions, owners
    await db.organization.deleteMany({ where: { slug: { startsWith: P } } });
    await db.membershipPlan.deleteMany({ where: { slug: { startsWith: P } } });
    await db.businessApplication.deleteMany({ where: { email: { startsWith: P } } });
    await db.user.deleteMany({ where: { email: { startsWith: P } } });
    await db.membershipPlan.update({ where: { id: freePlan.id }, data: { entitlements: freeOriginal as object } });
  };
  await cleanup();

  try {
    // ───────── fixtures ─────────
    const owner = await db.user.create({ data: { email: `${P}owner@example.com`, role: "BUSINESS_OWNER", name: "Test Owner" } });
    const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
    assert.ok(admin);
    const city = "New Philadelphia";
    const mk = async (key: string) => db.business.create({ data: { slug: `${P}${key}`, name: `${P}${key} biz`, city, status: "PUBLISHED", publishedAt: now, owners: { create: { userId: owner.id } } } });
    const premium = await mk("premium");
    const free = await mk("free");
    const expired = await mk("expired");
    const canceled = await mk("canceled");
    const featureOff = await mk("featureoff");
    const keyMissing = await mk("keymissing");
    const offPlan = await db.membershipPlan.create({ data: { slug: `${P}nospecials`, name: "TEST no specials", interval: "MONTH", entitlements: { promotions: false, updates: false } } });
    const emptyPlan = await db.membershipPlan.create({ data: { slug: `${P}defaults`, name: "TEST defaults", interval: "MONTH", entitlements: {} } });
    await db.subscription.createMany({
      data: [
        { businessId: premium.id, planId: paidPlan.id, source: "manual", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() + 20 * day) },
        { businessId: expired.id, planId: paidPlan.id, source: "manual", status: "ACTIVE", currentPeriodEnd: new Date(now.getTime() - day) },
        { businessId: canceled.id, planId: paidPlan.id, source: "manual", status: "CANCELED", currentPeriodEnd: new Date(now.getTime() + 20 * day) },
        { businessId: featureOff.id, planId: offPlan.id, source: "manual", status: "ACTIVE", currentPeriodEnd: null },
        { businessId: keyMissing.id, planId: emptyPlan.id, source: "manual", status: "TRIALING", currentPeriodEnd: new Date(now.getTime() + day) },
      ],
    });
    const all = [premium, free, expired, canceled, featureOff, keyMissing];
    const promo: Record<string, string> = {};
    for (const b of all) {
      promo[b.id] = (await db.promotion.create({ data: { slug: `${b.slug}-deal`, title: `${P}deal ${b.slug}`, businessId: b.id, status: "APPROVED", startsAt: new Date(now.getTime() - day), createdById: owner.id } })).id;
    }
    const upd = async (b: { id: string } | null, kind: "GENERAL" | "COMING_SOON", submittedById: string | null, tag: string) =>
      (await db.businessUpdate.create({ data: { businessId: b?.id ?? null, businessName: b ? null : `${P}unlisted`, kind, title: `${P}${tag}`, body: "Test body", status: "PUBLISHED", publishedAt: now, submittedById, city } })).id;
    const uPremiumOwner = await upd(premium, "GENERAL", owner.id, "premium-owner");
    const uFreeOwner = await upd(free, "GENERAL", owner.id, "free-owner");
    const uFreeStaff = await upd(free, "GENERAL", admin.id, "free-staff");
    const uFreeLegacy = await upd(free, "GENERAL", null, "free-legacy");
    const oPremiumOwner = await upd(premium, "COMING_SOON", owner.id, "premium-opening");
    const oFreeOwner = await upd(free, "COMING_SOON", owner.id, "free-opening");
    const oFreeStaff = await upd(free, "COMING_SOON", admin.id, "free-staff-opening");
    const oUnlisted = await upd(null, "COMING_SOON", owner.id, "unlisted-opening");

    const testBizIds = all.map((b) => b.id);
    const visiblePromoBiz = async () => (await db.promotion.findMany({ where: { ...(await publicPromotionWhere()), businessId: { in: testBizIds } }, select: { businessId: true } })).map((p) => p.businessId).sort();

    // ───────── 1. claims ─────────
    await test("applicationClaim: data.claim → claim", async () => {
      assert.deepEqual(applicationClaim({ data: { claim: { businessId: "b1", name: "X" } }, businessId: "b1", status: "PENDING" }), { businessId: "b1", name: "X" });
      assert.deepEqual(applicationClaim({ data: { claim: { businessId: "b1", name: "X" } }, businessId: "b1", status: "APPROVED" }), { businessId: "b1", name: "X" });
    });
    await test("applicationClaim: new business (claim null / approved with businessId) → null", async () => {
      assert.equal(applicationClaim({ data: { claim: null, wantsJobPosting: false }, businessId: null, status: "PENDING" }), null);
      assert.equal(applicationClaim({ data: { claim: null }, businessId: "created", status: "APPROVED" }), null);
      assert.equal(applicationClaim({ data: null, businessId: null, status: "PENDING" }), null);
    });
    await test("applicationClaim: legacy pending row with businessId but no data.claim → claim", async () => {
      assert.deepEqual(applicationClaim({ data: { source: "x" }, businessId: "b9", status: "PENDING" }), { businessId: "b9", name: "" });
    });

    // ───────── 5. premium content visibility ─────────
    await test("entitledBusinessWhere agrees with getBusinessEntitlements for every fixture", async () => {
      const where = await entitledBusinessWhere("promotions");
      assert.ok(where, "Free plan does not grant promotions in the seed");
      const matched = new Set((await db.business.findMany({ where: { AND: [where, { id: { in: testBizIds } }] }, select: { id: true } })).map((b) => b.id));
      for (const b of all) assert.equal(matched.has(b.id), (await getBusinessEntitlements(b.id)).entitlements.promotions, b.slug);
    });
    await test("specials: only currently-entitled listings are public (expired/canceled/feature-off hidden, missing key = granted)", async () => {
      assert.deepEqual(await visiblePromoBiz(), [premium.id, keyMissing.id].sort());
    });
    await test("specials: homepage, search, communities, notifications use the gate", async () => {
      const home = (await getActiveSpecials(500)).map((p) => p.id);
      assert.ok(home.includes(promo[premium.id]) && !home.includes(promo[free.id]) && !home.includes(promo[expired.id]));
      const sr = await runSearch({ q: `${P}deal`, city: null, now: new Date(), includePast: false }, { only: "specials", take: 50 });
      const srIds = (sr.results.specials.rows as { id: string }[]).map((r) => r.id);
      assert.ok(srIds.includes(promo[premium.id]) && !srIds.includes(promo[free.id]) && !srIds.includes(promo[canceled.id]), JSON.stringify(srIds));
      const comm = await getCommunityPageData(city);
      const commIds = (comm.specials as { id: string }[]).map((p) => p.id);
      assert.ok(!commIds.includes(promo[free.id]));
      const items = await fetchLocalItems({ communities: [city], types: ["special", "opening"], take: 50, now: new Date(), start: new Date(), end: new Date(Date.now() + 7 * day) });
      {
        const ids = JSON.stringify(items);
        assert.ok(ids.includes(`${premium.slug}-deal`), "notifications include the entitled special");
        assert.ok(!ids.includes(`${free.slug}-deal`), "notifications must not include hidden special");
      }
    });
    await test("specials: saved items resolve + save target respect the gate", async () => {
      assert.ok(await findSaveableTarget("PROMOTION", promo[premium.id]));
      assert.equal(await findSaveableTarget("PROMOTION", promo[free.id]), null);
      assert.equal(await findSaveableTarget("PROMOTION", promo[free.id], new Date(), { allowEnded: true }), null);
      const resolved = await resolveSavedItems([{ type: "PROMOTION", targetId: promo[premium.id] }, { type: "PROMOTION", targetId: promo[free.id] }] as never);
      const r = JSON.stringify(resolved);
      assert.ok(r.includes(`${premium.slug}-deal`), "entitled special resolves");
      assert.ok(!r.includes(`${free.slug}-deal`), "hidden special resolves as unavailable");
    });
    await test("specials: downgrade hides, re-grant shows again (nothing deleted)", async () => {
      await db.subscription.updateMany({ where: { businessId: premium.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
      assert.ok(!(await visiblePromoBiz()).includes(premium.id));
      assert.equal(await db.promotion.count({ where: { id: promo[premium.id], deletedAt: null, status: "APPROVED" } }), 1);
      await db.subscription.updateMany({ where: { businessId: premium.id }, data: { currentPeriodEnd: new Date(Date.now() + 20 * day) } });
      assert.ok((await visiblePromoBiz()).includes(premium.id));
    });
    await test("Free plan granting promotions/updates removes the restriction", async () => {
      await db.membershipPlan.update({ where: { id: freePlan.id }, data: { entitlements: { ...(freeOriginal as object), promotions: true, updates: true } } });
      assert.equal(await entitledBusinessWhere("promotions"), null);
      assert.deepEqual(await publicUpdateEntitlementWhere(), {});
      assert.equal((await visiblePromoBiz()).length, all.length);
      const pb = await promotionBusinessWhere();
      assert.deepEqual(pb, { deletedAt: null, status: "PUBLISHED" });
      await db.membershipPlan.update({ where: { id: freePlan.id }, data: { entitlements: freeOriginal as object } });
      assert.ok(await entitledBusinessWhere("promotions"));
    });
    await test("updates: owner-posted updates need the entitlement; staff/legacy/unlisted stay public", async () => {
      const gate = await publicUpdateEntitlementWhere();
      const vis = new Set((await db.businessUpdate.findMany({ where: { AND: [{ title: { startsWith: P }, status: "PUBLISHED" }, gate] }, select: { id: true } })).map((u) => u.id));
      assert.ok(vis.has(uPremiumOwner), "premium owner update visible");
      assert.ok(!vis.has(uFreeOwner), "free owner update hidden");
      assert.ok(vis.has(uFreeStaff), "staff-created update visible");
      assert.ok(vis.has(uFreeLegacy), "legacy (no submitter) update visible");
      assert.ok(vis.has(oUnlisted), "businessless announcement visible");
    });
    await test("openings (/new/, search): owner openings of non-entitled listings hidden; staff ones stay", async () => {
      const ids = new Set((await db.businessUpdate.findMany({ where: await publicOpeningsWhere({ title: { startsWith: P } }), select: { id: true } })).map((u) => u.id));
      assert.ok(ids.has(oPremiumOwner) && ids.has(oFreeStaff) && ids.has(oUnlisted));
      assert.ok(!ids.has(oFreeOwner));
      const page = await getOpenings({ city });
      const pageIds = [...page.current, ...page.earlier].map((o) => o.id);
      assert.ok(!pageIds.includes(oFreeOwner) && pageIds.includes(oPremiumOwner));
      const sr = await runSearch({ q: `${P}free`, city: null, now: new Date(), includePast: false }, { only: "new", take: 50 });
      const srIds = (sr.results.new.rows as { id: string }[]).map((r) => r.id);
      assert.ok(srIds.includes(oFreeStaff) && !srIds.includes(oFreeOwner), JSON.stringify(srIds));
    });

    // ───────── 4. sole-owner deletion blocks ─────────
    const u2 = await db.user.create({ data: { email: `${P}second@example.com`, role: "BUSINESS_OWNER" } });
    const mgr = await db.user.create({ data: { email: `${P}manager@example.com`, role: "BUSINESS_OWNER" } });
    const solo = await db.user.create({ data: { email: `${P}solo@example.com`, role: "BUSINESS_OWNER" } });
    const b1 = await db.business.create({ data: { slug: `${P}solo-biz`, name: `${P}solo biz`, status: "PUBLISHED", owners: { create: [{ userId: solo.id, role: "OWNER" }, { userId: mgr.id, role: "MANAGER" }] } } });
    await test("sole OWNER of a business is blocked; a MANAGER is not", async () => {
      const blocks = await soleOwnershipBlocks(solo.id);
      assert.deepEqual(blocks.map((b) => [b.kind, b.id, b.teamHref]), [["business", b1.id, `/dashboard/${b1.id}/team/`]]);
      assert.deepEqual(await soleOwnershipBlocks(mgr.id), []);
    });
    await test("after another OWNER is added (or the manager promoted) the block clears", async () => {
      await db.businessOwner.update({ where: { userId_businessId: { userId: mgr.id, businessId: b1.id } }, data: { role: "OWNER" } });
      assert.deepEqual(await soleOwnershipBlocks(solo.id), []);
      await db.businessOwner.update({ where: { userId_businessId: { userId: mgr.id, businessId: b1.id } }, data: { role: "MANAGER" } });
    });
    await test("deleted businesses never block; suspended ones block without a team link", async () => {
      await db.business.update({ where: { id: b1.id }, data: { status: "SUSPENDED" } });
      assert.equal((await soleOwnershipBlocks(solo.id))[0]?.teamHref, null);
      await db.business.update({ where: { id: b1.id }, data: { deletedAt: new Date() } });
      assert.deepEqual(await soleOwnershipBlocks(solo.id), []);
      await db.business.update({ where: { id: b1.id }, data: { deletedAt: null, status: "PUBLISHED" } });
    });
    await test("sole OWNER of an organization is blocked until a member is promoted to OWNER", async () => {
      const org = await db.organization.create({ data: { slug: `${P}org`, name: `${P}org`, kind: "NONPROFIT", status: "APPROVED", members: { create: [{ userId: u2.id, role: "OWNER" }, { userId: solo.id, role: "ADMIN" }] } } });
      const blocks = await soleOwnershipBlocks(u2.id);
      assert.deepEqual(blocks.map((b) => [b.kind, b.id, b.teamHref]), [["organization", org.id, `/organization/${org.id}/team/`]]);
      assert.equal((await soleOwnershipBlocks(solo.id)).filter((b) => b.kind === "organization").length, 0, "ADMIN member never blocks");
      await db.organizationMember.update({ where: { userId_organizationId: { userId: solo.id, organizationId: org.id } }, data: { role: "OWNER" } });
      assert.deepEqual(await soleOwnershipBlocks(u2.id), []);
    });
  } finally {
    await cleanup();
    await db.$disconnect();
  }
  console.log(results.join("\n"));
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Free-listing-first membership flow — library checks against the real database:
 *  - approval email: "Your free business listing is live" headline, View Your Listing first, optional membership line
 *    linking to THAT listing's Membership tab; no membership line for drafts or listings without a linked owner; escaping
 *  - upgrade eligibility: only OWNERs of PUBLISHED, non-deleted listings with an ACTIVE account
 *
 *   DATABASE_URL=… APP_URL=https://example.test npx tsx --conditions=react-server scripts/test-membership-flow.ts
 *
 * Creates only test-mf- records and removes them at the end.
 */
import assert from "node:assert/strict";

const P = "test-mf-";
const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).message.split("\n")[0]}`); }
}

async function main() {
  const { db } = await import("@/lib/db");
  const { buildApprovalEmail, APPROVAL_LIVE_HEADLINE } = await import("@/lib/approval-email");
  const { getUpgradeableListings, isListingUpgradeable } = await import("@/lib/membership-eligibility");
  const { absoluteUrl } = await import("@/lib/utils");

  const base = { kind: "new" as const, businessName: "Joe's Diner", businessId: "biz123", slug: "joes-diner", live: true, owner: true, invited: false };

  await test("live listing: headline, View Your Listing first, membership line → that listing's tab", () => {
    const m = buildApprovalEmail(base);
    assert.equal(m.subject, `${APPROVAL_LIVE_HEADLINE}: Joe's Diner`);
    assert.ok(m.text.startsWith(APPROVAL_LIVE_HEADLINE));
    const view = m.text.indexOf(`View Your Listing: ${absoluteUrl("/business/joes-diner/")}`);
    const mem = m.text.indexOf(`Want to add more photos, list your services, or post more events? View your membership options: ${absoluteUrl("/dashboard/biz123/membership/")}`);
    assert.ok(view > 0 && mem > view, "listing link before the optional membership line");
    assert.ok(m.html.indexOf(">View Your Listing</a>") < m.html.indexOf("View your membership options</a>"));
    assert.match(m.html, /<h1[^>]*>Your free business listing is live<\/h1>/);
    assert.equal(m.membershipUrl, absoluteUrl("/dashboard/biz123/membership/"));
    assert.ok(!/\$\d|\/mo|subscri|charge/i.test(m.text), "no prices or billing language");
  });
  await test("claim of a live listing uses the same live email", () => {
    const m = buildApprovalEmail({ ...base, kind: "claim" });
    assert.ok(m.subject.startsWith(APPROVAL_LIVE_HEADLINE));
    assert.match(m.text, /Your claim for Joe's Diner was approved/);
    assert.ok(m.membershipUrl);
  });
  await test("invited owner: password setup note, still links listing + membership tab", () => {
    const m = buildApprovalEmail({ ...base, invited: true });
    assert.match(m.text, /separate email with a link to set your password/);
    assert.ok(m.membershipUrl);
  });
  await test("draft (not live): no live headline, no membership line", () => {
    const m = buildApprovalEmail({ ...base, live: false });
    assert.ok(!m.text.includes(APPROVAL_LIVE_HEADLINE) && !m.html.includes(APPROVAL_LIVE_HEADLINE));
    assert.ok(!/membership/i.test(m.text) && !/membership/i.test(m.html));
    assert.equal(m.membershipUrl, null);
    assert.equal(m.subject, "Your listing for Joe's Diner was approved");
  });
  await test("no linked owner: View Your Listing, no membership line or dashboard link", () => {
    const m = buildApprovalEmail({ ...base, owner: false });
    assert.ok(m.text.includes("View Your Listing"));
    assert.ok(!/membership|dashboard/i.test(m.text));
  });
  await test("names and notes are escaped in HTML", () => {
    const m = buildApprovalEmail({ ...base, businessName: `<img src=x onerror=alert(1)> & Co`, note: `<b>hi</b>` });
    assert.ok(!m.html.includes("<img") && !m.html.includes("<b>hi"));
    assert.ok(m.html.includes("&lt;img") && m.html.includes("&amp; Co"));
  });

  await test("isListingUpgradeable: only published + not deleted", () => {
    assert.equal(isListingUpgradeable({ status: "PUBLISHED", deletedAt: null }), true);
    for (const status of ["DRAFT", "PENDING", "SUSPENDED", "ARCHIVED"]) assert.equal(isListingUpgradeable({ status }), false, status);
    assert.equal(isListingUpgradeable({ status: "PUBLISHED", deletedAt: new Date() }), false);
  });

  const cleanup = async () => {
    await db.business.deleteMany({ where: { slug: { startsWith: P } } });
    await db.user.deleteMany({ where: { email: { startsWith: P } } });
  };
  await cleanup();
  try {
    await test("getUpgradeableListings: owner of published only (not manager, draft, deleted, or blocked account)", async () => {
      const [owner, mgr, blocked] = await Promise.all(["owner", "mgr", "blocked"].map((k) => db.user.create({ data: { email: `${P}${k}@example.com`, status: k === "blocked" ? "SUSPENDED" : "ACTIVE" } })));
      const mk = (slug: string, status: "PUBLISHED" | "DRAFT", deletedAt: Date | null = null) => db.business.create({ data: { slug: `${P}${slug}`, name: `${P}${slug}`, status, deletedAt } });
      const [live, live2, draft, gone] = await Promise.all([mk("live", "PUBLISHED"), mk("live2", "PUBLISHED"), mk("draft", "DRAFT"), mk("gone", "PUBLISHED", new Date())]);
      await db.businessOwner.createMany({ data: [
        { userId: owner.id, businessId: live.id, role: "OWNER" }, { userId: owner.id, businessId: live2.id, role: "OWNER" },
        { userId: owner.id, businessId: draft.id, role: "OWNER" }, { userId: owner.id, businessId: gone.id, role: "OWNER" },
        { userId: mgr.id, businessId: live.id, role: "MANAGER" }, { userId: blocked.id, businessId: live.id, role: "OWNER" },
      ] });
      assert.deepEqual((await getUpgradeableListings(owner.id)).map((b) => b.id).sort(), [live.id, live2.id].sort());
      assert.deepEqual(await getUpgradeableListings(mgr.id), []);
      assert.deepEqual(await getUpgradeableListings(blocked.id), []);
    });
  } finally {
    await cleanup();
  }
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

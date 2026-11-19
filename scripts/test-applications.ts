/**
 * Business applications, claims and admin account removal — library-level checks against the real database:
 *  - application drafts (sign in to continue): allowlisted fields only (never passwords), expiry, single use
 *  - claimed-listing detection (≥1 OWNER; managers alone don't count)
 *  - My T County request list (pending / declined / managed)
 *  - password policy helper shared with /register/
 *  - admin soft delete: refuses while sole owner, removes access and personal data, closes pending
 *    applications, keeps the listing, subscriptions, payments, recommendations and events
 *  - self-service delete closes pending applications (shared anonymization)
 *
 *   DATABASE_URL=… npx tsx --conditions=react-server scripts/test-applications.ts
 *
 * Creates only test-app- records and removes them at the end. Server actions (sign-in resume, approval
 * locking, block/unblock, delete UI) are covered end-to-end by the Playwright run.
 */
import assert from "node:assert/strict";

const P = "test-app-";
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
  const flow = await import("@/lib/application-flow");
  const { newPasswordProblem, accountFieldsSchema } = await import("@/lib/account-fields");
  const del = await import("@/lib/account-deletion");
  const { applicationClaim } = await import("@/lib/applications");

  const plan = await db.membershipPlan.findFirst({ orderBy: { sortOrder: "asc" } });
  assert.ok(plan, "a seeded membership plan is required");

  const userIds: string[] = []; // soft-deleted test users no longer carry the test- email
  const cleanup = async () => {
    const bizIds = (await db.business.findMany({ where: { slug: { startsWith: P } }, select: { id: true } })).map((b) => b.id);
    await db.event.deleteMany({ where: { slug: { startsWith: P } } });
    await db.businessApplication.deleteMany({ where: { OR: [{ businessName: { startsWith: P } }, { email: { startsWith: P } }] } });
    await db.business.deleteMany({ where: { id: { in: bizIds } } }); // cascades owners, subscriptions, payments, recommendations
    await db.businessApplication.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { OR: [{ email: { startsWith: P } }, { id: { in: userIds } }] } });
    await db.setting.deleteMany({ where: { key: { startsWith: "lyb-draft:" }, value: { path: ["fields", "businessName"], string_starts_with: P } } });
  };
  await cleanup();

  try {
    // ───────── drafts ─────────
    await test("draft: keeps allowlisted fields, never passwords or unknown keys", async () => {
      const token = await flow.saveApplicationDraft({ businessName: `${P}Bakery`, phone: "330-555-0100", newsletter: "on", claimSlug: "some-slug", ...({ password: "secret123456", confirm: "secret123456", email: "x@example.com" } as object) });
      assert.ok(token.length >= 30);
      const d = await flow.loadApplicationDraft(token);
      assert.deepEqual(d, { businessName: `${P}Bakery`, phone: "330-555-0100", newsletter: "on", claimSlug: "some-slug" });
      const row = await db.setting.findMany({ where: { key: { startsWith: "lyb-draft:" } } });
      assert.ok(row.every((r) => !JSON.stringify(r.value).includes("secret123456")), "no password stored");
      assert.ok(row.every((r) => !r.key.includes(token)), "raw token never stored");
      await flow.deleteApplicationDraft(token);
      assert.equal(await flow.loadApplicationDraft(token), null);
    });
    await test("draft: expired, malformed or unknown tokens load nothing", async () => {
      const token = await flow.saveApplicationDraft({ businessName: `${P}Old` });
      const key = (await db.setting.findMany({ where: { key: { startsWith: "lyb-draft:" }, value: { path: ["fields", "businessName"], equals: `${P}Old` } } }))[0].key;
      await db.setting.update({ where: { key }, data: { value: { exp: Date.now() - 1000, fields: { businessName: `${P}Old` } } } });
      assert.equal(await flow.loadApplicationDraft(token), null);
      assert.equal(await flow.loadApplicationDraft("short"), null);
      assert.equal(await flow.loadApplicationDraft("x".repeat(40)), null);
      assert.equal(await flow.loadApplicationDraft("../../etc/passwd-aaaaaaaaaaaaaaaa"), null);
    });
    await test("applicationPath / sign-in href keep the claim and draft", async () => {
      assert.equal(flow.applicationPath({ claimSlug: "joes-diner" }), "/list-your-business/?claim=joes-diner");
      assert.equal(flow.signInToApplicationHref({ claimSlug: "joes-diner", draft: "abc" }), `/login/?next=${encodeURIComponent("/list-your-business/?claim=joes-diner&draft=abc")}`);
      assert.equal(flow.applicationPath({}), "/list-your-business/");
    });

    // ───────── password + names ─────────
    await test("shared password policy + confirmation", async () => {
      assert.ok(newPasswordProblem("short1", "short1"));
      assert.ok(newPasswordProblem("password123", "password123"), "common password refused");
      assert.equal(newPasswordProblem("Tuscan-hills-42", "Tuscan-hills-43")?.fieldErrors.confirm, "Passwords don't match.");
      assert.equal(newPasswordProblem("Tuscan-hills-42", "Tuscan-hills-42"), null);
      assert.equal(accountFieldsSchema.safeParse({ firstName: "<b>", lastName: "X", email: "a@b.co", password: "" }).success, false);
      assert.equal(accountFieldsSchema.safeParse({ firstName: "Ann", lastName: "Lee", email: " Ann@Example.COM ", password: "" }).data?.email, "ann@example.com");
    });

    // ───────── fixtures ─────────
    const owner = await db.user.create({ data: { email: `${P}owner@example.com`, role: "BUSINESS_OWNER", passwordHash: "x", firstName: "Olive" } });
    const manager = await db.user.create({ data: { email: `${P}manager@example.com`, role: "BUSINESS_OWNER", passwordHash: "x" } });
    const applicant = await db.user.create({ data: { email: `${P}applicant@example.com`, role: "MEMBER", passwordHash: "x", firstName: "Abe", lastName: "Doe", name: "Abe Doe", homeCommunity: "Dover", interestKeys: ["food"] } });
    userIds.push(owner.id, manager.id, applicant.id);
    const admin = await db.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } });
    assert.ok(admin);
    const biz = await db.business.create({ data: { slug: `${P}diner`, name: `${P}Diner`, status: "PUBLISHED", publishedAt: new Date() } });
    const other = await db.business.create({ data: { slug: `${P}shop`, name: `${P}Shop`, status: "PUBLISHED", publishedAt: new Date() } });

    await test("claimed = at least one OWNER; managers alone don't count", async () => {
      assert.equal(await flow.isBusinessClaimed(biz.id), false);
      await db.businessOwner.create({ data: { userId: manager.id, businessId: biz.id, role: "MANAGER" } });
      assert.equal(await flow.isBusinessClaimed(biz.id), false);
      assert.equal(await db.business.count({ where: { id: biz.id, ...flow.claimedBusinessWhere } }), 0);
      await db.businessOwner.create({ data: { userId: owner.id, businessId: biz.id, role: "OWNER" } });
      assert.equal(await flow.isBusinessClaimed(biz.id), true);
      assert.equal(await db.business.count({ where: { id: biz.id, ...flow.claimedBusinessWhere } }), 1);
      assert.match(flow.claimedListingMessage("help@example.com"), /already managed.*help@example\.com/);
    });

    await test("My T County request list: pending, declined and managed listings", async () => {
      await db.businessApplication.create({ data: { businessName: `${P}Pending Co`, email: applicant.email, userId: applicant.id } });
      await db.businessApplication.create({ data: { businessName: `${P}Declined Co`, email: applicant.email, userId: applicant.id, status: "REJECTED", reviewNote: "outside the county", reviewedAt: new Date() } });
      await db.businessOwner.create({ data: { userId: applicant.id, businessId: other.id, role: "MANAGER" } });
      const r = await flow.getBusinessRequests(applicant.id);
      assert.deepEqual(r.apps.map((a) => [a.businessName, a.status]).sort(), [[`${P}Declined Co`, "REJECTED"], [`${P}Pending Co`, "PENDING"]]);
      assert.deepEqual(r.managed.map((m) => m.business.id), [other.id]);
      assert.equal(applicationClaim({ data: { claim: null }, businessId: null, status: "PENDING" }), null);
    });

    // ───────── admin soft delete ─────────
    await test("delete summary flags sole ownership and pending applications", async () => {
      const s = await del.accountDeletionSummary(owner.id);
      assert.deepEqual(s.businesses.map((b) => [b.id, b.role, b.soleOwner]), [[biz.id, "OWNER", true]]);
      assert.equal(s.soleOwner.length, 1);
      const a = await del.accountDeletionSummary(applicant.id);
      assert.equal(a.pendingApplications.length, 1);
      assert.equal(a.soleOwner.length, 0, "a manager is never a sole owner");
    });
    await test("soft delete refuses while the account is a sole owner", async () => {
      await assert.rejects(del.softDeleteAccount(owner.id, admin.id), (e: unknown) => e instanceof del.SoleOwnerError);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).status, "ACTIVE");
      assert.equal(await db.businessOwner.count({ where: { userId: owner.id } }), 1);
    });
    await test("soft delete: access + personal data removed, listing/billing/content kept, applications closed", async () => {
      await db.subscription.create({ data: { businessId: other.id, planId: plan.id, source: "manual", status: "ACTIVE" } });
      await db.businessRecommendation.create({ data: { userId: applicant.id, businessId: other.id } });
      await db.savedItem.create({ data: { userId: applicant.id, type: "BUSINESS", targetId: other.id } });
      await db.session.create({ data: { id: `${P}sess`, userId: applicant.id, expiresAt: new Date(Date.now() + 86400_000) } });
      const ev = await db.event.create({ data: { slug: `${P}event`, title: `${P}event`, startAt: new Date(), submittedById: applicant.id, submitterEmail: applicant.email, status: "PUBLISHED" } });
      const r = await del.softDeleteAccount(applicant.id, admin.id);
      const u = await db.user.findUniqueOrThrow({ where: { id: applicant.id } });
      assert.equal(u.status, "DELETED");
      assert.equal(u.email, `deleted-${r.ref}@invalid`);
      assert.deepEqual([u.firstName, u.lastName, u.name, u.passwordHash, u.homeCommunity, u.notificationPrefs], [null, null, null, null, null, null]);
      assert.deepEqual(u.interestKeys, []);
      assert.equal(await db.businessOwner.count({ where: { userId: applicant.id } }), 0);
      assert.equal(await db.session.count({ where: { userId: applicant.id } }), 0);
      assert.equal(await db.savedItem.count({ where: { userId: applicant.id } }), 0);
      // kept
      assert.equal(await db.business.count({ where: { id: other.id, deletedAt: null } }), 1);
      assert.equal(await db.subscription.count({ where: { businessId: other.id } }), 1);
      assert.equal(await db.businessRecommendation.count({ where: { userId: applicant.id } }), 1);
      assert.equal((await db.event.findUniqueOrThrow({ where: { id: ev.id } })).submitterEmail, null);
      // applications
      const apps = await db.businessApplication.findMany({ where: { userId: applicant.id }, orderBy: { businessName: "asc" } });
      assert.ok(apps.every((a) => a.email === `deleted-${r.ref}@invalid` && a.contactName === null));
      const pending = apps.find((a) => a.businessName === `${P}Pending Co`)!;
      assert.equal(pending.status, "REJECTED");
      assert.equal(pending.reviewNote, del.ACCOUNT_DELETED_NOTE);
      assert.equal(apps.find((a) => a.businessName === `${P}Declined Co`)!.reviewNote, "outside the county", "already-reviewed applications keep their note");
    });
    await test("self-delete anonymization closes pending applications too", async () => {
      const u = await db.user.create({ data: { email: `${P}self@example.com`, role: "MEMBER" } });
      await db.businessApplication.create({ data: { businessName: `${P}Self Co`, email: u.email, userId: u.id } });
      const ref = del.deletedRef(u.id);
      await db.$transaction(async (tx) => {
        await del.anonymizeUserRecords(tx, u.id, { ref });
        await tx.user.delete({ where: { id: u.id } });
      });
      const app = await db.businessApplication.findFirstOrThrow({ where: { businessName: `${P}Self Co` } });
      assert.deepEqual([app.status, app.reviewNote, app.userId, app.email], ["REJECTED", "account deleted", null, `deleted-${ref}@invalid`]);
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

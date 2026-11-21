/**
 * "Recommend a Business" (business leads) + the /memberships/ → /add-your-business/ menu migration — library checks
 * against the real database.
 *
 *   DATABASE_URL=… npx tsx --conditions=react-server scripts/test-business-leads.ts
 *
 * Covers: name / town / website normalization; grouping (name variants, same website or Facebook page, different
 * towns stay separate); every submission kept; same person within 24 h not double counted; HTML stripped; nothing
 * ever creates a Business; status rules (Added needs a link; contacted/added timestamps); link / unlink; listing
 * created from a recommendation (draft → Reviewing, published → Added); merge keeps submissions; stats; directory
 * match; menu + redirect migration (runs once, footer link added once).
 * Creates only lbtest records and removes them at the end.
 */
import assert from "node:assert/strict";

process.env.APP_URL ||= "https://tcountyconnect.com";
const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); }
}

async function main() {
  const { db } = await import("@/lib/db");
  const shared = await import("@/lib/business-leads-shared");
  const leads = await import("@/lib/business-leads");
  const { runAddYourBusinessMenuMigration } = await import("@/lib/menu-migrations");

  const cleanup = async () => {
    await db.businessLead.deleteMany({ where: { OR: [{ name: { contains: "Lbtest", mode: "insensitive" } }, { matchKey: { contains: "lbtest" } }] } });
    await db.business.deleteMany({ where: { slug: { startsWith: "lbtest-" } } });
  };
  await cleanup();
  const bizBefore = await db.business.count();
  const submit = (o: Partial<import("@/lib/business-leads").LeadInput> & { businessName: string }, ip = "203.0.113.1") =>
    leads.submitBusinessLead(leads.cleanLeadInput({ city: "Dover", ...o }), { ip });

  try {
    await test("normalization: names, towns, websites", () => {
      assert.equal(shared.normalizeBusinessName("Joe's Diner, LLC"), shared.normalizeBusinessName("joes diner"));
      assert.equal(shared.normalizeBusinessName("Smith & Sons Co."), shared.normalizeBusinessName("The Smith and Sons"));
      assert.notEqual(shared.leadMatchKey("Joe's Diner", "Dover"), shared.leadMatchKey("Joe's Diner", "Sugarcreek"));
      assert.equal(shared.normalizeWebsite("facebook.com/JoesDiner"), "https://facebook.com/JoesDiner");
      assert.equal(shared.normalizeWebsite("javascript:alert(1)"), null);
      assert.equal(shared.normalizeWebsite("not a url"), null);
      assert.equal(shared.websiteKey("https://www.facebook.com/JoesDiner/"), "facebook.com/joesdiner");
      assert.equal(shared.websiteKey("https://m.facebook.com/joesdiner?ref=x"), "facebook.com/joesdiner");
      assert.equal(shared.websiteKey("https://www.joesdiner.com/menu"), "joesdiner.com");
      assert.equal(shared.websiteKey("https://maps.google.com/x"), null);
      assert.match(shared.smsHref("Hi there"), /^sms:\?&body=Hi%20there$/);
      assert.equal(shared.facebookShareHref(shared.ADD_YOUR_BUSINESS_URL), "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Ftcountyconnect.com%2Fadd-your-business%2F");
      assert.ok(shared.INVITATION_MESSAGE.endsWith("https://tcountyconnect.com/add-your-business/"));
    });

    let leadId = "";
    await test("first submission creates one lead (NEW) and no business; HTML stripped; town canonicalized", async () => {
      const r = await submit({ businessName: "Lbtest Joe's Diner <b>LLC</b>", city: "dover", reason: "<script>x</script>Best pie", firstName: "Ann", email: "ANN@Example.com", category: "Food & Dining" });
      leadId = r.leadId;
      assert.equal(r.duplicate, false); assert.equal(r.grouped, false);
      const l = await db.businessLead.findUniqueOrThrow({ where: { id: leadId }, include: { submissions: true } });
      assert.equal(l.status, "NEW"); assert.equal(l.submissionCount, 1); assert.equal(l.city, "Dover");
      assert.ok(!l.name.includes("<") && !l.submissions[0].reason!.includes("<script>"));
      assert.equal(l.submissions[0].submitterEmail, "ann@example.com");
      assert.equal(l.submissions[0].ipHash?.length, 64, "only a one-way IP code is stored");
      assert.equal(await db.business.count(), bizBefore, "no listing created");
    });
    await test("same person again within 24 h: accepted, not counted twice", async () => {
      const r = await submit({ businessName: "Lbtest Joe's Diner" });
      assert.equal(r.duplicate, true); assert.equal(r.leadId, leadId);
      assert.equal((await db.businessLead.findUniqueOrThrow({ where: { id: leadId } })).submissionCount, 1);
    });
    await test("other residents with name variants are grouped; each submission kept", async () => {
      const a = await submit({ businessName: "lbtest joes diner", city: "Dover" }, "203.0.113.2");
      const b = await submit({ businessName: "The LBTEST Joe’s Diner, Inc.", city: "DOVER", website: "facebook.com/LbtestJoesDiner" }, "203.0.113.3");
      assert.equal(a.leadId, leadId); assert.equal(b.leadId, leadId); assert.ok(a.grouped && b.grouped);
      const l = await db.businessLead.findUniqueOrThrow({ where: { id: leadId }, include: { submissions: true } });
      assert.equal(l.submissionCount, 3); assert.equal(l.submissions.length, 3);
      assert.equal(l.websiteKey, "facebook.com/lbtestjoesdiner", "website filled in from a later submission");
    });
    await test("same Facebook page under a different name groups too; a different town stays separate", async () => {
      const c = await submit({ businessName: "Lbtest Joe Diner & Grill", website: "https://www.facebook.com/lbtestjoesdiner/" }, "203.0.113.4");
      assert.equal(c.leadId, leadId);
      const d = await submit({ businessName: "Lbtest Joe's Diner", city: "Sugarcreek" }, "203.0.113.5");
      assert.notEqual(d.leadId, leadId);
    });
    await test("stats count submissions, unique businesses and new ones", async () => {
      const s = await leads.leadStats();
      const mine = await db.businessLead.count({ where: { name: { contains: "Lbtest", mode: "insensitive" } } });
      assert.ok(s.total >= 5 && s.unique >= mine && s.awaiting >= 2);
    });
    await test("status rules: Added needs a linked listing; contacted time recorded once", async () => {
      await assert.rejects(leads.updateLead(leadId, { status: "ADDED", adminNotes: null }, null), /Link this recommendation/);
      await leads.updateLead(leadId, { status: "CONTACTED", adminNotes: "Called the owner" }, null);
      const l = await db.businessLead.findUniqueOrThrow({ where: { id: leadId } });
      assert.ok(l.contactedAt); assert.equal(l.adminNotes, "Called the owner");
    });
    await test("directory check finds an existing listing; link → Added counts; unlink reverts", async () => {
      const biz = await db.business.create({ data: { slug: "lbtest-joes-diner", name: "Lbtest Joe's Diner", city: "Dover", status: "PUBLISHED" } });
      const m = await leads.directoryMatches({ name: "Lbtest Joes Diner", city: "Dover", website: null });
      assert.ok(m.some((x) => x.id === biz.id && x.exact));
      const hits = await leads.exactDirectoryHits([{ id: leadId, name: "lbtest joe's diner llc", city: "Dover" }]);
      assert.equal(hits.get(leadId)?.id, biz.id);
      const before = (await leads.leadStats()).added;
      await leads.linkLead(leadId, biz.id, null);
      await leads.updateLead(leadId, { status: "ADDED", adminNotes: null }, null);
      assert.equal((await leads.leadStats()).added, before + 1);
      await leads.unlinkLead(leadId, null);
      const l = await db.businessLead.findUniqueOrThrow({ where: { id: leadId } });
      assert.equal(l.businessId, null); assert.equal(l.status, "REVIEWING"); assert.equal(l.addedAt, null);
    });
    await test("listing created from a recommendation: draft → Reviewing (not Added); published → Added", async () => {
      const x = await submit({ businessName: "Lbtest Corner Bakery" }, "203.0.113.6");
      const draft = await db.business.create({ data: { slug: "lbtest-corner-bakery", name: "Lbtest Corner Bakery", status: "DRAFT" } });
      await leads.attachNewBusinessToLead(x.leadId, draft, null);
      let l = await db.businessLead.findUniqueOrThrow({ where: { id: x.leadId } });
      assert.equal(l.status, "REVIEWING"); assert.equal(l.businessId, draft.id); assert.ok(l.createdFromLead); assert.equal(l.addedAt, null);
      const y = await submit({ businessName: "Lbtest Hardware" }, "203.0.113.7");
      const pub = await db.business.create({ data: { slug: "lbtest-hardware", name: "Lbtest Hardware", status: "PUBLISHED" } });
      await leads.attachNewBusinessToLead(y.leadId, pub, null);
      l = await db.businessLead.findUniqueOrThrow({ where: { id: y.leadId } });
      assert.equal(l.status, "ADDED"); assert.ok(l.addedAt);
      assert.equal(await db.businessOwner.count({ where: { businessId: { in: [draft.id, pub.id] } } }), 0, "no owner account linked");
    });
    await test("merge moves every submission and removes the empty duplicate", async () => {
      const p = await submit({ businessName: "Lbtest Smith Plumbing", city: "Dover" }, "203.0.113.8");
      const q = await submit({ businessName: "Lbtest Smiths Plumbing and Heating", city: "Dover" }, "203.0.113.9");
      assert.notEqual(p.leadId, q.leadId);
      const sim = await leads.similarLeads({ id: q.leadId, name: "Lbtest Smiths Plumbing and Heating", city: "Dover" });
      assert.ok(sim.some((s) => s.id === p.leadId));
      await leads.mergeLeads(q.leadId, p.leadId, null);
      const l = await db.businessLead.findUniqueOrThrow({ where: { id: p.leadId }, include: { submissions: true } });
      assert.equal(l.submissionCount, 2); assert.equal(l.submissions.length, 2);
      assert.equal(await db.businessLead.count({ where: { id: q.leadId } }), 0);
    });
    await test("no recommendation ever created a listing by itself", async () => {
      assert.equal(await db.business.count({ where: { slug: { startsWith: "lbtest-" } } }), 3, "only the 3 created by the test itself");
    });

    await test("menu migration: /memberships/ links → /add-your-business/, redirects re-pointed, footer link added once", async () => {
      const marker = await db.setting.findUnique({ where: { key: "menuAddYourBusiness" } });
      const footerRec = await db.menuItem.findMany({ where: { location: "FOOTER", href: { in: ["/recommend-a-business/", "/recommend-a-business"] } } });
      const tmp = await Promise.all([
        db.menuItem.create({ data: { location: "FOOTER", label: "lbtest Get Listed", href: "/memberships/", sortOrder: 990 } }),
        db.menuItem.create({ data: { location: "MOBILE", label: "lbtest Plans", href: "/memberships", sortOrder: 990 } }),
      ]);
      const red = await db.redirect.create({ data: { fromPath: "/lbtest-old-plans/", toPath: "/memberships/" } });
      try {
        await db.setting.deleteMany({ where: { key: "menuAddYourBusiness" } });
        await db.menuItem.deleteMany({ where: { id: { in: footerRec.map((f) => f.id) } } });
        await runAddYourBusinessMenuMigration(db as never, () => {});
        const [a, b] = await Promise.all(tmp.map((t) => db.menuItem.findUniqueOrThrow({ where: { id: t.id } })));
        assert.equal(a.href, "/add-your-business/"); assert.equal(a.label, "lbtest Get Listed", "labels unchanged");
        assert.equal(b.href, "/add-your-business/");
        assert.equal((await db.redirect.findUniqueOrThrow({ where: { id: red.id } })).toPath, "/add-your-business/");
        assert.equal(await db.menuItem.count({ where: { location: "FOOTER", href: "/recommend-a-business/" } }), 1);
        assert.equal((await runAddYourBusinessMenuMigration(db as never, () => {})).skipped, true);
        assert.equal(await db.menuItem.count({ where: { location: "FOOTER", href: "/recommend-a-business/" } }), 1, "not added twice");
      } finally {
        await db.menuItem.deleteMany({ where: { id: { in: tmp.map((t) => t.id) } } });
        await db.redirect.deleteMany({ where: { id: red.id } });
        await db.menuItem.deleteMany({ where: { location: "FOOTER", href: "/recommend-a-business/" } });
        for (const f of footerRec) await db.menuItem.create({ data: { location: f.location, label: f.label, href: f.href, sortOrder: f.sortOrder } });
        await db.setting.deleteMany({ where: { key: "menuAddYourBusiness" } });
        if (marker) await db.setting.create({ data: { key: marker.key, value: marker.value as never } });
      }
    });
  } finally {
    await cleanup();
  }
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

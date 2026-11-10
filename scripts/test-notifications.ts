/**
 * Member email updates + personalized newsletter block tests (no network:
 * Resend is mocked via global fetch).
 *
 *   npx tsx --conditions=react-server scripts/test-notifications.ts
 *
 * Uses the real database (DATABASE_URL) with an injected clock, and removes
 * everything it creates (users, listings, subscribers, NotificationDelivery rows).
 */
import assert from "node:assert/strict";

process.env.RESEND_API_KEY = "re_test_mock";
process.env.APP_URL ||= "http://localhost:3000";
process.env.CRON_SECRET = "ntest-cron-secret";
delete process.env.SMTP_HOST;

const P = "ntest-";
const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
}

type Sent = { url: string; body: { to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> } | { to: string[]; subject: string; html: string; text: string }[] };
const calls: Sent[] = [];
let mode: "ok" | "500" = "ok";
let seq = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://api.resend.com/")) throw new Error(`unexpected fetch ${url}`);
  const body = JSON.parse(String(init?.body ?? "null"));
  calls.push({ url, body });
  if (mode === "500") return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
  if (url.endsWith("/emails/batch")) return Response.json({ data: (body as unknown[]).map(() => ({ id: `m-${++seq}` })) });
  return Response.json({ id: `m-${++seq}` });
}) as typeof fetch;

const single = () => calls.filter((c) => c.url.endsWith("/emails")).map((c) => c.body as { to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> });
const to = (email: string) => single().filter((m) => m.to[0] === email);

/** New York wall clock → instant (EST in mid-November: UTC-5). */
const ny = (s: string) => new Date(`${s}:00-05:00`);

async function main() {
  const { db } = await import("@/lib/db");
  const run = await import("@/lib/notifications/run");
  const tokens = await import("@/lib/notifications/tokens");
  const prefsLib = await import("@/lib/notifications/preferences");
  const block = await import("@/lib/newsletter/community-block");
  const send = await import("@/lib/newsletter/send");
  const { emptyContent } = await import("@/lib/newsletter/content");
  const { getNewsletterSettings, saveNewsletterSettings } = await import("@/lib/newsletter/settings");
  const { randomToken } = await import("@/lib/newsletter/tokens");
  const { readNotificationPrefs } = await import("@/lib/notification-categories");
  const oneClick = await import("@/app/api/notifications/unsubscribe/route");
  const cron = await import("@/app/api/cron/route");

  const origSettings = await getNewsletterSettings();
  const origLastRun = await db.setting.findUnique({ where: { key: "notifications.lastRun" } });
  const created = { nl: [] as string[] };
  const cleanup = async () => {
    const users = await db.user.findMany({ where: { email: { startsWith: P } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.notificationDelivery.deleteMany({ where: { recipient: { in: ids } } });
    await db.newsletter.deleteMany({ where: { id: { in: created.nl } } });
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: P } } });
    await db.emailSuppression.deleteMany({ where: { email: { startsWith: P } } });
    await db.savedItem.deleteMany({ where: { userId: { in: ids } } });
    await db.event.deleteMany({ where: { slug: { startsWith: P } } });
    await db.foodTruckStop.deleteMany({ where: { business: { slug: { startsWith: P } } } });
    await db.garageSale.deleteMany({ where: { slug: { startsWith: P } } });
    await db.business.deleteMany({ where: { slug: { startsWith: P } } });
    await db.auditLog.deleteMany({ where: { OR: [{ userId: { in: ids } }, { entityId: { in: [...ids, ...created.nl] } }] } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await saveNewsletterSettings(origSettings);
    if (origLastRun) await db.setting.update({ where: { key: origLastRun.key }, data: { value: origLastRun.value as object } });
    else await db.setting.deleteMany({ where: { key: "notifications.lastRun" } });
  };
  await cleanup();

  // Only this test's opted-in members/subscribers may be active during engine tests.
  const othersActive = await db.newsletterSubscriber.findMany({ where: { status: "ACTIVE", NOT: { email: { startsWith: P } } }, select: { id: true } });
  await db.newsletterSubscriber.updateMany({ where: { id: { in: othersActive.map((o) => o.id) } }, data: { status: "PENDING" } });

  try {
    await saveNewsletterSettings({ fromAddress: "weekly@example.com", postalAddress: "123 Test St, Dover, OH 44622" });
    const allOn = { categories: {}, planned: { weekend_summary: true, saved_event_reminders: true, new_in_my_communities: true } };
    const mkUser = (tag: string, data: Record<string, unknown> = {}) => db.user.create({
      data: { email: `${P}${tag}@example.com`, name: `Test ${tag}`, emailVerifiedAt: new Date(), notificationPrefs: allOn, ...data },
    });
    const dover = await mkUser("dover", { homeCommunity: "Dover", extraCommunities: ["Sugarcreek"] });
    const nocomm = await mkUser("nocomm");
    const supp = await mkUser("supp", { homeCommunity: "Dover" });
    await db.emailSuppression.create({ data: { email: `${P}supp@example.com`, reason: "complained" } });
    const unverified = await mkUser("unverified", { homeCommunity: "Dover", emailVerifiedAt: null });
    const suspended = await mkUser("suspended", { homeCommunity: "Dover", status: "SUSPENDED" });
    const optedOut = await mkUser("optedout", { homeCommunity: "Dover", notificationPrefs: { planned: {} } });
    const strasburg = await mkUser("strasburg", { homeCommunity: "Strasburg" });

    // ── Listings (titles carry the prefix so assertions can find them) ──
    const ev = (slug: string, title: string, city: string, start: string, extra: Record<string, unknown> = {}) => db.event.create({
      data: { slug: `${P}${slug}`, title: `${P}${title}`, city, startAt: ny(start), endAt: new Date(ny(start).getTime() + 2 * 3600_000), status: "PUBLISHED", ...extra },
    });
    const eDover = await ev("dover-sat", "Dover Saturday Fair", "Dover", "2026-11-14T10:00");
    const eDover2 = await ev("dover-sat-pm", "Dover Saturday Concert", "Dover", "2026-11-14T14:00");
    const eSugar = await ev("sugar-sun", "Sugarcreek Sunday Market", "Sugarcreek", "2026-11-15T11:00");
    const eNP = await ev("np-sat", "New Phila Countywide Show", "New Philadelphia", "2026-11-14T18:00");
    const ePending = await ev("dover-pending", "Dover Pending Event", "Dover", "2026-11-14T12:00", { status: "PENDING" });
    await ev("dover-sponsored", "Dover Sponsored Event", "Dover", "2026-11-14T13:00", { isSponsored: true });
    const truck = await db.business.create({ data: { slug: `${P}truck`, name: `${P}Taco Truck`, isFoodTruck: true, status: "PUBLISHED", city: "Dover" } });
    await db.foodTruckStop.create({ data: { businessId: truck.id, locationName: "Dover Square", city: "Dover", startAt: ny("2026-11-14T11:00"), endAt: ny("2026-11-14T14:00") } });
    await db.garageSale.create({
      data: {
        slug: `${P}sale`, title: `${P}Dover Moving Sale`, city: "Dover", address: "999 Secret Ln", addressVisibility: "GENERAL", generalLocation: "Near Dover High",
        startDate: ny("2026-11-14T00:00"), endDate: ny("2026-11-14T00:00"), dailyStart: "08:00", dailyEnd: "14:00", submitterEmail: `${P}seller@example.com`, status: "PUBLISHED", publishedAt: new Date(),
      } as never,
    });
    // Listed this week, happening after Monday the 16th (for "new in my communities").
    await ev("dover-next", "Dover Next Week Event", "Dover", "2026-11-19T18:00");
    await db.foodTruckStop.create({ data: { businessId: truck.id, locationName: "Dover Library", city: "Dover", startAt: ny("2026-11-18T11:00"), endAt: ny("2026-11-18T14:00") } });
    await db.garageSale.create({
      data: {
        slug: `${P}sale2`, title: `${P}Dover Big Sale`, city: "Dover", address: "1 Hidden Rd", addressVisibility: "GENERAL", generalLocation: "East Dover",
        startDate: ny("2026-11-20T00:00"), endDate: ny("2026-11-21T00:00"), dailyStart: "08:00", dailyEnd: "14:00", submitterEmail: `${P}seller@example.com`, status: "PUBLISHED", publishedAt: new Date(),
      } as never,
    });
    // Saved: two events tomorrow (relative to Fri 13th) + one unpublished.
    await db.savedItem.createMany({ data: [eDover, eDover2, ePending].map((e) => ({ userId: dover.id, type: "EVENT" as const, targetId: e.id })) });
    await db.savedItem.create({ data: { userId: nocomm.id, type: "EVENT", targetId: eSugar.id } });

    // ── Windows ──
    await test("weekend summary window: Thu 3pm – Fri 11am NY only", async () => {
      assert.equal(run.weekendSummaryDue(ny("2026-11-12T14:59")), null);
      assert.equal(run.weekendSummaryDue(ny("2026-11-12T15:00")), "2026-11-14");
      assert.equal(run.weekendSummaryDue(ny("2026-11-13T10:59")), "2026-11-14");
      assert.equal(run.weekendSummaryDue(ny("2026-11-13T11:00")), null);
      assert.equal(run.weekendSummaryDue(ny("2026-11-10T16:00")), null);
    });
    await test("reminder window: 8am – 8pm NY, for tomorrow", async () => {
      assert.equal(run.reminderDue(ny("2026-11-13T07:59")), null);
      assert.equal(run.reminderDue(ny("2026-11-13T08:00")), "2026-11-14");
      assert.equal(run.reminderDue(ny("2026-11-13T19:59")), "2026-11-14");
      assert.equal(run.reminderDue(ny("2026-11-13T20:00")), null);
    });
    await test("new-in-communities window: Monday 7am – noon NY", async () => {
      assert.equal(run.newInCommunitiesDue(ny("2026-11-16T06:59")), null);
      assert.equal(run.newInCommunitiesDue(ny("2026-11-16T07:00")), "2026-11-16");
      assert.equal(run.newInCommunitiesDue(ny("2026-11-16T12:00")), null);
      assert.equal(run.newInCommunitiesDue(ny("2026-11-17T08:00")), null);
    });

    // ── Weekend summary ──
    const thu = ny("2026-11-12T16:00");
    await test("outside the window nothing is sent", async () => {
      calls.length = 0;
      const r = await run.processEmailUpdates({ now: ny("2026-11-12T12:00"), kinds: ["weekend_summary"] });
      assert.equal(r.weekend_summary?.due, false);
      assert.equal(single().length, 0);
    });
    await test("weekend summary: community first, countywide highlights, no sponsored/pending, eligible members only", async () => {
      calls.length = 0;
      const r = await run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"] });
      assert.equal(r.weekend_summary?.refKey, "2026-11-14");
      const m = to(dover.email);
      assert.equal(m.length, 1, "one email to the Dover member");
      const html = m[0].html;
      assert.ok(html.indexOf("This weekend in Dover and Sugarcreek") > -1 && html.indexOf("This weekend in Dover and Sugarcreek") < html.indexOf("Around T County"), "community group before countywide");
      for (const t of ["Dover Saturday Fair", "Sugarcreek Sunday Market", "Taco Truck at Dover Square", "Dover Moving Sale"]) assert.ok(html.includes(t), `includes ${t}`);
      assert.ok(html.includes("New Phila Countywide Show"), "countywide highlight");
      assert.ok(!html.includes("Sponsored Event") && !html.includes("Pending Event"), "no sponsored / unpublished");
      assert.ok(!html.includes("999 Secret Ln"), "garage sale private address never shown");
      assert.ok(html.includes("Why you’re getting this"));
      assert.match(m[0].headers?.["List-Unsubscribe"] ?? "", /^<http:\/\/localhost:3000\/api\/notifications\/unsubscribe\/\?t=/);
      assert.ok(html.includes("/account/notifications/unsubscribe/?t=") && html.includes("/account/notifications/"));
      assert.equal(to(nocomm.email).length, 1, "member without communities gets countywide summary");
      assert.ok(to(nocomm.email)[0].html.includes("This weekend around T County"));
      for (const u of [supp, unverified, suspended, optedOut]) assert.equal(to(u.email).length, 0, `${u.email} not emailed`);
    });
    await test("weekend summary is sent once even when cron runs twice (and concurrently)", async () => {
      calls.length = 0;
      const [a, b] = await Promise.all([run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"] }), run.processEmailUpdates({ now: ny("2026-11-13T09:00"), kinds: ["weekend_summary"] })]);
      assert.equal((a.weekend_summary?.sent ?? 0) + (b.weekend_summary?.sent ?? 0), 0);
      assert.equal(to(dover.email).length, 0);
      assert.equal(await db.notificationDelivery.count({ where: { recipient: dover.id, kind: "weekend_summary", refKey: "2026-11-14" } }), 1);
    });
    await test("suppressed address never emailed and no delivery row", async () => {
      assert.equal(await db.notificationDelivery.count({ where: { recipient: supp.id } }), 0);
    });

    // ── Saved event reminders ──
    const fri = ny("2026-11-13T10:00");
    await test("saved reminders: two events combined in one email, unpublished skipped", async () => {
      calls.length = 0;
      const r = await run.processEmailUpdates({ now: fri, kinds: ["saved_event_reminders"] });
      assert.equal(r.saved_event_reminders?.sent, 1);
      const m = to(dover.email);
      assert.equal(m.length, 1);
      assert.equal(m[0].subject, "Tomorrow: 2 events you saved");
      assert.ok(m[0].html.includes("Dover Saturday Fair") && m[0].html.includes("Dover Saturday Concert"));
      assert.ok(!m[0].html.includes("Pending Event"));
      assert.equal(to(nocomm.email).length, 0, "Sunday event isn't tomorrow");
      const rows = await db.notificationDelivery.findMany({ where: { recipient: dover.id, kind: "saved_event_reminders" }, select: { refKey: true } });
      assert.deepEqual(rows.map((x) => x.refKey).sort(), ["DAY:2026-11-14", `EVENT:${eDover.id}:2026-11-14`, `EVENT:${eDover2.id}:2026-11-14`].sort());
      calls.length = 0;
      await run.processEmailUpdates({ now: ny("2026-11-13T15:00"), kinds: ["saved_event_reminders"] });
      assert.equal(to(dover.email).length, 0, "no second reminder that day");
    });
    await test("reminder skipped once the event is unpublished", async () => {
      calls.length = 0;
      await db.event.update({ where: { id: eSugar.id }, data: { status: "PENDING" } });
      const r = await run.processEmailUpdates({ now: ny("2026-11-14T09:00"), kinds: ["saved_event_reminders"] });
      assert.equal(to(nocomm.email).length, 0);
      assert.equal(r.saved_event_reminders?.candidates, 0);
      await db.event.update({ where: { id: eSugar.id }, data: { status: "PUBLISHED" } });
    });

    // ── New in my communities ──
    const mon = ny("2026-11-16T08:00");
    await test("new in my communities: only members with communities, items from their communities", async () => {
      calls.length = 0;
      const r = await run.processEmailUpdates({ now: mon, kinds: ["new_in_my_communities"] });
      assert.ok((r.new_in_my_communities?.noCommunities ?? 0) >= 1, "member without communities skipped");
      assert.equal(to(nocomm.email).length, 0);
      const m = to(dover.email);
      assert.equal(m.length, 1);
      assert.equal(m[0].subject, "New in Dover and Sugarcreek this week");
      for (const t of ["Dover Next Week Event", "Taco Truck at Dover Library", "Dover Big Sale"]) assert.ok(m[0].html.includes(t), `includes ${t}`);
      assert.ok(!m[0].html.includes("Dover Saturday Fair"), "past items excluded");
      assert.ok(!m[0].html.includes("New Phila Countywide Show"), "other communities excluded");
      assert.equal(to(strasburg.email).length, 0, "nothing new in Strasburg → skipped");
      assert.equal(r.new_in_my_communities?.empty, 1);
    });

    // ── Provider failure + throttle ──
    await test("provider error marks the row failed and never re-sends", async () => {
      await db.notificationDelivery.deleteMany({ where: { recipient: dover.id, kind: "weekend_summary" } });
      mode = "500";
      const r = await run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"] });
      mode = "ok";
      assert.ok((r.weekend_summary?.failed ?? 0) >= 1);
      const row = await db.notificationDelivery.findFirst({ where: { recipient: dover.id, kind: "weekend_summary" } });
      assert.equal(row?.status, "failed");
      calls.length = 0;
      await run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"] });
      assert.equal(to(dover.email).length, 0);
    });
    await test("per-run cap defers the rest to the next run", async () => {
      await db.notificationDelivery.deleteMany({ where: { recipient: { in: [dover.id, nocomm.id] }, kind: "weekend_summary" } });
      calls.length = 0;
      const r1 = await run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"], maxPerRun: 1 });
      assert.equal(r1.weekend_summary?.sent, 1);
      assert.ok((r1.weekend_summary?.deferred ?? 0) >= 1);
      const r2 = await run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"], maxPerRun: 1 });
      assert.equal(r2.weekend_summary?.sent, 1);
      assert.equal(single().length, 2);
    });

    // ── Unsubscribe tokens ──
    await test("one-click unsubscribe turns off only that update; invalid tokens rejected", async () => {
      const t = tokens.unsubscribeToken(dover.id, "weekend_summary");
      assert.deepEqual(tokens.verifyUnsubscribeToken(t), { userId: dover.id, kind: "weekend_summary" });
      assert.equal(tokens.verifyUnsubscribeToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")), null);
      assert.equal(tokens.verifyUnsubscribeToken(`${nocomm.id}.ws.${t.split(".")[2]}`), null, "signature bound to the member");
      assert.equal(tokens.verifyUnsubscribeToken(`${dover.id}.sr.${t.split(".")[2]}`), null, "signature bound to the kind");
      const bad = await oneClick.POST(new Request(`http://localhost:3000/api/notifications/unsubscribe/?t=garbage`, { method: "POST", body: "List-Unsubscribe=One-Click" }));
      assert.equal(bad.status, 404);
      const ok = await oneClick.POST(new Request(`http://localhost:3000/api/notifications/unsubscribe/?t=${encodeURIComponent(t)}`, { method: "POST", body: "List-Unsubscribe=One-Click" }));
      assert.equal(ok.status, 200);
      const u = await db.user.findUnique({ where: { id: dover.id } });
      const p = readNotificationPrefs(u?.notificationPrefs);
      assert.deepEqual(p.planned, { weekend_summary: false, saved_event_reminders: true, new_in_my_communities: true });
      const target = await prefsLib.findUnsubscribeTarget(t);
      assert.equal(target?.enabled, false);
      // Opted-out member is no longer a candidate.
      await db.notificationDelivery.deleteMany({ where: { recipient: dover.id, kind: "weekend_summary" } });
      calls.length = 0;
      await run.processEmailUpdates({ now: thu, kinds: ["weekend_summary"] });
      assert.equal(to(dover.email).length, 0);
      await db.user.update({ where: { id: dover.id }, data: { notificationPrefs: allOn } });
    });

    // ── Admin test send + status ──
    await test("admin test send ignores windows, refKey test:<ts>, excluded from stats", async () => {
      calls.length = 0;
      const r = await run.sendTestUpdate("new_in_my_communities", { ...dover }, ny("2026-11-10T15:00"));
      assert.equal(r.outcome, "sent");
      assert.ok(to(dover.email)[0].subject.startsWith("[TEST] "));
      const row = await db.notificationDelivery.findFirst({ where: { recipient: dover.id, refKey: { startsWith: "test:" } } });
      assert.ok(row);
      const st = await run.emailUpdateStatus(7);
      assert.equal(st.kinds.length, 3);
      assert.ok(st.lastRunAt);
    });

    // ── Cron route ──
    await test("cron route requires CRON_SECRET and returns emailUpdates counts", async () => {
      const denied = await cron.GET(new Request("http://localhost:3000/api/cron/"));
      assert.equal(denied.status, 401);
      const res = await cron.POST(new Request("http://localhost:3000/api/cron/", { method: "POST", headers: { authorization: "Bearer ntest-cron-secret" } }));
      assert.equal(res.status, 200);
      const j = (await res.json()) as { emailUpdates: { ok: boolean; maxPerRun: number }; newsletters: unknown };
      assert.equal(j.emailUpdates.ok, true);
      assert.equal(j.emailUpdates.maxPerRun, 200);
      assert.ok(j.newsletters);
    });

    // ── Newsletter "Around your community" block ──
    await test("community block: per community set, omitted when empty, countywide unchanged, batched", async () => {
      const mkSub = (tag: string, data: Record<string, unknown>) => db.newsletterSubscriber.create({
        data: { email: `${P}${tag}@example.com`, status: "ACTIVE", source: "homepage", consentAt: new Date(), confirmedAt: new Date(), unsubscribeToken: randomToken(32), ...data },
      });
      const sDover = await mkSub("s-dover", { communities: ["Dover"] });
      const sDover2 = await mkSub("s-dover2", { communities: ["Dover"] });
      const sMember = await mkSub("s-member", { userId: dover.id }); // empty → member's Dover + Sugarcreek
      const sCounty = await mkSub("s-county", {});
      const sStras = await mkSub("s-stras", { communities: ["Strasburg"] });
      const sNoEvents = await mkSub("s-noevents", { communities: ["Dover"], preferences: { events: false, stories: true, spotlights: true, specials: true, gives: true } });
      // The send happens "now" (real clock): give Dover something this week.
      const soon = new Date(Date.now() + 2 * 86400_000);
      const eSoon = await db.event.create({ data: { slug: `${P}dover-soon`, title: `${P}Dover This Week`, city: "Dover", startAt: soon, status: "PUBLISHED" } });
      await db.event.create({ data: { slug: `${P}dover-soon-sp`, title: `${P}Dover Paid Placement`, city: "Dover", startAt: soon, status: "PUBLISHED", isSponsored: true } });

      const content = emptyContent();
      content.intro = "<p>Hello T County!</p>";
      const nl = await db.newsletter.create({ data: { subject: "ntest campaign", content, status: "APPROVED", approvedAt: new Date() } });
      created.nl.push(nl.id);
      const st = await send.startCampaign(nl.id);
      assert.ok(st.ok, !st.ok ? st.error : "");
      calls.length = 0;
      const r = await send.processCampaign(nl.id, { delayMs: 0 });
      assert.equal(r.sent, 6);
      const msgs = calls.filter((c) => c.url.endsWith("/emails/batch")).flatMap((c) => c.body as { to: string[]; html: string; text: string }[]);
      const byTo = (s: { email: string }) => msgs.find((m) => m.to[0] === s.email)!;
      const d = byTo(sDover);
      assert.ok(d.html.includes("Around Dover this week") && d.html.includes("Dover This Week"));
      assert.ok(!d.html.includes("Dover Paid Placement"), "no sponsored items in the block");
      assert.ok(d.text.includes("AROUND DOVER THIS WEEK"));
      assert.ok(!d.html.includes("%%COMMUNITY_BLOCK%%") && !d.html.includes("%%PREFERENCES_URL%%"));
      assert.ok(byTo(sMember).html.includes("Around Dover &amp; Sugarcreek this week"), "member fallback communities");
      // Countywide subscriber: identical to the campaign rendering without a block.
      const { html, text } = await send.renderCampaign(nl);
      const { personalize, recipientLinks } = await import("@/lib/newsletter/render");
      const links = recipientLinks(sCounty.unsubscribeToken);
      assert.equal(byTo(sCounty).html, personalize(html, links));
      assert.equal(byTo(sCounty).text, personalize(text, links));
      assert.ok(!byTo(sCounty).html.includes("Around "));
      assert.ok(!byTo(sStras).html.includes("Around Strasburg"), "empty block omitted");
      assert.ok(!byTo(sNoEvents).html.includes("Dover This Week"), "topic preferences respected");
      assert.ok(byTo(sDover2).html.includes("Dover This Week"));
      // Batching: one query per distinct community set.
      const render = block.createCommunityBlockRenderer();
      await Promise.all([render(["Dover"], null), render(["Dover"], null), render(["Dover"], { events: false, stories: true, spotlights: true, specials: true, gives: true }), render(["Strasburg"], null), render([], null)]);
      assert.equal(render.distinctSets(), 2);
      // Turning the block off: everyone gets the countywide email.
      const off = emptyContent();
      off.communityBlock = false;
      const nl2 = await db.newsletter.create({ data: { subject: "ntest campaign 2", content: off, status: "APPROVED", approvedAt: new Date() } });
      created.nl.push(nl2.id);
      await send.startCampaign(nl2.id);
      calls.length = 0;
      await send.processCampaign(nl2.id, { delayMs: 0 });
      const msgs2 = calls.filter((c) => c.url.endsWith("/emails/batch")).flatMap((c) => c.body as { to: string[]; html: string }[]);
      assert.ok(!msgs2.find((m) => m.to[0] === sDover.email)!.html.includes("Around Dover"));
      void eSoon;
    });
    void eNP;
  } finally {
    await db.newsletterSubscriber.updateMany({ where: { id: { in: othersActive.map((o) => o.id) } }, data: { status: "ACTIVE" } });
    await cleanup();
    const left = await db.notificationDelivery.count({ where: { recipient: { startsWith: "" }, OR: [{ refKey: { startsWith: "test:" } }] } });
    results.push(`(cleanup) remaining test: delivery rows overall = ${left}`);
  }
  console.log(results.join("\n"));
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

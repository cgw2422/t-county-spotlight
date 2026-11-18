/**
 * Native newsletter signup → beehiiv API (no network: local mock via BEEHIIV_API_BASE).
 *
 *   DATABASE_URL=postgresql://tcs:tcs@localhost:5432/tcs npx tsx --conditions=react-server scripts/test-beehiiv-signup.ts
 *
 * Covers: request shape (method, path, auth, body), status → message mapping,
 * 429/5xx/timeout/network → retry, 401/404 → retry + admin "Connection problem",
 * validation (bad/too long emails, honeypot), per-IP and per-email rate limits,
 * no NewsletterSubscriber rows, API key never in results or logs, connection
 * check (publication name), test signup verified via by_email, readiness.
 * Restores the "beehiiv.connection" setting and deletes what it creates.
 */
import assert from "node:assert/strict";
import { startBeehiivMock } from "./beehiiv-mock";

process.env.APP_URL = "https://tcountyconnect.com";
const API_KEY = "bh_test_SECRET_signup_key_never_leak_456";
const PUB = "pub_00000000-signup-test-0000-000000000000";

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

// Capture everything the code logs, to prove the key never appears.
const logged: string[] = [];
for (const k of ["log", "info", "warn", "error"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); if (k !== "warn" && k !== "error") orig(...a); };
}

async function main() {
  const mock = await startBeehiivMock({ apiKey: API_KEY, publicationId: PUB, publicationName: "T County Connect" });
  process.env.BEEHIIV_API_BASE = mock.base;
  process.env.BEEHIIV_API_KEY = API_KEY;
  process.env.BEEHIIV_PUBLICATION_ID = PUB;

  const { db } = await import("@/lib/db");
  const signup = await import("@/lib/beehiiv/signup");
  const { BEEHIIV_SIGNUP_MESSAGES: MSG } = await import("@/lib/newsletter/copy");
  const { subscriptionBody } = await import("@/lib/beehiiv/client");

  const started = new Date();
  const originalConn = await db.setting.findUnique({ where: { key: "beehiiv.connection" } });
  const subsBefore = await db.newsletterSubscriber.count();
  let ipN = 0;
  const ip = () => `10.77.0.${++ipN}`;
  const D = "example.com";
  const go = (email: string, extra: Partial<Parameters<typeof signup.handlePublicSignup>[0]> = {}) =>
    signup.handlePublicSignup({ email, honeypot: "", placement: "homepage_hero", page: "/", ip: ip(), ...extra });
  const allOutput: unknown[] = [];
  const cleanup = async () => {
    await db.engagementEvent.deleteMany({ where: { type: "newsletter_signup", createdAt: { gte: started } } });
    if (originalConn) await db.setting.update({ where: { key: "beehiiv.connection" }, data: { value: originalConn.value as never } });
    else await db.setting.deleteMany({ where: { key: "beehiiv.connection" } });
  };
  await db.setting.deleteMany({ where: { key: "beehiiv.connection" } });

  try {
    await test("request shape: POST /v2/publications/{id}/subscriptions, Bearer key, JSON body fields", async () => {
      mock.requests.length = 0;
      const r = await go(`Shape.Test+bh-x@${D.toUpperCase()}`, { placement: "newsletter_page", page: "/newsletter/" });
      allOutput.push(r);
      assert.equal(mock.requests.length, 1);
      const q = mock.requests[0];
      assert.equal(q.method, "POST");
      assert.equal(q.path, `/v2/publications/${PUB}/subscriptions`);
      assert.equal(q.auth, `Bearer ${API_KEY}`);
      assert.match(String(q.contentType), /^application\/json/);
      assert.deepEqual(q.body, {
        email: "shape.test+bh-x@example.com", reactivate_existing: false, double_opt_override: "not_set",
        utm_source: "tcountyconnect.com", utm_medium: "website", utm_campaign: "newsletter_page", referring_site: "https://tcountyconnect.com/newsletter/",
      });
      assert.equal("send_welcome_email" in (q.body as object), false, "send_welcome_email omitted (beehiiv default)");
      assert.deepEqual(Object.keys(subscriptionBody({ email: "a@b.co", utmCampaign: "x", referringSite: "y" })).sort(), ["double_opt_override", "email", "reactivate_existing", "referring_site", "utm_campaign", "utm_medium", "utm_source"]);
    });

    await test("placement and page are validated (unknown placement → newsletter_page; odd page → placement page)", async () => {
      mock.requests.length = 0;
      await go(`place1@${D}`, { placement: "evil<script>", page: "https://evil.example/x" });
      await go(`place2@${D}`, { placement: "event", page: "//evil.example/" });
      await go(`place3@${D}`, { placement: "article", page: "/articles/some-story/" });
      const b = mock.requests.map((r) => r.body as Record<string, string>);
      assert.equal(b[0].utm_campaign, "newsletter_page");
      assert.equal(b[0].referring_site, "https://tcountyconnect.com/newsletter/");
      assert.equal(b[1].utm_campaign, "event");
      assert.equal(b[1].referring_site, "https://tcountyconnect.com/events/");
      assert.equal(b[2].referring_site, "https://tcountyconnect.com/articles/some-story/");
    });

    await test("status mapping: active / pending / validating / inactive / invalid / needs_attention / unknown", async () => {
      const cases: [string, string, string][] = [
        ["bh-active", "subscribed", MSG.subscribed], ["plain", "pending", MSG.pending], ["bh-validating", "pending", MSG.pending],
        ["bh-inactive", "neutral", MSG.neutral], ["bh-invalid", "neutral", MSG.neutral], ["bh-needs", "neutral", MSG.neutral], ["bh-weird", "pending", MSG.pending],
      ];
      for (const [kw, outcome, message] of cases) {
        const r = await go(`map-${kw}@${D}`);
        allOutput.push(r);
        assert.equal(r?.ok, true, kw);
        assert.equal(r?.outcome, outcome, kw);
        assert.equal(r?.message, message, kw);
        if (outcome !== "subscribed") assert.doesNotMatch(String(r?.message), /subscribed\./i, `${kw}: never says subscribed`);
      }
      assert.equal(MSG.subscribed, "You're subscribed. Watch your inbox for the next issue.");
      assert.equal(MSG.pending, "Almost done — check your inbox to confirm your subscription.");
    });

    await test("429 / 500 / 503 / timeout / network error → retry message, typed email kept", async () => {
      for (const kw of ["bh-429", "bh-500", "bh-503", "bh-drop"]) {
        const r = await go(`Retry-${kw}@${D}`);
        allOutput.push(r);
        assert.equal(r?.error, MSG.retry, kw);
        assert.equal(r?.email, `Retry-${kw}@${D}`, `${kw}: email kept as typed`);
        assert.equal(r?.ok, undefined);
      }
      const t0 = Date.now();
      const slow = await go(`retry-bh-slow@${D}`);
      assert.equal(slow?.error, MSG.retry);
      assert.ok(Date.now() - t0 < 8_900 && Date.now() - t0 >= 7_500, `timed out at ~8s (${Date.now() - t0}ms)`);
      process.env.BEEHIIV_API_BASE = "http://127.0.0.1:1/v2"; // nothing listens there
      const net = await go(`retry-net@${D}`);
      process.env.BEEHIIV_API_BASE = mock.base;
      assert.equal(net?.error, MSG.retry);
    });

    await test("connection check returns the publication name; readiness needs check + verified test signup", async () => {
      await db.setting.deleteMany({ where: { key: "beehiiv.connection" } });
      let r = await signup.beehiivReadiness();
      assert.equal(r.envOk, true);
      assert.equal(r.ready, false);
      mock.requests.length = 0;
      const c = await signup.checkBeehiivConnection();
      allOutput.push(c);
      assert.equal(c.ok, true);
      assert.equal(c.publicationName, "T County Connect");
      assert.equal(mock.requests[0].method, "GET");
      assert.equal(mock.requests[0].path, `/v2/publications/${PUB}`);
      assert.equal(mock.requests[0].auth, `Bearer ${API_KEY}`);
      r = await signup.beehiivReadiness();
      assert.equal(r.checkOk, true);
      assert.equal(r.verifiedOk, false);
      assert.equal(r.ready, false, "not ready before a verified test signup");
    });

    await test("401 / 404 → retry message + logged config error + admin 'Connection problem'", async () => {
      const before = logged.length;
      for (const kw of ["bh-401", "bh-404"]) {
        const r = await go(`cfg-${kw}@${D}`);
        allOutput.push(r);
        assert.equal(r?.error, MSG.retry, kw);
      }
      const lines = logged.slice(before).join("\n");
      assert.match(lines, /connection problem: beehiiv API returned HTTP 401/);
      assert.match(lines, /HTTP 404/);
      assert.match(lines, /BEEHIIV_API_KEY/);
      assert.doesNotMatch(lines, /cfg-bh-40\d@/, "address not logged");
      const r = await signup.beehiivReadiness();
      assert.equal(r.connectionProblem, true);
      assert.equal(r.ready, false);
      // A wrong key on the connection check itself
      process.env.BEEHIIV_API_KEY = "wrong";
      const c = await signup.checkBeehiivConnection();
      process.env.BEEHIIV_API_KEY = API_KEY;
      assert.equal(c.ok, false);
      assert.match(String(c.error), /HTTP 401/);
      assert.doesNotMatch(JSON.stringify(c), /wrong/);
      assert.equal((await signup.beehiivReadiness()).connectionProblem, true);
      assert.equal((await signup.checkBeehiivConnection()).ok, true);
      assert.equal((await signup.beehiivReadiness()).connectionProblem, false, "a good check clears it");
    });

    await test("test signup: same code path, verified via GET by_email (URL-encoded), masked address stored", async () => {
      mock.requests.length = 0;
      const email = `owner+bh-x test@${D}`.replace(" ", "");
      const v = await signup.sendTestSignup(`  ${email.toUpperCase()} `);
      allOutput.push(v);
      assert.equal(v.ok, true, v.message);
      assert.equal(v.status, "pending");
      assert.equal(v.publicationName, "T County Connect");
      assert.equal(v.maskedEmail, "o***@example.com");
      assert.match(v.message, /“T County Connect”.*pending — confirmation email sent/);
      const [post, lookup] = mock.requests;
      assert.equal(post.method, "POST");
      assert.equal((post.body as Record<string, string>).utm_campaign, "admin_test");
      assert.equal((post.body as Record<string, boolean>).reactivate_existing, false);
      assert.equal(lookup.method, "GET");
      assert.equal(lookup.path, `/v2/publications/${PUB}/subscriptions/by_email/${encodeURIComponent(email)}`);
      assert.match(lookup.path, /owner%2Bbh-xtest%40example\.com$/);
      const raw = JSON.stringify((await db.setting.findUniqueOrThrow({ where: { key: "beehiiv.connection" } })).value);
      assert.doesNotMatch(raw, /owner\+/, "plain address never stored");
      assert.match(raw, /o\*\*\*@example\.com/);
      const r = await signup.beehiivReadiness();
      assert.equal(r.verifiedOk, true);
      assert.equal(r.ready, true);
      // Different publication id → earlier check/verification no longer count
      process.env.BEEHIIV_PUBLICATION_ID = "pub_other";
      assert.equal((await signup.beehiivReadiness()).ready, false);
      process.env.BEEHIIV_PUBLICATION_ID = PUB;
      assert.equal((await signup.beehiivReadiness()).ready, true);
    });

    await test("test signup failure is recorded as not verified", async () => {
      const v = await signup.sendTestSignup(`fail-bh-503@${D}`);
      assert.equal(v.ok, false);
      assert.match(v.message, /HTTP 503/);
      assert.equal((await signup.beehiivReadiness()).verifiedOk, false);
      assert.equal((await signup.sendTestSignup("not-an-email")).ok, false);
      assert.equal((await signup.sendTestSignup(`again-bh-active@${D}`)).status, "active");
      assert.equal((await signup.beehiivReadiness()).ready, true);
    });

    await test("validation: bad emails, too long, honeypot (no beehiiv call)", async () => {
      mock.requests.length = 0;
      const bad = ["", "   ", "plainaddress", "a@b", "a@b.c", "a@localhost", "x@foo.invalid", "x@foo.test", ".a@example.com", "a.@example.com", "a..b@example.com", "a@-ex.com", "a@ex-.com",
        "a b@example.com", "<script>@example.com", `${"a".repeat(65)}@example.com`, `${"a".repeat(60)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`];
      for (const e of bad) {
        const r = await go(e);
        assert.equal(r?.error, MSG.invalidEmail, `rejects ${JSON.stringify(e)}`);
        assert.equal(r?.fieldErrors?.email, "Enter a valid email address");
      }
      assert.equal(signup.normalizeSignupEmail("  Jane.Doe@Example.COM "), "jane.doe@example.com");
      assert.equal(signup.normalizeSignupEmail("j@xn--bcher-kva.de"), "j@xn--bcher-kva.de");
      const hp = await go(`honeypot@${D}`, { honeypot: "http://spam.example" });
      assert.equal(hp?.ok, true);
      assert.equal(hp?.message, MSG.neutral);
      assert.equal(mock.requests.length, 0, "nothing sent to beehiiv");
    });

    await test("rate limit per IP: 5 per 10 minutes", async () => {
      const addr = "10.88.0.1";
      for (let i = 0; i < 5; i++) assert.equal((await go(`ipl${i}@${D}`, { ip: addr }))?.ok, true, `attempt ${i + 1}`);
      const r = await go(`ipl6@${D}`, { ip: addr });
      assert.equal(r?.error, MSG.tooMany);
      assert.equal(r?.email, `ipl6@${D}`);
      assert.equal((await go(`ipl7@${D}`))?.ok, true, "other IPs unaffected");
    });

    await test("rate limit per email: 3 per hour, answered neutrally (no beehiiv call)", async () => {
      for (let i = 0; i < 3; i++) assert.equal((await go(`Same.Person+bh-active@${D}`))?.outcome, "subscribed");
      mock.requests.length = 0;
      const r = await go(`same.person+bh-active@${D}`);
      assert.equal(r?.ok, true);
      assert.equal(r?.outcome, "neutral");
      assert.equal(r?.message, MSG.neutral);
      assert.equal(mock.requests.length, 0);
    });

    await test("missing env → retry message, logged, nothing sent", async () => {
      delete process.env.BEEHIIV_API_KEY;
      mock.requests.length = 0;
      const r = await go(`noenv@${D}`);
      process.env.BEEHIIV_API_KEY = API_KEY;
      assert.equal(r?.error, MSG.retry);
      assert.equal(mock.requests.length, 0);
    });

    await test("aggregate analytics only: newsletter_signup events by placement, no email", async () => {
      const rows = await db.engagementEvent.findMany({ where: { type: "newsletter_signup", createdAt: { gte: started } } });
      assert.ok(rows.length >= 10, `${rows.length} events`);
      for (const e of rows) {
        assert.equal(e.targetType, "NEWSLETTER");
        assert.ok(e.targetId && !e.targetId.includes("@"));
        assert.equal(e.visitorHash, null);
      }
      assert.ok(!rows.some((e) => e.targetId === "admin_test"), "admin tests not counted");
    });

    await test("no NewsletterSubscriber rows created; no emails from our side", async () => {
      assert.equal(await db.newsletterSubscriber.count(), subsBefore);
      assert.equal(await db.newsletterSubscriber.count({ where: { email: { endsWith: `@${D}` }, createdAt: { gte: started } } }), 0);
    });

    await test("API key never appears in results, stored state or logs", async () => {
      const state = JSON.stringify((await db.setting.findUnique({ where: { key: "beehiiv.connection" } }))?.value ?? {});
      for (const [what, text] of [["results", JSON.stringify(allOutput)], ["state", state], ["logs", logged.join("\n")]] as const) {
        assert.ok(!text.includes(API_KEY), `key in ${what}`);
        assert.ok(!text.includes("SECRET_signup"), `key fragment in ${what}`);
        assert.ok(!text.includes(PUB), `publication id in ${what}`);
      }
    });
  } finally {
    await cleanup();
    await mock.close();
    await db.$disconnect();
  }
  process.stdout.write(results.join("\n") + "\n");
  process.stdout.write((failed ? `${failed} FAILED of ${results.length}` : `All ${results.length} beehiiv signup tests passed`) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  process.stderr.write(String((e as Error).stack) + "\n");
  process.exit(1);
});

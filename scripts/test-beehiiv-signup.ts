/**
 * Native newsletter signup → beehiiv API (no network: local mock via BEEHIIV_API_BASE).
 *
 *   DATABASE_URL=postgresql://tcs:tcs@localhost:5432/tcs npx tsx --conditions=react-server scripts/test-beehiiv-signup.ts
 *
 * Covers: lookup-first (GET by_email, then POST only for new addresses), request shape (method, path,
 * auth, body incl. send_welcome_email + double_opt_override "off"), already-active → no POST,
 * validating re-check, double submit → one POST, registration opt-in outcomes, status → message mapping,
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
    const posts = () => mock.requests.filter((r) => r.method === "POST");
    const lookups = () => mock.requests.filter((r) => r.method === "GET" && r.path.includes("/by_email/"));

    await test("request shape: GET by_email first, then POST /v2/publications/{id}/subscriptions, Bearer key, JSON body fields", async () => {
      mock.requests.length = 0;
      const r = await go(`Shape.Test+bh-x@${D.toUpperCase()}`, { placement: "newsletter_page", page: "/newsletter/" });
      allOutput.push(r);
      assert.equal(mock.requests.length, 2);
      const [look, q] = mock.requests;
      assert.equal(look.method, "GET");
      assert.equal(look.path, `/v2/publications/${PUB}/subscriptions/by_email/${encodeURIComponent("shape.test+bh-x@example.com")}`);
      assert.equal(look.auth, `Bearer ${API_KEY}`);
      assert.equal(q.method, "POST");
      assert.equal(q.path, `/v2/publications/${PUB}/subscriptions`);
      assert.equal(q.auth, `Bearer ${API_KEY}`);
      assert.match(String(q.contentType), /^application\/json/);
      assert.deepEqual(q.body, {
        email: "shape.test+bh-x@example.com", reactivate_existing: false, send_welcome_email: true, double_opt_override: "off",
        utm_source: "tcountyconnect.com", utm_medium: "website", utm_campaign: "newsletter_page", referring_site: "https://tcountyconnect.com/newsletter/",
      });
      assert.equal(r?.outcome, "subscribed");
      assert.equal(r?.message, "You're subscribed! Look for a welcome email from T County Connect.");
      assert.deepEqual(Object.keys(subscriptionBody({ email: "a@b.co", utmCampaign: "x", referringSite: "y" })).sort(), ["double_opt_override", "email", "reactivate_existing", "referring_site", "send_welcome_email", "utm_campaign", "utm_medium", "utm_source"]);
    });

    await test("subscribe page placement → utm_campaign subscribe_page, referring_site /subscribe/", async () => {
      mock.requests.length = 0;
      const r = await go(`subpage@${D}`, { placement: "subscribe_page", page: "/subscribe/" });
      assert.equal(r?.outcome, "subscribed");
      const b = posts()[0].body as Record<string, unknown>;
      assert.equal(b.utm_campaign, "subscribe_page");
      assert.equal(b.referring_site, "https://tcountyconnect.com/subscribe/");
      assert.equal(b.send_welcome_email, true);
      assert.equal(b.double_opt_override, "off");
    });

    await test("placement and page are validated (unknown placement → newsletter_page; odd page → placement page)", async () => {
      mock.requests.length = 0;
      await go(`place1@${D}`, { placement: "evil<script>", page: "https://evil.example/x" });
      await go(`place2@${D}`, { placement: "event", page: "//evil.example/" });
      await go(`place3@${D}`, { placement: "article", page: "/articles/some-story/" });
      const b = posts().map((r) => r.body as Record<string, string>);
      assert.equal(b.length, 3);
      assert.equal(b[0].utm_campaign, "newsletter_page");
      assert.equal(b[0].referring_site, "https://tcountyconnect.com/newsletter/");
      assert.equal(b[1].utm_campaign, "event");
      assert.equal(b[1].referring_site, "https://tcountyconnect.com/events/");
      assert.equal(b[2].referring_site, "https://tcountyconnect.com/articles/some-story/");
    });

    await test("already active (by_email) → no POST, no welcome email, 'already subscribed' message", async () => {
      mock.requests.length = 0;
      const r = await go(`reader+bh-already@${D}`);
      allOutput.push(r);
      assert.equal(r?.ok, true);
      assert.equal(r?.outcome, "already");
      assert.equal(r?.message, "You're already subscribed. Look for the next issue from T County Connect.");
      assert.equal(posts().length, 0, "no POST");
      assert.equal(lookups().length, 1);
      // A new address subscribed once, then submitted again → the second time is "already", still one POST in total.
      mock.requests.length = 0;
      assert.equal((await go(`twice@${D}`))?.outcome, "subscribed");
      assert.equal((await go(`twice@${D}`))?.outcome, "already");
      assert.equal(posts().length, 1, "exactly one POST for a new address");
    });

    await test("existing inactive / unsubscribed (by_email) → neutral, never reactivated (no POST)", async () => {
      mock.requests.length = 0;
      const r = await go(`left+bh-gone@${D}`);
      assert.equal(r?.ok, true);
      assert.equal(r?.outcome, "neutral");
      assert.equal(r?.message, MSG.neutral);
      assert.equal(posts().length, 0);
      for (const st of ["invalid", "needs_attention"]) {
        mock.subs.set(`seed-${st}@${D}`, st);
        assert.equal((await go(`seed-${st}@${D}`))?.outcome, "neutral", st);
      }
      mock.subs.set(`seed-pending@${D}`, "pending");
      assert.equal((await go(`seed-pending@${D}`))?.outcome, "pending");
      assert.equal(posts().length, 0, "existing addresses are never POSTed");
    });

    await test("lookup failure (503) → retry message, no POST", async () => {
      mock.requests.length = 0;
      const r = await go(`x+bh-lookup503@${D}`);
      assert.equal(r?.error, MSG.retry);
      assert.equal(posts().length, 0);
    });

    await test("validating → one re-check after ~1.5 s: active → subscribed, else 'finishing' (never claims subscribed)", async () => {
      mock.requests.length = 0;
      let t0 = Date.now();
      const ok = await go(`v1+bh-validok@${D}`);
      assert.ok(Date.now() - t0 >= 1_400, "waited before re-checking");
      assert.equal(ok?.outcome, "subscribed");
      assert.equal(ok?.message, MSG.subscribed);
      assert.equal(posts().length, 1);
      assert.equal(lookups().length, 2, "lookup + one re-check");
      mock.requests.length = 0;
      t0 = Date.now();
      const still = await go(`v2+bh-validating@${D}`);
      assert.ok(Date.now() - t0 < 4_000);
      assert.equal(still?.outcome, "finishing");
      assert.equal(still?.message, "Thanks — we're finishing your signup. Look for a welcome email from T County Connect shortly.");
      assert.doesNotMatch(String(still?.message), /subscribed/i);
      assert.equal(posts().length, 1);
      assert.equal(lookups().length, 2);
    });

    await test("double submit: two parallel submits for the same address → one POST, both answered", async () => {
      mock.requests.length = 0;
      const [a, b] = await Promise.all([go(`dbl+bh-delay@${D}`), go(`DBL+bh-delay@${D}`)]);
      assert.equal(posts().length, 1, "one POST → one welcome email");
      assert.equal(lookups().length, 1);
      assert.equal(a?.outcome, "subscribed");
      assert.equal(b?.outcome, "subscribed");
      const c = await go(`dbl+bh-delay@${D}`);
      assert.equal(c?.outcome, "already");
      assert.equal(posts().length, 1);
    });

    await test("status mapping of a new subscription: active / pending / validating / inactive / invalid / needs_attention / unknown", async () => {
      const cases: [string, string, string][] = [
        ["bh-active", "subscribed", MSG.subscribed], ["plain", "subscribed", MSG.subscribed], ["bh-pending", "pending", MSG.pending],
        ["bh-inactive", "neutral", MSG.neutral], ["bh-invalid", "neutral", MSG.neutral], ["bh-needs", "neutral", MSG.neutral], ["bh-weird", "pending", MSG.pending],
      ];
      for (const [kw, outcome, message] of cases) {
        const r = await go(`map-${kw}@${D}`);
        allOutput.push(r);
        assert.equal(r?.ok, true, kw);
        assert.equal(r?.outcome, outcome, kw);
        assert.equal(r?.message, message, kw);
        if (outcome !== "subscribed") assert.doesNotMatch(String(r?.message), /subscribed!/i, `${kw}: never says subscribed`);
      }
      assert.equal(MSG.subscribed, "You're subscribed! Look for a welcome email from T County Connect.");
      assert.equal(MSG.pending, "Almost done — check your inbox to confirm your subscription.");
      assert.equal(MSG.retry, "We couldn't sign you up just now. Please try again in a minute.");
    });

    await test("registration opt-in: same flow (utm_campaign register), returns the outcome; failures → 'failed'", async () => {
      mock.requests.length = 0;
      assert.equal(await signup.subscribeAfterRegistration(`newmember@${D}`, ip()), "subscribed");
      assert.equal(posts().length, 1);
      const b = posts()[0].body as Record<string, unknown>;
      assert.equal(b.utm_campaign, "register");
      assert.equal(b.send_welcome_email, true);
      assert.equal(b.double_opt_override, "off");
      assert.equal(b.referring_site, "https://tcountyconnect.com/register/");
      assert.equal(await signup.subscribeAfterRegistration(`newmember@${D}`, ip()), "already");
      assert.equal(posts().length, 1, "no second POST");
      assert.equal(await signup.subscribeAfterRegistration(`m+bh-503@${D}`, ip()), "failed");
      assert.equal(await signup.subscribeAfterRegistration(`m+bh-lookup503@${D}`, ip()), "failed");
      assert.equal(await signup.subscribeAfterRegistration(`not-an-email`, ip()), "failed");
    });

    await test("welcome-screen newsletter token: signed for one member, short-lived, unforgeable", async () => {
      const flash = await import("@/lib/newsletter/register-flash");
      const t = flash.registerNewsletterToken("user_abc123", "subscribed");
      assert.equal(flash.verifyRegisterNewsletterToken(t, "user_abc123"), "subscribed");
      assert.equal(flash.verifyRegisterNewsletterToken(t, "user_other"), null, "other member");
      assert.equal(flash.verifyRegisterNewsletterToken(t.replace(/^subscribed/, "failed"), "user_abc123"), null, "result swapped");
      assert.equal(flash.verifyRegisterNewsletterToken("subscribed", "user_abc123"), null);
      assert.equal(flash.verifyRegisterNewsletterToken("1", "user_abc123"), null);
      assert.equal(flash.verifyRegisterNewsletterToken(`subscribed.${Math.floor(Date.now() / 1000) + 3600}.${"A".repeat(32)}`, "user_abc123"), null, "made-up signature");
      const old = flash.registerNewsletterToken("user_abc123", "subscribed", Date.now() - 2 * 3600_000);
      assert.equal(flash.verifyRegisterNewsletterToken(old, "user_abc123"), null, "expired");
      assert.equal(flash.registerNewsletterNote("subscribed").text, "You're subscribed to the T County Connect newsletter. Look for a welcome email.");
      assert.equal(flash.registerNewsletterNote("failed").retry, true);
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
      assert.ok(Date.now() - t0 < 9_500 && Date.now() - t0 >= 7_500, `timed out at ~8s (${Date.now() - t0}ms)`);
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

    await test("test signup: same code path (lookup → POST), verified via GET by_email (URL-encoded), masked address stored", async () => {
      mock.requests.length = 0;
      const email = `owner+bh-x test@${D}`.replace(" ", "");
      const v = await signup.sendTestSignup(`  ${email.toUpperCase()} `);
      allOutput.push(v);
      assert.equal(v.ok, true, v.message);
      assert.equal(v.status, "active");
      assert.equal(v.created, true);
      assert.equal(v.publicationName, "T County Connect");
      assert.equal(v.maskedEmail, "o***@example.com");
      assert.match(v.message, /“T County Connect”.*active — subscribed \(new subscriber — welcome email requested\)/);
      const [first, post, lookup] = mock.requests;
      assert.equal(first.method, "GET");
      assert.equal(post.method, "POST");
      assert.equal((post.body as Record<string, string>).utm_campaign, "admin_test");
      assert.equal((post.body as Record<string, boolean>).reactivate_existing, false);
      assert.equal((post.body as Record<string, boolean>).send_welcome_email, true);
      assert.equal((post.body as Record<string, string>).double_opt_override, "off");
      assert.equal(lookup.method, "GET");
      assert.equal(lookup.path, `/v2/publications/${PUB}/subscriptions/by_email/${encodeURIComponent(email)}`);
      assert.match(lookup.path, /owner%2Bbh-xtest%40example\.com$/);
      const raw = JSON.stringify((await db.setting.findUniqueOrThrow({ where: { key: "beehiiv.connection" } })).value);
      assert.doesNotMatch(raw, /owner\+/, "plain address never stored");
      assert.match(raw, /o\*\*\*@example\.com/);
      // Same address again → already active, no POST, no welcome email.
      mock.requests.length = 0;
      const again = await signup.sendTestSignup(email);
      assert.equal(again.ok, true);
      assert.equal(again.created, false);
      assert.match(again.message, /already active — no welcome email sent/);
      assert.equal(posts().length, 0);
      assert.equal(signup.testSignupKind(true, "active"), "new subscriber — welcome email requested");
      assert.equal(signup.testSignupKind(false, "active"), "already active — no welcome email sent");
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
      for (let i = 0; i < 3; i++) assert.equal((await go(`Same.Person+bh-active@${D}`))?.outcome, i === 0 ? "subscribed" : "already");
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

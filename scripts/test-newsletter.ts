/**
 * Newsletter engine tests (no network: Resend is mocked via global fetch).
 *
 *   npx tsx --conditions=react-server scripts/test-newsletter.ts
 *
 * Uses the real database (DATABASE_URL) and removes everything it creates.
 * Covers: batching (≤100/request), double-start + duplicate-send prevention,
 * suppression skipping, resumable runs, retryable provider errors, Svix webhook
 * signatures (valid/invalid/stale), webhook idempotency, RFC 8058 one-click
 * unsubscribe, double opt-in + resubscribe, and refusal without a provider.
 */
import crypto from "node:crypto";
import assert from "node:assert/strict";

process.env.RESEND_API_KEY = "re_test_mock";
process.env.APP_URL ||= "http://localhost:3000";
delete process.env.SMTP_HOST;

const PREFIX = "nltest-unit-";
const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${(e as Error).message}`);
  }
}

// ── fetch mock (Resend) ──
type Call = { url: string; headers: Record<string, string>; body: unknown };
const calls: Call[] = [];
let mode: "ok" | "429" = "ok";
let idSeq = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.startsWith("https://api.resend.com/")) throw new Error(`unexpected fetch ${url}`);
  const body = JSON.parse(String(init?.body ?? "null"));
  calls.push({ url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)), body });
  if (mode === "429") return new Response(JSON.stringify({ message: "Too many requests" }), { status: 429 });
  if (url.endsWith("/emails/batch")) return Response.json({ data: (body as unknown[]).map(() => ({ id: `mock-${++idSeq}` })) });
  return Response.json({ id: `mock-${++idSeq}` });
}) as typeof fetch;

async function main() {
  const { db } = await import("@/lib/db");
  const { getNewsletterSettings, saveNewsletterSettings } = await import("@/lib/newsletter/settings");
  const send = await import("@/lib/newsletter/send");
  const subs = await import("@/lib/newsletter/subscribers");
  const webhook = await import("@/lib/newsletter/webhook");
  const { emptyContent } = await import("@/lib/newsletter/content");
  const oneClick = await import("@/app/api/newsletter/unsubscribe/route");
  const { randomToken } = await import("@/lib/newsletter/tokens");

  const original = await getNewsletterSettings();
  const createdNl: string[] = [];
  const cleanup = async () => {
    await db.newsletter.deleteMany({ where: { id: { in: createdNl } } });
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.emailSuppression.deleteMany({ where: { email: { startsWith: PREFIX } } });
    await db.auditLog.deleteMany({ where: { entityId: { in: createdNl } } });
    await saveNewsletterSettings(original);
  };
  await cleanup();

  try {
    await saveNewsletterSettings({ fromAddress: "weekly@example.com", postalAddress: "123 Test St, Dover, OH 44622" });
    const mkSubs = async (n: number, tag: string) => {
      const data = Array.from({ length: n }, (_, i) => ({
        email: `${PREFIX}${tag}-${i}@example.com`, status: "ACTIVE" as const, source: "homepage", consentAt: new Date(), confirmedAt: new Date(), unsubscribeToken: randomToken(32),
      }));
      await db.newsletterSubscriber.createMany({ data });
      return data;
    };
    const mkCampaign = async (subject: string) => {
      const content = emptyContent();
      content.intro = "<p>Hello T-County!</p>";
      const nl = await db.newsletter.create({ data: { subject, content, status: "APPROVED", approvedAt: new Date() } });
      createdNl.push(nl.id);
      return nl;
    };
    const batchCalls = () => calls.filter((c) => c.url.endsWith("/emails/batch"));

    // Only this test's subscribers may be ACTIVE during engine tests: snapshot existing ACTIVE ids and pause them.
    const othersActive = await db.newsletterSubscriber.findMany({ where: { status: "ACTIVE", NOT: { email: { startsWith: PREFIX } } }, select: { id: true } });
    await db.newsletterSubscriber.updateMany({ where: { id: { in: othersActive.map((o) => o.id) } }, data: { status: "PENDING" } });
    try {
      await mkSubs(250, "a");
      // two active-but-suppressed + one unsubscribed: must never be sent to
      await mkSubs(2, "supp");
      await db.emailSuppression.createMany({ data: [0, 1].map((i) => ({ email: `${PREFIX}supp-${i}@example.com`, reason: "unsubscribed" })) });
      await db.newsletterSubscriber.create({ data: { email: `${PREFIX}gone@example.com`, status: "UNSUBSCRIBED", source: "footer", unsubscribeToken: randomToken(32) } });

      const c1 = await mkCampaign("Unit test campaign 1");
      await test("start campaign snapshots only active, non-suppressed recipients", async () => {
        const r = await send.startCampaign(c1.id);
        assert.ok(r.ok, !r.ok ? r.error : "");
        assert.equal(r.ok && r.recipients, 250);
      });
      await test("second start is refused (atomic status guard)", async () => {
        const r = await send.startCampaign(c1.id);
        assert.equal(r.ok, false);
      });
      await test("batches of ≤100 with per-recipient List-Unsubscribe headers", async () => {
        calls.length = 0;
        const r = await send.processCampaign(c1.id, { delayMs: 0 });
        assert.equal(r.sent, 250);
        const b = batchCalls();
        assert.deepEqual(b.map((c) => (c.body as unknown[]).length), [100, 100, 50]);
        const first = (b[0].body as { to: string[]; headers: Record<string, string>; html: string; text: string }[])[0];
        assert.match(first.headers["List-Unsubscribe"], /^<http:\/\/localhost:3000\/api\/newsletter\/unsubscribe\/\?token=[\w-]{20,}>$/);
        assert.equal(first.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
        assert.ok(!first.html.includes("%%UNSUBSCRIBE_URL%%") && first.html.includes("/newsletter/unsubscribe/?token="));
        assert.ok(first.text.includes("123 Test St"), "postal address in footer");
        assert.ok(b[0].headers["Idempotency-Key"]?.startsWith(`nl-${c1.id}-`));
        const allTo = b.flatMap((c) => (c.body as { to: string[] }[]).map((m) => m.to[0]));
        assert.equal(new Set(allTo).size, 250, "no duplicate recipients");
        assert.ok(!allTo.some((t) => t.includes("supp-") || t.includes("gone")), "suppressed/unsubscribed excluded");
        const nl = await db.newsletter.findUnique({ where: { id: c1.id } });
        assert.equal(nl?.status, "SENT");
      });
      await test("processing again sends nothing (idempotent) and duplicate rows are impossible", async () => {
        calls.length = 0;
        const r = await send.processCampaign(c1.id, { delayMs: 0 });
        assert.equal(r.sent, 0);
        assert.equal(calls.length, 0);
        const subsA = await db.newsletterSubscriber.findMany({ where: { email: { startsWith: `${PREFIX}a-` } }, select: { id: true } });
        const dup = await db.newsletterSend.createMany({ data: subsA.map((s) => ({ newsletterId: c1.id, subscriberId: s.id })), skipDuplicates: true });
        assert.equal(dup.count, 0);
        assert.equal(await db.newsletterSend.count({ where: { newsletterId: c1.id } }), 250);
      });

      const c2 = await mkCampaign("Unit test campaign 2");
      await test("suppression added after snapshot is re-checked before the batch", async () => {
        const r = await send.startCampaign(c2.id);
        assert.ok(r.ok);
        await db.emailSuppression.create({ data: { email: `${PREFIX}a-7@example.com`, reason: "complained" } });
        calls.length = 0;
        const p = await send.processCampaign(c2.id, { delayMs: 0 });
        assert.equal(p.skipped, 1);
        assert.equal(p.sent, 249);
        const allTo = batchCalls().flatMap((c) => (c.body as { to: string[] }[]).map((m) => m.to[0]));
        assert.ok(!allTo.includes(`${PREFIX}a-7@example.com`));
      });

      const c3 = await mkCampaign("Unit test campaign 3");
      await test("resumable: maxPerRun limits each invocation; 429 leaves rows queued", async () => {
        assert.ok((await send.startCampaign(c3.id)).ok);
        const r1 = await send.processCampaign(c3.id, { delayMs: 0, maxPerRun: 100 });
        assert.equal(r1.sent, 100);
        assert.equal((await db.newsletter.findUnique({ where: { id: c3.id } }))?.status, "SENDING");
        mode = "429";
        const r2 = await send.processCampaign(c3.id, { delayMs: 0 });
        assert.equal(r2.sent, 0);
        assert.match(r2.stoppedReason ?? "", /retry later/);
        assert.equal((await db.newsletter.findUnique({ where: { id: c3.id } }))?.status, "SENDING");
        mode = "ok";
        const due = await send.processDueNewsletters(); // what /api/cron/ calls
        assert.equal(due.processed, 149);
        assert.equal((await db.newsletter.findUnique({ where: { id: c3.id } }))?.status, "SENT");
        assert.equal(await db.newsletterSend.count({ where: { newsletterId: c3.id, status: "SENT" } }), 249);
      });

      await test("scheduled campaign starts from processDueNewsletters when due", async () => {
        const c4 = await mkCampaign("Unit test campaign 4");
        await db.newsletter.update({ where: { id: c4.id }, data: { status: "SCHEDULED", scheduledFor: new Date(Date.now() - 60_000) } });
        const r = await send.processDueNewsletters();
        assert.equal(r.started, 1);
        assert.equal((await db.newsletter.findUnique({ where: { id: c4.id } }))?.status, "SENT");
      });

      await test("one-click unsubscribe (RFC 8058) → 200, suppressed, queued sends skipped", async () => {
        const s = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: `${PREFIX}a-3@example.com` } });
        const c5 = await mkCampaign("Unit test campaign 5");
        assert.ok((await send.startCampaign(c5.id)).ok);
        const req = new Request(`http://localhost:3000/api/newsletter/unsubscribe/?token=${s.unsubscribeToken}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
        const res = await oneClick.POST(req);
        assert.equal(res.status, 200);
        const after = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: s.id } });
        assert.equal(after.status, "UNSUBSCRIBED");
        assert.ok(await db.emailSuppression.findUnique({ where: { email: s.email } }));
        const row = await db.newsletterSend.findUniqueOrThrow({ where: { newsletterId_subscriberId: { newsletterId: c5.id, subscriberId: s.id } } });
        assert.equal(row.status, "SKIPPED");
        await db.newsletter.update({ where: { id: c5.id }, data: { status: "CANCELED" } });
      });
    } finally {
      await db.newsletterSubscriber.updateMany({ where: { id: { in: othersActive.map((o) => o.id) } }, data: { status: "ACTIVE" } });
    }

    // ── Webhooks ──
    const secretBytes = crypto.randomBytes(24);
    const secret = `whsec_${secretBytes.toString("base64")}`;
    const sign = (id: string, ts: number, body: string) => `v1,${crypto.createHmac("sha256", secretBytes).update(`${id}.${ts}.${body}`).digest("base64")}`;
    await test("webhook signature: valid / invalid / stale", async () => {
      const body = JSON.stringify({ type: "email.delivered", data: { email_id: "x" } });
      const ts = Math.floor(Date.now() / 1000);
      assert.ok(webhook.verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signature: `v1,bogus ${sign("msg_1", ts, body)}` }, body).ok);
      assert.equal(webhook.verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signature: sign("msg_1", ts, body + " ") }, body).ok, false);
      assert.equal(webhook.verifySvixSignature(secret, { id: "msg_2", timestamp: String(ts), signature: sign("msg_1", ts, body) }, body).ok, false);
      const old = ts - 6 * 60;
      const stale = webhook.verifySvixSignature(secret, { id: "msg_1", timestamp: String(old), signature: sign("msg_1", old, body) }, body);
      assert.equal(stale.ok, false);
      assert.match(!stale.ok ? stale.reason : "", /tolerance/);
      assert.equal(webhook.verifySvixSignature(secret, { id: "msg_1", timestamp: String(ts), signature: null }, body).ok, false);
    });
    await test("webhook events update sends idempotently; bounce/complaint suppress", async () => {
      const sends = await db.newsletterSend.findMany({ where: { newsletterId: createdNl[0], status: "SENT" }, take: 3, include: { subscriber: true } });
      const [d, bnc, cmp] = sends;
      await webhook.handleResendEvent({ type: "email.delivered", data: { email_id: d.providerMessageId! } }, "evt_1");
      await webhook.handleResendEvent({ type: "email.delivered", data: { email_id: d.providerMessageId! } }, "evt_1"); // replay
      await webhook.handleResendEvent({ type: "email.opened", data: { email_id: d.providerMessageId! } }, "evt_2");
      await webhook.handleResendEvent({ type: "email.clicked", data: { email_id: d.providerMessageId! } }, "evt_3");
      await webhook.handleResendEvent({ type: "email.bounced", data: { email_id: bnc.providerMessageId!, bounce: { type: "Permanent" } } }, "evt_4");
      await webhook.handleResendEvent({ type: "email.complained", data: { email_id: cmp.providerMessageId! } }, "evt_5");
      await webhook.handleResendEvent({ type: "email.delivered", data: { email_id: cmp.providerMessageId! } }, "evt_6"); // late delivered must not regress
      const dd = await db.newsletterSend.findUniqueOrThrow({ where: { id: d.id } });
      assert.equal(dd.status, "DELIVERED");
      assert.ok(dd.openedAt && dd.clickedAt);
      assert.equal(await db.subscriberEvent.count({ where: { subscriberId: d.subscriberId, type: "delivered" } }), 1);
      assert.equal((await db.newsletterSend.findUniqueOrThrow({ where: { id: bnc.id } })).status, "BOUNCED");
      assert.equal((await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: bnc.subscriberId } })).status, "BOUNCED");
      assert.equal((await db.emailSuppression.findUniqueOrThrow({ where: { email: bnc.subscriber.email } })).reason, "bounced");
      assert.equal((await db.newsletterSend.findUniqueOrThrow({ where: { id: cmp.id } })).status, "COMPLAINED");
      assert.equal((await db.emailSuppression.findUniqueOrThrow({ where: { email: cmp.subscriber.email } })).reason, "complained");
      const stats = await send.computeStats(createdNl[0]);
      assert.equal(stats.reported, true);
      assert.equal(stats.opened, 1);
      assert.equal(stats.bounced, 1);
      assert.equal(stats.complained, 1);
    });

    // ── Double opt-in ──
    await test("signup → PENDING with consent; confirm → ACTIVE + welcome; resubscribe lifts suppression", async () => {
      calls.length = 0;
      const email = `${PREFIX}optin@example.com`;
      assert.equal(await subs.requestSubscription({ email: `  ${email.toUpperCase()} `, firstName: "Ann", source: "homepage" }), "confirmation_sent");
      const s = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      assert.equal(s.status, "PENDING");
      assert.ok(s.consentAt && s.consentText?.includes("Love Local") && s.consentVersion && s.confirmTokenHash && s.confirmTokenHash.length === 64);
      const confirmMail = calls.find((c) => c.url.endsWith("/emails"))!.body as { text: string; to: string[] };
      assert.deepEqual(confirmMail.to, [email]);
      const token = confirmMail.text.match(/confirm\/\?token=([\w-]+)/)![1];
      assert.notEqual(token, s.confirmTokenHash, "only the hash is stored");
      assert.equal((await subs.confirmSubscription(token)).status, "confirmed");
      assert.equal((await subs.confirmSubscription(token)).status, "invalid", "single use");
      const active = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      assert.equal(active.status, "ACTIVE");
      assert.ok(calls.some((c) => (c.body as { subject?: string }).subject?.startsWith("Welcome")));
      assert.equal(await subs.requestSubscription({ email, source: "footer" }), "already_active");
      await subs.unsubscribe(active.id, { method: "link" });
      assert.ok(await db.emailSuppression.findUnique({ where: { email } }));
      calls.length = 0;
      assert.equal(await subs.requestSubscription({ email, source: "article" }), "throttled", "rapid repeat confirmations are throttled");
      await db.subscriberEvent.updateMany({ where: { subscriber: { email }, type: "confirm_sent" }, data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
      assert.equal(await subs.requestSubscription({ email, source: "article" }), "resubscribe_sent");
      assert.equal((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).status, "UNSUBSCRIBED", "stays unsubscribed until confirmed");
      const t2 = ((calls.find((c) => c.url.endsWith("/emails"))!.body as { text: string }).text.match(/confirm\/\?token=([\w-]+)/)!)[1];
      assert.equal((await subs.confirmSubscription(t2)).status, "confirmed");
      assert.equal(await db.emailSuppression.findUnique({ where: { email } }), null);
      assert.ok(await db.subscriberEvent.findFirst({ where: { subscriber: { email }, type: "resubscribed" } }));
    });
    await test("expired confirm token", async () => {
      calls.length = 0;
      const email = `${PREFIX}expired@example.com`;
      await subs.requestSubscription({ email, source: "event" });
      const token = ((calls[0].body as { text: string }).text.match(/confirm\/\?token=([\w-]+)/)!)[1];
      await db.newsletterSubscriber.update({ where: { email }, data: { confirmExpiresAt: new Date(Date.now() - 1000) } });
      assert.equal((await subs.confirmSubscription(token)).status, "expired");
    });

    // ── Refusals ──
    await test("broadcast refuses without a provider or postal address", async () => {
      const c = await mkCampaign("Unit test refusal");
      delete process.env.RESEND_API_KEY;
      let r = await send.startCampaign(c.id);
      assert.equal(r.ok, false);
      assert.match(!r.ok ? r.error : "", /No email provider/);
      process.env.RESEND_API_KEY = "re_test_mock";
      await saveNewsletterSettings({ postalAddress: "" });
      r = await send.startCampaign(c.id);
      assert.equal(r.ok, false);
      assert.match(!r.ok ? r.error : "", /postal/);
      assert.equal((await db.newsletter.findUniqueOrThrow({ where: { id: c.id } })).status, "APPROVED");
      const draft = await db.newsletter.create({ data: { subject: "Unit draft", content: emptyContent() } });
      createdNl.push(draft.id);
      await saveNewsletterSettings({ postalAddress: "123 Test St" });
      r = await send.startCampaign(draft.id);
      assert.equal(r.ok, false, "unapproved drafts never send");
    });
  } finally {
    await cleanup();
  }
  console.log(results.join("\n"));
  console.log(failed ? `\n${failed} test(s) failed` : `\nAll ${results.length} tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

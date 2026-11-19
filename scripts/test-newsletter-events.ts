/**
 * Newsletter Events tool tests (no network: a local mock of the beehiiv posts API).
 *
 *   DATABASE_URL=postgresql://tcs:tcs@localhost:5432/tcs npx tsx --conditions=react-server scripts/test-newsletter-events.ts
 *
 * Uses the real database and removes everything it creates (TEST events use slugs
 * "nletest-*"; Settings "newsletterEvents.*"; audit rows "newsletter.events_*" from this run).
 */
import assert from "node:assert/strict";
import { startPostsMock } from "./beehiiv-posts-mock";

const API_KEY = "bh_test_SECRET_posts_key_never_leak_987";
const PUB = "pub_00000000-nletest-0000-0000-000000000000";
const APP = "https://example-tcc.test";
process.env.APP_URL = APP;

const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    failed++;
    results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 4).join(" | ")}`);
  }
}

// Capture everything printed, to prove the key is never logged.
const logged: string[] = [];
for (const k of ["log", "info", "warn", "error", "debug"] as const) {
  const orig = console[k].bind(console);
  console[k] = (...a: unknown[]) => { logged.push(a.map((x) => (x instanceof Error ? `${x.message} ${x.stack}` : typeof x === "string" ? x : JSON.stringify(x))).join(" ")); orig(...a); };
}

(async () => {
  const mock = await startPostsMock({ apiKey: API_KEY, publicationId: PUB });
  const setEnv = (o: { key?: string | null; pub?: string | null; base?: string }) => {
    if (o.key === null) delete process.env.BEEHIIV_API_KEY; else process.env.BEEHIIV_API_KEY = o.key ?? API_KEY;
    if (o.pub === null) delete process.env.BEEHIIV_PUBLICATION_ID; else process.env.BEEHIIV_PUBLICATION_ID = o.pub ?? PUB;
    process.env.BEEHIIV_API_BASE = o.base ?? mock.base;
  };
  setEnv({});

  const { db } = await import("@/lib/db");
  const ne = await import("@/lib/newsletter-events");
  const html = await import("@/lib/newsletter-events-html");
  const api = await import("@/lib/beehiiv/posts-api");
  const { syncBeehiiv } = await import("@/lib/beehiiv/sync");
  const { previewSignature, toolQuery } = await import("@/lib/newsletter-events-shared");

  const startedAt = new Date();
  const admin = await db.user.findFirst({ where: { email: "admin@example.com" }, select: { id: true } });
  const userId = admin?.id ?? null;
  const syncBefore = await db.setting.findUnique({ where: { key: "beehiiv.sync" } });
  const hadNewsletterCategory = !!(await db.category.findFirst({ where: { slug: "newsletter" } }));
  const issuesBefore = await db.newsletterIssue.count();
  const bhArticlesBefore = await db.article.count({ where: { beehiivPostId: { not: null } } });
  const articlesBefore = await db.article.count();
  const allResults: unknown[] = [];

  const cleanup = async () => {
    await db.event.deleteMany({ where: { slug: { startsWith: "nletest-" } } });
    await db.setting.deleteMany({ where: { key: { startsWith: "newsletterEvents." } } });
    await db.auditLog.deleteMany({ where: { action: { startsWith: "newsletter.events_" }, createdAt: { gte: startedAt } } });
    await db.setting.deleteMany({ where: { key: "beehiiv.syncLock" } });
    if (syncBefore) await db.setting.upsert({ where: { key: "beehiiv.sync" }, create: { key: "beehiiv.sync", value: syncBefore.value as object }, update: { value: syncBefore.value as object } });
    else await db.setting.deleteMany({ where: { key: "beehiiv.sync" } });
    if (!hadNewsletterCategory) await db.category.deleteMany({ where: { slug: "newsletter", articles: { none: {} } } });
  };
  await cleanup();

  // ── Fixed clock: Thu Nov 19 2026, 12:00 PM EST ──
  const NOW = new Date("2026-11-19T17:00:00Z");
  const ny = (s: string) => { const d = new Date(`${s}-05:00`); return d; }; // EST (no DST in late Nov)
  const longDesc = `<p>Rides &amp; <b>games</b> for the whole family at the park.</p><script>alert(1)</script>${" More fun and food trucks all afternoon long with live music.".repeat(5)}`;
  const mk = (slug: string, data: Record<string, unknown>) => db.event.create({ data: { slug: `nletest-${slug}`, title: `NLE ${slug}`, status: "PUBLISHED", startAt: NOW, ...data } as never });
  const A = await mk("a", { title: `Fish & Chips <Fry> "Night"`, startAt: ny("2026-11-21T12:00:00"), endAt: ny("2026-11-21T18:00:00"), locationName: "Tuscora Park", city: "New Philadelphia", isFree: true, description: longDesc });
  const B = await mk("b", { title: "NLE daily yoga", startAt: ny("2026-11-18T09:00:00"), endAt: ny("2026-11-18T10:00:00"), recurrence: { freq: "DAILY", interval: 1 }, city: "Dover", isFree: false, price: null });
  await mk("c-draft", { status: "DRAFT", startAt: ny("2026-11-21T10:00:00") });
  await mk("d-unpub", { status: "UNPUBLISHED", startAt: ny("2026-11-21T10:00:00") });
  await mk("e-deleted", { startAt: ny("2026-11-21T10:00:00"), deletedAt: new Date() });
  await mk("f-past", { startAt: ny("2026-11-18T10:00:00"), endAt: ny("2026-11-18T11:00:00") });
  await mk("g-after", { startAt: ny("2026-11-26T00:30:00") });
  await mk("p-pending", { status: "PENDING", startAt: ny("2026-11-22T10:00:00") });
  const H = await mk("h-lastday", { title: "NLE last day", startAt: ny("2026-11-25T23:30:00") });
  const I = await mk("i-bare", { title: "NLE bare", startAt: ny("2026-11-20T19:00:00"), isFree: false, price: "$5 at the door" });
  const J = await mk("j-inprogress", { title: "NLE in progress", startAt: ny("2026-11-19T11:00:00"), endAt: ny("2026-11-19T14:00:00"), isFree: false });
  const mine = <T extends { slug: string }>(list: T[]) => list.filter((o) => o.slug.startsWith("nletest-"));

  try {
    // ───────── Range & selection ─────────
    await test("default range: today 00:00 → +7 days (NY), inclusive dates today … today+6", () => {
      const r = ne.defaultRange(NOW);
      assert.equal(r.fromKey, "2026-11-19");
      assert.equal(r.toKey, "2026-11-25");
      assert.equal(r.start.toISOString(), "2026-11-19T05:00:00.000Z");
      assert.equal(r.end.toISOString(), "2026-11-26T04:59:59.999Z");
      // Late evening in New York is still "today" there (UTC is already tomorrow).
      assert.equal(ne.defaultRange(new Date("2026-11-20T03:30:00Z")).fromKey, "2026-11-19");
    });
    await test("DST-safe boundaries (fall back Nov 1, spring forward Mar 8)", () => {
      const fall = ne.defaultRange(new Date("2026-10-30T16:00:00Z"));
      assert.equal(fall.start.toISOString(), "2026-10-30T04:00:00.000Z", "EDT midnight");
      assert.equal(fall.toKey, "2026-11-05");
      assert.equal(fall.end.toISOString(), "2026-11-06T04:59:59.999Z", "EST end of day");
      const spring = ne.defaultRange(new Date("2026-03-05T17:00:00Z"));
      assert.equal(spring.start.toISOString(), "2026-03-05T05:00:00.000Z", "EST midnight");
      assert.equal(spring.end.toISOString(), "2026-03-12T03:59:59.999Z", "EDT end of day");
    });
    await test("parseRange: custom dates, swapped and too-long ranges are clamped", () => {
      const r = ne.parseRange("2026-12-01", "2026-12-03", NOW);
      assert.equal(r.fromKey, "2026-12-01"); assert.equal(r.toKey, "2026-12-03");
      assert.ok(ne.parseRange("2026-12-05", "2026-12-01", NOW).error);
      assert.equal(ne.parseRange("2026-12-01", "2027-06-01", NOW).toKey, "2027-01-31");
      assert.equal(ne.parseRange("garbage", null, NOW).fromKey, "2026-11-19");
    });

    const range = ne.defaultRange(NOW);
    const all = mine(await ne.loadRangeOccurrences(range, NOW));
    await test("public visibility: draft/pending/unpublished/deleted/past/outside excluded; in-progress and last-day included", () => {
      const slugs = new Set(all.map((o) => o.slug));
      for (const s of ["c-draft", "d-unpub", "e-deleted", "f-past", "g-after", "p-pending"]) assert.ok(!slugs.has(`nletest-${s}`), `${s} excluded`);
      for (const s of ["a", "b", "h-lastday", "i-bare", "j-inprogress"]) assert.ok(slugs.has(`nletest-${s}`), `${s} included`);
    });
    await test("recurring: one entry per occurrence in range, already-ended occurrence today excluded, labelled recurring", () => {
      const b = all.filter((o) => o.id === B.id);
      assert.equal(b.length, 6, `daily Nov 20–25 (got ${b.map((o) => o.occurrenceStart.toISOString()).join(",")})`);
      assert.ok(b.every((o) => o.recurring));
      assert.ok(all.filter((o) => o.id !== B.id).every((o) => !o.recurring));
      assert.equal(new Set(b.map((o) => o.key)).size, 6, "unique keys");
    });
    await test("sorted by start date/time", () => {
      for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].occurrenceStart <= all[i].occurrenceStart);
      assert.equal(all[0].id, J.id, "in-progress first");
      assert.equal(all[all.length - 1].id, H.id, "last day last");
    });
    const aOcc = all.find((o) => o.id === A.id)!;
    const iOcc = all.find((o) => o.id === I.id)!;
    await test("featured is pinned and excluded from the regular list; deselected items dropped", () => {
      const ex = [all.find((o) => o.id === B.id)!.key];
      const { featured, items } = ne.applySelection(all, { excluded: [...ex, aOcc.key], featured: aOcc.key });
      assert.equal(featured?.key, aOcc.key, "featured even if its checkbox was cleared");
      assert.ok(!items.some((o) => o.key === aOcc.key), "not in regular list");
      assert.ok(!items.some((o) => o.key === ex[0]), "deselected excluded");
      assert.equal(items.length, all.length - 2);
      assert.equal(ne.applySelection(all, { excluded: [], featured: "nope~1" }).featured, null, "unknown featured key ignored");
    });

    // ───────── HTML ─────────
    const { featured, items } = ne.applySelection(all, { excluded: [], featured: aOcc.key });
    const cards = html.buildEventCardsHtml({ featured, items, baseUrl: APP });
    await test("HTML: text escaped (no raw tags/quotes from data), description stripped + truncated", () => {
      assert.ok(cards.includes("Fish &amp; Chips &lt;Fry&gt; &quot;Night&quot;"));
      assert.ok(!cards.includes("<Fry>") && !cards.includes("<script") && !cards.includes("alert(1)") && !cards.includes("<b>"));
      const desc = html.shortDescription(longDesc)!;
      assert.ok(desc.length <= 161 && desc.endsWith("…"), `truncated: ${desc.length}`);
      assert.ok(cards.includes("Rides &amp; games for the whole family"));
    });
    await test("HTML: absolute canonical URLs only", () => {
      const hrefs = [...cards.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      assert.ok(hrefs.length >= all.length * 2);
      assert.ok(hrefs.every((h) => h.startsWith(`${APP}/events/`)), hrefs.find((h) => !h.startsWith(APP)));
      assert.ok(hrefs.includes(`${APP}/events/nletest-a/`));
      const blocks = html.buildSectionBlocks({ featured, items, baseUrl: APP, intro: html.DEFAULT_INTRO });
      const btn = blocks.find((b) => b.type === "button");
      assert.ok(btn && btn.type === "button" && btn.href === `${APP}/events/` && btn.text === "View Full Calendar");
    });
    await test("HTML: email-safe (inline styles, tables, max-width 600, no <style>/<link>/class/iframe/img/script)", () => {
      assert.ok(!/<style|<link|<iframe|<img|<script|\sclass=/i.test(cards));
      assert.ok(cards.startsWith("<table") && cards.includes("max-width:600px"));
      assert.ok(/role="presentation"/.test(cards));
    });
    await test("HTML: featured card first, shaded, eyebrow, not repeated", () => {
      const feat = cards.indexOf('data-featured="1"');
      assert.ok(feat > 0 && cards.indexOf("FEATURED EVENT") > feat);
      assert.equal(cards.split('data-featured="1"').length - 1, 1);
      assert.ok(cards.includes("background-color:#F7F8F5") && cards.includes("border:1px solid #E5E7E0") && cards.includes("border-radius:12px"));
      assert.equal(cards.split("Fish &amp; Chips").length - 1, 1, "featured title appears once");
      assert.ok(feat < cards.indexOf("NLE in progress"), "featured before the earliest regular event");
    });
    await test("HTML: time/venue/price lines; missing fields omitted", () => {
      assert.equal(html.whenLabel(aOcc), "Sat, Nov 21 · 12:00 PM – 6:00 PM");
      assert.equal(html.placeLabel(aOcc), "Tuscora Park, New Philadelphia");
      assert.ok(cards.includes(">Free<"));
      const bare = html.buildEventCardsHtml({ featured: null, items: [iOcc], baseUrl: APP });
      assert.ok(bare.includes("$5 at the door") && bare.includes("Fri, Nov 20 · 7:00 PM"));
      assert.ok(!bare.includes("Free") && !bare.includes("color:#475569"), "no venue line, no Free");
      assert.equal((bare.match(/<p /g) ?? []).length, 4, "title, time, price, link only");
      assert.equal(html.placeLabel({ locationName: "Dover City Park, Dover", city: "Dover" }), "Dover City Park, Dover");
      assert.equal(html.placeLabel({ locationName: "Dover Elks", city: "Dover" }), "Dover Elks, Dover");
      assert.equal(html.whenLabel({ occurrenceStart: ny("2026-11-21T00:00:00"), occurrenceEnd: null, allDay: true }), "Sat, Nov 21 · All day");
    });
    await test("preview document wraps the exact cards HTML; signature + query round-trip", () => {
      const blocks = html.buildSectionBlocks({ featured, items, baseUrl: APP, intro: "" });
      assert.deepEqual(blocks.map((b) => b.type), ["heading", "html", "button"], "empty intro → no paragraph");
      const doc = html.renderPreviewDocument(blocks, { title: "T <b>", subtitle: "" });
      assert.ok(doc.includes(cards) && doc.includes("T &lt;b&gt;") && !/<iframe/i.test(doc));
      const st = { from: "2026-11-19", to: "2026-11-25", excluded: ["b", "a"], featured: "x~1", title: "T", subtitle: "", intro: "i", archiveTag: false };
      assert.equal(previewSignature(st), previewSignature({ ...st, excluded: ["a", "b"] }));
      const q = new URLSearchParams(toolQuery(st, { preview: true }));
      assert.equal(q.get("ex"), "b,a"); assert.equal(q.get("tag"), "0"); assert.equal(q.get("preview"), "1");
    });

    // ───────── Request body ─────────
    await test("body builder: always status draft, never scheduled_at, tags + template passthrough", () => {
      const blocks = html.buildSectionBlocks({ featured, items, baseUrl: APP, intro: "Hi" });
      const b1 = api.buildDraftPostBody({ title: "  Week  of fun ", subtitle: "", blocks });
      assert.equal(b1.status, "draft");
      assert.equal(b1.title, "Week of fun");
      assert.ok(!("scheduled_at" in b1) && !("content_tags" in b1) && !("post_template_id" in b1) && !("subtitle" in b1) && !("body_content" in b1));
      const tid = "post_template_0a1b2c3d-0000-4000-8000-123456789abc";
      const b2 = api.buildDraftPostBody({ title: "W", subtitle: "S", blocks, contentTags: ["newsletter-archive", "newsletter-archive"], templateId: tid });
      assert.deepEqual(b2.content_tags, ["newsletter-archive"]);
      assert.equal(b2.post_template_id, tid);
      assert.equal(b2.subtitle, "S");
      assert.deepEqual(Object.keys(b2).sort(), ["blocks", "content_tags", "post_template_id", "status", "subtitle", "title"]);
      assert.throws(() => api.buildDraftPostBody({ title: "W", blocks, templateId: "tmpl_123" }), /template/);
      assert.throws(() => api.buildDraftPostBody({ title: " ", blocks }), /title/);
    });
    await test("assertDraftOnly refuses confirmed, scheduled_at, unknown fields", () => {
      const ok = { title: "T", blocks: [{ type: "html", html: "<p>x</p>" }], status: "draft" };
      assert.doesNotThrow(() => api.assertDraftOnly(ok));
      assert.throws(() => api.assertDraftOnly({ ...ok, status: "confirmed" }), /only "draft"/);
      assert.throws(() => api.assertDraftOnly({ ...ok, status: undefined }), /only "draft"/);
      assert.throws(() => api.assertDraftOnly({ ...ok, scheduled_at: "2030-01-01T00:00:00Z" }), /scheduled_at/);
      assert.throws(() => api.assertDraftOnly({ ...ok, recipients: {} }), /recipients/);
    });
    await test("createDraftPost re-checks the body before sending (nothing sent)", async () => {
      const before = mock.requests.length;
      await assert.rejects(() => api.createDraftPost({ apiKey: API_KEY, publicationId: PUB, apiBase: mock.base }, { title: "T", blocks: [{ type: "html", html: "x" }], status: "confirmed" } as never));
      assert.equal(mock.requests.length, before);
    });
    await test("edit URL / template id format", () => {
      assert.equal(api.beehiivEditUrl("post_00000000-0000-0000-0000-000000000000"), "https://app.beehiiv.com/posts/00000000-0000-0000-0000-000000000000/edit");
      assert.ok(api.POST_TEMPLATE_ID_RE.test("post_template_00000000-0000-0000-0000-000000000000"));
      assert.ok(!api.POST_TEMPLATE_ID_RE.test("post_template_<script>"));
    });

    // ───────── Create draft (server logic behind the action) ─────────
    const form = (o: Partial<Parameters<typeof ne.createNewsletterDraft>[0]> = {}) => ({
      token: ne.newRequestToken(), fromKey: null, toKey: null, excluded: [], featured: aOcc.key, title: "NLE Weekly", subtitle: "Sub", intro: html.DEFAULT_INTRO, archiveTag: true, ...o,
    });
    const opts = { userId, now: NOW, pollDelayMs: 10 };
    const posts = () => mock.requests.filter((r) => r.method === "POST" && /\/posts$/.test(r.path));
    const run = async (f: ReturnType<typeof form>, o: Partial<Parameters<typeof ne.createNewsletterDraft>[1]> = {}) => { const r = await ne.createNewsletterDraft(f, { ...opts, ...o }); allResults.push(r); return r; };

    const f1 = form();
    let createdId = "";
    await test("201 → post id stored, exact draft body sent, polled until ready", async () => {
      mock.requests.length = 0;
      const r = await run(f1);
      assert.equal(r.status, "created", JSON.stringify(r));
      if (r.status !== "created") return;
      createdId = r.record.postId!;
      assert.ok(mock.posts.has(createdId));
      assert.equal(r.record.postState, "ready", "202 then 200");
      assert.equal(r.editUrl, `https://app.beehiiv.com/posts/${createdId.slice(5)}/edit`);
      assert.equal(r.record.previewUrl, `https://app.beehiiv.com/posts/${createdId}/preview`);
      const stored = await ne.getRequest(f1.token);
      assert.equal(stored?.status, "created"); assert.equal(stored?.postId, createdId);
      assert.equal(posts().length, 1);
      const sent = posts()[0];
      assert.equal(sent.auth, `Bearer ${API_KEY}`);
      const body = sent.body as Record<string, unknown>;
      assert.equal(body.status, "draft");
      assert.ok(!("scheduled_at" in body));
      assert.deepEqual(body.content_tags, ["newsletter-archive"]);
      assert.equal(body.title, "NLE Weekly"); assert.equal(body.subtitle, "Sub");
      assert.deepEqual((body.blocks as { type: string }[]).map((b) => b.type), ["heading", "paragraph", "html", "button"]);
      assert.deepEqual((body.blocks as Record<string, unknown>[])[0], { type: "heading", level: "2", text: "Things to Do", anchorHeader: false, anchorIncludeInToc: false });
      assert.ok(!("post_template_id" in body), "no template configured → omitted");
      const gets = mock.requests.filter((q) => q.method === "GET" && q.path.endsWith(createdId));
      assert.equal(gets.length, 2);
      console.log("REQUEST BODY (first 600 chars):", JSON.stringify({ ...body, blocks: (body.blocks as Record<string, unknown>[]).map((b) => (b.type === "html" ? { type: "html", html: `${String(b.html).slice(0, 80)}…(${String(b.html).length} chars)` } : b)) }));
    });
    await test("double submit with the same token → stored result, exactly one POST", async () => {
      const r = await run(f1);
      assert.equal(r.status, "created");
      assert.match(r.message, /already created/);
      assert.equal(posts().length, 1);
    });
    await test("concurrent submits with one token (slow beehiiv) → exactly one POST", async () => {
      mock.requests.length = 0;
      const f = form({ title: "NLE concurrent [delay]" });
      const [r1, r2, r3] = await Promise.all([run(f), run(f), run(f)]);
      assert.equal(posts().length, 1, `POSTs: ${posts().length}`);
      const st = [r1, r2, r3].map((r) => r.status).sort();
      assert.ok(st.includes("created"), st.join());
      assert.ok(st.filter((s) => s === "created").length + st.filter((s) => s === "duplicate").length === 3, st.join());
    });
    await test("template id from settings is passed through", async () => {
      const bad = await ne.saveTemplateId("not-a-template", userId);
      assert.equal(bad.ok, false);
      const tid = "post_template_11111111-2222-4333-8444-555555555555";
      assert.ok((await ne.saveTemplateId(tid, userId)).ok);
      assert.equal(await ne.getTemplateId(), tid);
      mock.requests.length = 0;
      const r = await run(form({ title: "NLE templated", archiveTag: false }));
      assert.equal(r.status, "created");
      const body = posts()[0].body as Record<string, unknown>;
      assert.equal(body.post_template_id, tid);
      assert.ok(!("content_tags" in body), "tag unchecked → no content_tags");
      assert.ok((await ne.saveTemplateId("", userId)).ok);
      assert.equal(await ne.getTemplateId(), null);
    });
    await test("ambiguous timeout → status unknown, NOT retried; Check beehiiv recovers the post id", async () => {
      mock.requests.length = 0;
      const f = form({ title: "NLE slow one [timeout]" });
      const r = await run(f, { timeoutMs: 300 });
      assert.equal(r.status, "unknown", JSON.stringify(r));
      assert.match(r.message, /NOT retried/);
      assert.match(r.message, /Drafts/);
      assert.equal((await ne.getRequest(f.token))?.status, "unknown");
      await new Promise((res) => setTimeout(res, 3300));
      assert.equal(posts().length, 1, "no automatic retry");
      const again = await run(f);
      assert.equal(again.status, "unknown");
      assert.equal(posts().length, 1, "resubmitting the same token does not call beehiiv");
      const listed = (await ne.listToolDrafts()).map((d) => d.token);
      assert.ok(listed.includes(f.token), "unknown attempt listed for checking");
      const check = await ne.checkBeehiivForRequest(f.token, { userId });
      allResults.push(check);
      assert.equal(check.status, "recovered", JSON.stringify(check));
      const lst = mock.requests.find((q) => q.method === "GET" && /\/posts$/.test(q.path));
      assert.ok(lst && lst.query.includes("status=draft") && lst.query.includes("limit=10"));
      const rec = await ne.getRequest(f.token);
      assert.equal(rec?.status, "created"); assert.ok(rec?.postId && mock.posts.has(rec.postId) && rec.recovered);
    });
    await test("dropped connection and 5xx after sending → unknown (no retry)", async () => {
      mock.requests.length = 0;
      const r1 = await run(form({ title: "NLE dropped [drop]" }));
      const r2 = await run(form({ title: "NLE five hundred [500]" }));
      assert.equal(r1.status, "unknown", JSON.stringify(r1));
      assert.equal(r2.status, "unknown", JSON.stringify(r2));
      assert.equal(posts().length, 2);
    });
    await test("Check beehiiv with no matching draft → not_found; abandon issues a new token", async () => {
      const f = form({ title: "NLE gone [drop]" });
      await run(f);
      mock.posts.forEach((p, id) => { if (p.title === f.title) mock.posts.delete(id); });
      const c = await ne.checkBeehiivForRequest(f.token, { userId });
      assert.equal(c.status, "not_found");
      const a = await ne.abandonRequest(f.token, userId);
      assert.ok(a.ok && ne.isRequestToken(a.nextToken) && a.nextToken !== f.token);
      assert.equal((await ne.getRequest(f.token))?.status, "abandoned");
    });
    await test("401/403 → clear permission message; 404 → publication id; 422 → rejected; new token offered", async () => {
      const r401 = await run(form({ title: "NLE [401]" }));
      assert.equal(r401.status, "failed");
      assert.match(r401.message, /posts:write/); assert.match(r401.message, /Pro or Enterprise/); assert.match(r401.message, /HTTP 401/);
      if (r401.status === "failed") assert.ok(ne.isRequestToken(r401.nextToken));
      const r403 = await run(form({ title: "NLE [403]" }));
      assert.match(r403.message, /posts:write/);
      const r404 = await run(form({ title: "NLE [404]" }));
      assert.match(r404.message, /BEEHIIV_PUBLICATION_ID/);
      const r422 = await run(form({ title: "NLE [422]" }));
      assert.equal(r422.status, "failed"); assert.match(r422.message, /Nothing was created/);
      setEnv({ key: "wrong_key" });
      const bad = await run(form({ title: "NLE wrong key" }));
      setEnv({});
      assert.equal(bad.status, "failed"); assert.match(bad.message, /posts:write/);
    });
    await test("created then POST_CREATION_FAILED → reported", async () => {
      const r = await run(form({ title: "NLE [createfail]" }));
      assert.equal(r.status, "created");
      if (r.status === "created") assert.equal(r.record.postState, "failed");
      assert.match(r.message, /could not finish/);
    });
    await test("connection refused → failed (nothing sent), new token", async () => {
      const net = await import("node:net");
      const port = await new Promise<number>((res) => { const sv = net.createServer().listen(0, "127.0.0.1", () => { const p = (sv.address() as { port: number }).port; sv.close(() => res(p)); }); });
      setEnv({ base: `http://127.0.0.1:${port}/v2` });
      const r = await run(form({ title: "NLE refused" }));
      setEnv({});
      assert.equal(r.status, "failed", JSON.stringify(r));
      assert.match(r.message, /Nothing was sent/);
    });
    await test("validation: no title / no events → invalid, nothing sent, token kept", async () => {
      mock.requests.length = 0;
      const f = form({ title: "  " });
      const r = await run(f);
      assert.equal(r.status, "invalid");
      if (r.status === "invalid") assert.equal(r.nextToken, f.token);
      const r2 = await run(form({ excluded: all.map((o) => o.key), featured: null }));
      assert.equal(r2.status, "invalid"); assert.match(r2.message, /at least one/);
      assert.equal(mock.requests.length, 0);
      assert.equal(await ne.getRequest(f.token), null, "no record for invalid input");
    });
    await test("env missing → exact Railway variable names, nothing sent", async () => {
      mock.requests.length = 0;
      setEnv({ key: null, pub: null });
      const both = await run(form());
      assert.equal(both.status, "missing_env");
      if (both.status === "missing_env") assert.deepEqual(both.missing, ["BEEHIIV_API_KEY", "BEEHIIV_PUBLICATION_ID"]);
      setEnv({ key: null });
      const one = await run(form());
      if (one.status === "missing_env") assert.deepEqual(one.missing, ["BEEHIIV_API_KEY"]); else assert.fail("expected missing_env");
      assert.deepEqual(ne.missingBeehiivVars(), ["BEEHIIV_API_KEY"]);
      setEnv({});
      assert.equal(mock.requests.length, 0);
    });
    await test("drafts list: created drafts newest first, max 10", async () => {
      const list = await ne.listToolDrafts(10);
      assert.ok(list.length > 0 && list.length <= 10);
      assert.ok(list.every((d) => d.status === "created" || d.status === "unknown"));
      assert.ok(list.some((d) => d.postId === createdId));
    });
    await test("APP_URL fallback flagged", () => {
      const save = process.env.APP_URL;
      delete process.env.APP_URL;
      assert.deepEqual(ne.newsletterBaseUrl(), { base: "https://tcountyconnect.com", fromEnv: false });
      process.env.APP_URL = "https://x.test/";
      assert.deepEqual(ne.newsletterBaseUrl(), { base: "https://x.test", fromEnv: true });
      process.env.APP_URL = save;
    });
    await test("audit log records attempts (no secrets)", async () => {
      const rows = await db.auditLog.findMany({ where: { action: { startsWith: "newsletter.events_" }, createdAt: { gte: startedAt } } });
      const actions = new Set(rows.map((r) => r.action));
      for (const a of ["newsletter.events_draft_created", "newsletter.events_draft_unknown", "newsletter.events_draft_failed", "newsletter.events_draft_recovered", "newsletter.events_template"]) assert.ok(actions.has(a), a);
      assert.ok(rows.filter((r) => r.action === "newsletter.events_draft_created").every((r) => (r.details as { status?: string })?.status === "draft"));
    });
    await test("API key never appears in results, logs, audit rows or stored settings", async () => {
      const audits = await db.auditLog.findMany({ where: { createdAt: { gte: startedAt } } });
      const settings = await db.setting.findMany({ where: { key: { startsWith: "newsletterEvents." } } });
      const hay = [JSON.stringify(allResults), logged.join("\n"), JSON.stringify(audits), JSON.stringify(settings)].join("\n");
      assert.ok(!hay.includes(API_KEY), "key leaked");
      assert.ok(!hay.includes("SECRET_posts_key"), "key fragment leaked");
    });
    await test("creating drafts creates no Article/NewsletterIssue; a sync afterwards imports nothing (drafts skipped)", async () => {
      assert.equal(await db.newsletterIssue.count(), issuesBefore);
      assert.equal(await db.article.count(), articlesBefore);
      if (issuesBefore || bhArticlesBefore) { results.push("NOTE sync step skipped: database already has beehiiv-synced rows"); return; }
      const drafts = [...mock.posts.values()];
      assert.ok(drafts.length >= 5 && drafts.every((p) => p.status === "draft"));
      const s = await syncBeehiiv({ trigger: "test" });
      assert.equal(s.status, "ok", s.message);
      assert.equal(s.counts.fetched, drafts.length, "mock leaked every draft into the confirmed listing");
      assert.equal(s.counts.skipped, drafts.length);
      assert.equal(s.counts.issuesCreated + s.counts.articlesCreated, 0);
      assert.equal(await db.newsletterIssue.count(), issuesBefore);
      assert.equal(await db.article.count({ where: { beehiivPostId: { in: drafts.map((d) => d.id) } } }), 0);
    });
  } finally {
    await cleanup();
    await mock.close();
    const left = await db.event.count({ where: { slug: { startsWith: "nletest-" } } }) + await db.setting.count({ where: { key: { startsWith: "newsletterEvents." } } });
    results.push(left === 0 ? "PASS cleanup: no TEST events or newsletterEvents settings left" : `FAIL cleanup: ${left} rows left`);
    if (left) failed++;
    console.log(`\n${results.join("\n")}\n\n${results.filter((r) => r.startsWith("PASS")).length} passed, ${failed} failed`);
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
})();

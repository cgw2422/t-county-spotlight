/**
 * beehiiv integration tests (no network: a local mock beehiiv v2 API server).
 *
 *   DATABASE_URL=postgresql://tcs:tcs@localhost:5432/tcs npx tsx --conditions=react-server scripts/test-beehiiv.ts
 *
 * Uses the real database and removes everything it creates (TEST posts use ids
 * "post_bhtest_*"). Covers: pagination; only confirmed + past publish_date
 * imported; future/draft skipped; routing (newsletter-archive → issue only;
 * every other public web post → article, no tag needed; email-only and
 * premium-gated skipped; legacy tcc-article kept); dedupe on re-run + title updates;
 * locally edited articles kept; removal handling; email-only fallback flagged;
 * sanitization; missing env → no-op; concurrent-run lock; API key never stored;
 * retired embed URL ignored; exports; built-in sending retired in beehiiv mode.
 */
import http from "node:http";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.APP_URL ||= "http://localhost:3000";
const API_KEY = "bh_test_SECRET_key_do_not_leak_123";
const PUB = "pub_00000000-test-0000-0000-000000000000";

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

// ── Mock beehiiv API ──
type MockPost = Record<string, unknown> & { id: string; content_tags: string[] };
const now = Math.floor(Date.now() / 1000);
const posts = new Map<string, MockPost>();
const requests: { url: URL; auth: string | undefined }[] = [];
let failPage: number | null = null;
let delayMs = 0;

function post(id: string, o: Partial<MockPost> & { tags: string[]; web?: string; email?: string }): MockPost {
  const { tags, web, email, ...rest } = o;
  return {
    id: `post_bhtest_${id}`, title: `Test post ${id}`, subtitle: `Subtitle ${id}`, slug: `bhtest-${id.toLowerCase()}`, status: "confirmed",
    publish_date: now - 3600, thumbnail_url: "https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto/uploads/asset/file/test.png",
    web_url: `https://tcountyconnect.beehiiv.com/p/bhtest-${id.toLowerCase()}`, platform: "both", content_tags: tags, authors: ["Test Author"],
    meta_default_description: `Meta ${id}`,
    content: { free: { web: web ?? `<p>Web body for ${id}</p><img src="https://media.beehiiv.com/uploads/asset/file/${id}.jpg" alt="pic">`, email: email ?? `<p>Email body for ${id}</p>` } },
    ...rest,
  };
}

function reset() {
  posts.clear();
  for (let i = 1; i <= 205; i++) posts.set(`A${i}`, post(`A${i}`, { tags: ["newsletter-archive"], publish_date: now - 86400 * (300 - i) }));
  posts.set("F1", post("F1", { tags: ["newsletter-archive"], publish_date: now + 86400 })); // scheduled: confirmed but in the future
  posts.set("D1", post("D1", { tags: ["newsletter-archive"], status: "draft" })); // the mock leaks a draft; the sync must skip it
  posts.set("T1", post("T1", { tags: ["tcc-article"] }));
  posts.set("B1", post("B1", { tags: ["newsletter-archive", "tcc-article"] }));
  posts.set("U1", post("U1", { tags: [] }));
  posts.set("E1", post("E1", {
    tags: ["newsletter-archive"], web: "",
    email: `<!DOCTYPE html><html><head><title>EMAIL TITLE LEAK</title><style>.x{color:red}</style></head><body>
      <table width="600" style="width:600px"><tr><td><a href="https://tcountyconnect.beehiiv.com/p/x">View online</a></td></tr>
      <tr><td><h1>Email-only issue</h1><p>This is the real email story text with plenty of words so it is clearly the main content of the message.</p>
      <img src="https://media.beehiiv.com/uploads/asset/file/hero.jpg" alt="hero"></td></tr>
      <tr><td><p>Update your email preferences or <a href="{{unsubscribe_url}}">unsubscribe</a>.</p></td></tr></table>
      <img src="https://link.mail.beehiiv.com/ss/o/open.gif" width="1" height="1" alt="">
      <script>alert(1)</script></body></html>`,
  }));
  posts.set("S1", post("S1", {
    tags: ["newsletter-archive"],
    web: `<html><head><title>WEB TITLE LEAK</title></head><body><div class="post"><p onclick="steal()">Hello <strong>county</strong></p><script>document.cookie</script>
      <iframe src="https://evil.example.com/x"></iframe><iframe src="https://www.youtube.com/embed/abc" title="v"></iframe>
      <a href="javascript:alert(1)">bad link</a><img src="https://media.beehiiv.com/uploads/asset/file/ok.jpg" onerror="x()" alt="ok"></div></body></html>`,
  }));
  posts.set("R1", post("R1", { tags: ["newsletter-archive"], slug: "thanks", title: "Thanks" })); // would collide with /newsletter/thanks/
  posts.set("W1", post("W1", { tags: [], platform: "web" })); // Web only, untagged → article
  posts.set("M1", post("M1", { tags: [], platform: "email" })); // email-only send → not an article
  posts.set("P1", post("P1", { tags: [], audience: "premium" })); // premium-gated → not an article
  posts.set("X1", post("X1", { tags: [], web: "" })); // public post with no web body → not auto-imported from email HTML
  posts.set("L1", post("L1", { tags: ["tcc-article"], platform: "email", web: "" })); // legacy tag: keeps the old email fallback
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  requests.push({ url, auth: req.headers.authorization });
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const m = url.pathname.match(/^\/v2\/publications\/([^/]+)\/posts$/);
  if (!m) { res.writeHead(404).end("{}"); return; }
  if (req.headers.authorization !== `Bearer ${API_KEY}`) { res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ errors: [{ message: "unauthorized" }] })); return; }
  if (decodeURIComponent(m[1]) !== PUB) { res.writeHead(404).end("{}"); return; }
  const tags = url.searchParams.getAll("content_tags[]");
  if (failPage && Number(url.searchParams.get("page") ?? 1) === failPage) { res.writeHead(500).end("{}"); return; }
  const status = url.searchParams.get("status");
  const expand = url.searchParams.getAll("expand[]");
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 10));
  const page = Number(url.searchParams.get("page") ?? 1);
  let list = [...posts.values()].filter((p) => !tags.length || tags.some((t) => p.content_tags.includes(t)));
  // Real beehiiv filters by status; the mock lets drafts through to prove the sync double-checks.
  if (status === "confirmed") list = list.filter((p) => p.status === "confirmed" || p.status === "draft");
  list.sort((a, b) => Number(b.publish_date) - Number(a.publish_date));
  const slice = list.slice((page - 1) * limit, page * limit).map((p) => {
    const content = p.content as { free: { web: string; email: string } };
    return { ...p, content: { free: { ...(expand.includes("free_web_content") ? { web: content.free.web } : {}), ...(expand.includes("free_email_content") ? { email: content.free.email } : {}) } } };
  });
  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ data: slice, limit, page, total_results: list.length, total_pages: Math.max(1, Math.ceil(list.length / limit)) }));
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  const { db } = await import("@/lib/db");
  const { syncBeehiiv, maybeSyncBeehiivFromCron, getLastSyncResult, isLive, RESERVED_ISSUE_SLUGS } = await import("@/lib/beehiiv/sync");
  const { prepareBeehiivContent } = await import("@/lib/beehiiv/html");
  const { getNewsletterSettings, saveNewsletterSettings } = await import("@/lib/newsletter/settings");
  const exportLib = await import("@/lib/newsletter/export");
  const send = await import("@/lib/newsletter/send");
  const { randomToken } = await import("@/lib/newsletter/tokens");

  const started = new Date();
  const originalNl = await getNewsletterSettings();
  const originalNlRow = await db.setting.findUnique({ where: { key: "newsletter" } });
  const originalSync = await db.setting.findUnique({ where: { key: "beehiiv.sync" } });
  const originalMarker = await db.setting.findUnique({ where: { key: "beehiivNewsletterCategoryBackfill" } });
  const hadNewsletterCategory = !!(await db.category.findFirst({ where: { OR: [{ slug: "newsletter" }, { name: { equals: "Newsletter", mode: "insensitive" } }] } }));
  const SUB = "bhtest-sub-";
  const cleanup = async () => {
    await db.newsletterIssue.deleteMany({ where: { beehiivPostId: { startsWith: "post_bhtest_" } } });
    await db.article.deleteMany({ where: { beehiivPostId: { startsWith: "post_bhtest_" } } });
    await db.newsletterSubscriber.deleteMany({ where: { email: { startsWith: SUB } } });
    await db.emailSuppression.deleteMany({ where: { email: { startsWith: SUB } } });
    await db.newsletter.deleteMany({ where: { subject: { startsWith: "bhtest " } } });
    await db.setting.deleteMany({ where: { key: "beehiiv.syncLock" } });
    await db.article.deleteMany({ where: { slug: { startsWith: "bhtest-local-" } } });
    await db.category.deleteMany({ where: { slug: { startsWith: "bhtest-cat-" } } });
    if (!hadNewsletterCategory) await db.category.deleteMany({ where: { slug: "newsletter", articles: { none: {} } } });
    if (originalMarker) await db.setting.upsert({ where: { key: originalMarker.key }, create: { key: originalMarker.key, value: originalMarker.value as never }, update: { value: originalMarker.value as never } });
    else await db.setting.deleteMany({ where: { key: "beehiivNewsletterCategoryBackfill" } });
    if (originalSync) await db.setting.update({ where: { key: "beehiiv.sync" }, data: { value: originalSync.value as never } });
    else await db.setting.deleteMany({ where: { key: "beehiiv.sync" } });
    await db.auditLog.deleteMany({ where: { createdAt: { gte: started }, action: { startsWith: "beehiiv." } } });
    // Restore the raw row (saving merged settings would persist today's defaults).
    if (originalNlRow) await db.setting.update({ where: { key: "newsletter" }, data: { value: originalNlRow.value as never } });
    else await db.setting.deleteMany({ where: { key: "newsletter" } });
  };
  await cleanup();

  try {
    reset();
    const fetchedPosts = () => db.newsletterIssue.count({ where: { beehiivPostId: { startsWith: "post_bhtest_" } } });

    await test("missing env → no-op with a clear status, nothing written", async () => {
      delete process.env.BEEHIIV_API_KEY;
      delete process.env.BEEHIIV_PUBLICATION_ID;
      const before = await getLastSyncResult();
      const r = await syncBeehiiv({ trigger: "test" });
      assert.equal(r.status, "not_configured");
      assert.match(r.message, /BEEHIIV_API_KEY/);
      assert.equal(requests.length, 0);
      assert.equal(await fetchedPosts(), 0);
      assert.deepEqual(await getLastSyncResult(), before);
      const cron = await maybeSyncBeehiivFromCron();
      assert.deepEqual(cron, { skipped: "not configured" });
    });

    process.env.BEEHIIV_API_KEY = API_KEY;
    process.env.BEEHIIV_PUBLICATION_ID = PUB;
    process.env.BEEHIIV_API_BASE = `http://127.0.0.1:${port}/v2`;

    let first: Awaited<ReturnType<typeof syncBeehiiv>>;
    await test("first sync: pagination, auth header, query params", async () => {
      first = await syncBeehiiv({ trigger: "test" });
      assert.equal(first.status, "ok", JSON.stringify(first.errors));
      // One untagged listing of every confirmed post: 205 A + F1 D1 T1 B1 U1 E1 S1 R1 W1 M1 P1 X1 L1 = 218 → 3 pages of 100
      assert.equal(requests.length, 3);
      assert.deepEqual(requests.map((r) => r.url.searchParams.get("page")), ["1", "2", "3"]);
      for (const r of requests) {
        assert.equal(r.auth, `Bearer ${API_KEY}`);
        assert.equal(r.url.searchParams.get("status"), "confirmed");
        assert.equal(r.url.searchParams.get("limit"), "100");
        assert.deepEqual(r.url.searchParams.getAll("expand[]"), ["free_web_content", "free_email_content"]);
        assert.equal(r.url.searchParams.getAll("content_tags[]").length, 0, "no tag filter: every post is considered");
      }
    });

    await test("only confirmed + past publish_date imported; future and draft skipped", async () => {
      assert.equal(await db.newsletterIssue.count({ where: { beehiivPostId: { in: ["post_bhtest_F1", "post_bhtest_D1"] } } }), 0);
      assert.equal(first.counts.skipped, 5); // F1 (scheduled), D1 (draft), M1 (email-only), P1 (premium), X1 (no web body)
      assert.equal(isLive({ id: "x", status: "confirmed", publish_date: now + 60 }), false);
      assert.equal(isLive({ id: "x", status: "confirmed", publish_date: now - 60 }), true);
      assert.equal(isLive({ id: "x", status: "archived", publish_date: now - 60 }), false);
    });

    await test("routing: archive → issue only; public web posts → articles without a tag; email-only, gated and no-web skipped; legacy tag kept", async () => {
      assert.equal(await fetchedPosts(), 205 + 4); // A1..A205, B1, E1, S1, R1
      assert.equal(first.counts.issuesCreated, 209);
      assert.ok(await db.newsletterIssue.findUnique({ where: { beehiivPostId: "post_bhtest_B1" } }));
      assert.equal(await db.article.count({ where: { beehiivPostId: "post_bhtest_B1" } }), 0, "archive-tagged post is not duplicated into Articles");
      assert.equal(await db.newsletterIssue.count({ where: { beehiivPostId: "post_bhtest_T1" } }), 0);
      const t1 = await db.article.findUnique({ where: { beehiivPostId: "post_bhtest_T1" } });
      assert.ok(t1);
      assert.equal(t1.status, "PUBLISHED");
      assert.equal(t1.kind, "GENERAL");
      assert.equal(t1.excerpt, "Subtitle T1");
      assert.equal(t1.slug, "bhtest-t1");
      assert.ok(t1.featuredImageUrl?.startsWith("https://media.beehiiv.com/"));
      assert.ok(t1.publishedAt && Math.abs(t1.publishedAt.getTime() - (now - 3600) * 1000) < 1000);
      for (const id of ["U1", "W1"]) {
        const a = await db.article.findUnique({ where: { beehiivPostId: `post_bhtest_${id}` } });
        assert.ok(a && a.status === "PUBLISHED" && a.beehiivContentSource === "web", `${id} imported as a public web article without a tag`);
      }
      for (const id of ["M1", "P1", "X1", "F1", "D1"]) {
        assert.equal(await db.article.count({ where: { beehiivPostId: `post_bhtest_${id}` } }), 0, `${id} must not become an article`);
      }
      const l1 = await db.article.findUnique({ where: { beehiivPostId: "post_bhtest_L1" } });
      assert.ok(l1 && l1.status === "PUBLISHED", "legacy tcc-article post keeps importing");
      assert.equal(await db.article.count({ where: { beehiivPostId: { startsWith: "post_bhtest_A" } } }), 0, "issues never become articles");
      assert.equal(first.counts.articlesCreated, 4); // T1, U1, W1, L1
    });

    await test("reserved slugs are never generated (static routes win)", async () => {
      const r1 = await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_R1" } });
      assert.notEqual(r1.slug, "thanks");
      assert.ok(!RESERVED_ISSUE_SLUGS.has(r1.slug));
      assert.equal(r1.slug, "thanks-2");
    });

    await test("email-only post falls back to cleaned email HTML and is flagged", async () => {
      const e1 = await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_E1" } });
      assert.equal(e1.contentSource, "email");
      assert.ok(first.emailLayout.some((p) => p.id === "post_bhtest_E1"));
      assert.match(e1.html, /real email story text/);
      assert.match(e1.html, /media\.beehiiv\.com\/uploads\/asset\/file\/hero\.jpg/);
      assert.doesNotMatch(e1.html, /open\.gif/, "tracking pixel removed");
      assert.doesNotMatch(e1.html, /unsubscribe/i, "unsubscribe footer removed");
      assert.doesNotMatch(e1.html, /View online/i);
      assert.doesNotMatch(e1.html, /EMAIL TITLE LEAK|<script|alert\(/);
      const a1 = await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_A1" } });
      assert.equal(a1.contentSource, "web");
    });

    await test("sanitization strips scripts, handlers, unknown iframes, javascript: links; keeps beehiiv images", async () => {
      const s1 = await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_S1" } });
      assert.doesNotMatch(s1.html, /<script|onclick|onerror|steal\(|document\.cookie|evil\.example|javascript:|WEB TITLE LEAK/);
      assert.match(s1.html, /<img[^>]+src="https:\/\/media\.beehiiv\.com\/uploads\/asset\/file\/ok\.jpg"/);
      assert.match(s1.html, /youtube\.com\/embed\/abc/, "allowed iframe host kept");
      assert.match(s1.html, /<strong>county<\/strong>/);
      assert.equal(prepareBeehiivContent("", ""), null);
      assert.equal(prepareBeehiivContent("<p> </p>", "<script>x</script>"), null);
    });

    await test("re-run is idempotent (no duplicates) and picks up title changes", async () => {
      posts.get("A1")!.title = "Changed title A1";
      posts.get("T1")!.title = "Changed title T1";
      const r = await syncBeehiiv({ trigger: "test" });
      assert.equal(r.status, "ok");
      assert.equal(await fetchedPosts(), 209);
      assert.equal(await db.article.count({ where: { beehiivPostId: { startsWith: "post_bhtest_" } } }), 4); // T1, U1, W1, L1
      assert.equal(r.counts.issuesCreated, 0);
      assert.equal(r.counts.articlesCreated, 0);
      assert.equal(r.counts.issuesUpdated, 1);
      assert.equal(r.counts.articlesUpdated, 1);
      assert.equal((await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_A1" } })).title, "Changed title A1");
      const t1 = await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_T1" } });
      assert.equal(t1.title, "Changed title T1");
      assert.equal(t1.slug, "bhtest-t1", "slug stays stable");
    });

    await test("imports are filed under Newsletter (created once, reused); local articles untouched; later syncs keep manual category changes", async () => {
      const cats = await db.category.findMany({ where: { OR: [{ slug: "newsletter" }, { name: { equals: "Newsletter", mode: "insensitive" } }] } });
      assert.equal(cats.length, 1, "exactly one Newsletter category");
      for (const id of ["T1", "U1", "W1", "L1"]) {
        const a = await db.article.findUniqueOrThrow({ where: { beehiivPostId: `post_bhtest_${id}` }, include: { categories: true } });
        assert.deepEqual(a.categories.map((c) => c.name), [cats[0].name], `${id} filed under Newsletter`);
      }
      // Manual change on a beehiiv article sticks across syncs (category edits alone, without localEditedAt).
      const other = await db.category.create({ data: { name: "TEST Other", slug: "bhtest-cat-other" } });
      await db.article.update({ where: { beehiivPostId: "post_bhtest_U1" }, data: { categories: { set: [{ id: other.id }] } } });
      posts.get("U1")!.title = "U1 retitled in beehiiv";
      await syncBeehiiv({ trigger: "test" });
      const u1 = await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_U1" }, include: { categories: true } });
      assert.equal(u1.title, "U1 retitled in beehiiv");
      assert.deepEqual(u1.categories.map((c) => c.slug), ["bhtest-cat-other"], "manual category kept");
      await db.article.update({ where: { beehiivPostId: "post_bhtest_U1" }, data: { categories: { set: [{ id: cats[0].id }] } } });
      posts.get("U1")!.title = "Test post U1";
      await syncBeehiiv({ trigger: "test" });
      assert.equal((await db.category.findMany({ where: { OR: [{ slug: "newsletter" }, { name: { equals: "Newsletter", mode: "insensitive" } }] } })).length, 1, "re-runs never create a second Newsletter category");
    });

    await test("one-time backfill: earlier uncategorized imports → Newsletter; categorized and local articles untouched; never re-applied", async () => {
      const nl = await db.category.findFirstOrThrow({ where: { slug: "newsletter" } });
      const other = await db.category.findUniqueOrThrow({ where: { slug: "bhtest-cat-other" } });
      // Simulate articles imported before this change: one with no category, one an admin categorized; plus a local article.
      await db.article.update({ where: { beehiivPostId: "post_bhtest_W1" }, data: { categories: { set: [] } } });
      await db.article.update({ where: { beehiivPostId: "post_bhtest_L1" }, data: { categories: { set: [{ id: other.id }] } } });
      const local = await db.article.create({ data: { title: "TEST local article", slug: "bhtest-local-1", content: "<p>x</p>", status: "PUBLISHED", publishedAt: new Date() } });
      await db.setting.deleteMany({ where: { key: "beehiivNewsletterCategoryBackfill" } });
      const { backfillNewsletterCategory } = await import("@/lib/beehiiv/sync");
      const r1 = await backfillNewsletterCategory();
      assert.equal(r1.moved, 1);
      const cat = async (where: object) => (await db.article.findFirstOrThrow({ where, include: { categories: true } })).categories.map((c) => c.id);
      assert.deepEqual(await cat({ beehiivPostId: "post_bhtest_W1" }), [nl.id]);
      assert.deepEqual(await cat({ beehiivPostId: "post_bhtest_L1" }), [other.id], "manually categorized import untouched");
      assert.deepEqual(await cat({ id: local.id }), [], "article created on T County Connect untouched");
      // Marker: an admin removing the category later is respected.
      await db.article.update({ where: { beehiivPostId: "post_bhtest_W1" }, data: { categories: { set: [] } } });
      const r2 = await backfillNewsletterCategory();
      assert.equal(r2.skipped, true);
      assert.deepEqual(await cat({ beehiivPostId: "post_bhtest_W1" }), []);
      await db.article.update({ where: { beehiivPostId: "post_bhtest_W1" }, data: { categories: { set: [{ id: nl.id }] } } });
      await db.article.update({ where: { beehiivPostId: "post_bhtest_L1" }, data: { categories: { set: [{ id: nl.id }] } } });
    });

    await test("locally edited article is never overwritten", async () => {
      await db.article.update({ where: { beehiivPostId: "post_bhtest_T1" }, data: { title: "Edited here", localEditedAt: new Date() } });
      posts.get("T1")!.title = "beehiiv changed it again";
      const r = await syncBeehiiv({ trigger: "test" });
      assert.equal(r.counts.preservedLocalEdits, 1);
      assert.equal((await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_T1" } })).title, "Edited here");
    });

    await test("removal: issue hidden, never-edited article → DRAFT, edited article kept; returns when live again; manual hide sticks", async () => {
      await db.newsletterIssue.update({ where: { beehiivPostId: "post_bhtest_A3" }, data: { hidden: true, removedAt: null } }); // admin hid it
      posts.delete("A2");
      posts.get("B1")!.status = "archived";
      posts.get("U1")!.status = "archived";
      posts.delete("T1");
      posts.get("W1")!.content_tags = ["newsletter-archive"]; // moved to the archive → its old article is unpublished, issue created
      const r = await syncBeehiiv({ trigger: "test" });
      assert.equal(r.status, "ok");
      assert.equal(r.counts.issuesHidden, 2); // A2, B1
      assert.equal(r.counts.articlesUnpublished, 2); // U1 (no longer live), W1 (now an archive issue)
      assert.equal((await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_W1" } })).status, "DRAFT");
      assert.ok(await db.newsletterIssue.findUnique({ where: { beehiivPostId: "post_bhtest_W1" } }));
      const a2 = await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_A2" } });
      assert.equal(a2.hidden, true);
      assert.ok(a2.removedAt);
      assert.equal((await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_U1" } })).status, "DRAFT");
      assert.equal((await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_T1" } })).status, "PUBLISHED", "locally edited article untouched");
      // Back again
      posts.set("A2", post("A2", { tags: ["newsletter-archive"], publish_date: now - 86400 * 298 }));
      posts.get("B1")!.status = "confirmed";
      posts.get("U1")!.status = "confirmed";
      const r2 = await syncBeehiiv({ trigger: "test" });
      assert.equal(r2.status, "ok");
      assert.equal((await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_A2" } })).hidden, false);
      assert.equal((await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_U1" } })).status, "PUBLISHED");
      assert.equal(await db.article.count({ where: { beehiivPostId: { startsWith: "post_bhtest_" } } }), 4, "re-runs never duplicate articles (T1, U1, W1, L1)");
      assert.equal((await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_A3" } })).hidden, true, "admin hide is kept");
    });

    await test("a failed request never hides or unpublishes anything", async () => {
      failPage = 2; // the listing fails part-way through
      posts.delete("A4");
      posts.get("U1")!.status = "archived";
      const r = await syncBeehiiv({ trigger: "test" });
      failPage = null;
      posts.get("U1")!.status = "confirmed";
      assert.equal(r.status, "error");
      assert.ok(r.errors.some((e) => /HTTP 500/.test(e)));
      assert.equal(r.counts.issuesHidden, 0);
      assert.equal((await db.newsletterIssue.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_A4" } })).hidden, false);
      assert.equal((await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_U1" } })).status, "PUBLISHED");
      posts.set("A4", post("A4", { tags: ["newsletter-archive"], publish_date: now - 86400 * 296 }));
    });

    await test("bad API key → clear error, key never stored or returned", async () => {
      process.env.BEEHIIV_API_KEY = "wrong_key_also_secret";
      const r = await syncBeehiiv({ trigger: "test" });
      process.env.BEEHIIV_API_KEY = API_KEY;
      assert.equal(r.status, "error");
      assert.ok(r.errors.some((e) => /HTTP 401/.test(e) && /BEEHIIV_API_KEY/.test(e)));
      const stored = JSON.stringify((await db.setting.findMany({ where: { key: { startsWith: "beehiiv." } } })).map((s) => s.value));
      const audits = JSON.stringify(await db.auditLog.findMany({ where: { createdAt: { gte: started }, action: { startsWith: "beehiiv." } } }));
      for (const blob of [JSON.stringify(r), stored, audits]) {
        assert.ok(!blob.includes(API_KEY) && !blob.includes("wrong_key_also_secret"), "API key leaked");
      }
    });

    await test("concurrent runs: exactly one runs, the other reports locked", async () => {
      delayMs = 150;
      const [a, b] = await Promise.all([syncBeehiiv({ trigger: "test-a" }), syncBeehiiv({ trigger: "test-b" })]);
      delayMs = 0;
      const statuses = [a.status, b.status].sort();
      assert.deepEqual(statuses, ["locked", "ok"]);
      assert.equal(await fetchedPosts(), 210, "no duplicates"); // 209 + W1, moved to the archive in the removal test
      // Lock released afterwards
      const again = await syncBeehiiv({ trigger: "test" });
      assert.equal(again.status, "ok");
    });

    await test("cron runs the sync at most hourly", async () => {
      const r = await maybeSyncBeehiivFromCron();
      assert.equal((r as { skipped?: string }).skipped, "ran recently");
      const last = await getLastSyncResult();
      await db.setting.update({ where: { key: "beehiiv.sync" }, data: { value: { ...(last as object), startedAt: new Date(Date.now() - 61 * 60_000).toISOString() } as never } });
      const r2 = await maybeSyncBeehiivFromCron();
      assert.equal((r2 as { status?: string }).status, "ok");
      assert.equal((await getLastSyncResult())?.trigger, "cron");
    });

    await test("embed removed: a stored beehiiv embed URL is ignored and dropped on save", async () => {
      await db.setting.upsert({ where: { key: "newsletter" }, create: { key: "newsletter", value: { beehiivEmbedUrl: "https://embeds.beehiiv.com/00000000-0000-0000-0000-000000000000" } }, update: { value: { ...((originalNlRow?.value as object) ?? {}), beehiivEmbedUrl: "https://embeds.beehiiv.com/00000000-0000-0000-0000-000000000000" } as never } });
      assert.equal("beehiivEmbedUrl" in (await getNewsletterSettings()), false);
      await saveNewsletterSettings({ provider: "builtin" });
      const raw = (await db.setting.findUniqueOrThrow({ where: { key: "newsletter" } })).value as Record<string, unknown>;
      assert.equal("beehiivEmbedUrl" in raw, false);
    });

    await test("exports: active only for beehiiv; unsubscribes & suppressions separate (case-insensitive)", async () => {
      const mk = (tag: string, data: Record<string, unknown>) => db.newsletterSubscriber.create({ data: { email: `${SUB}${tag}@example.com`, source: "homepage", unsubscribeToken: randomToken(32), status: "ACTIVE", ...data } as never });
      await mk("active", { confirmedAt: new Date(), firstName: "Ann", communities: ["Dover"] });
      await mk("pending", { status: "PENDING" });
      await mk("unsub", { status: "UNSUBSCRIBED", confirmedAt: new Date(), unsubscribedAt: new Date() });
      await mk("supp", { confirmedAt: new Date() });
      await db.emailSuppression.create({ data: { email: `${SUB.toUpperCase()}SUPP@EXAMPLE.COM`.replace(SUB.toUpperCase(), SUB), reason: "manual" } });
      await db.emailSuppression.create({ data: { email: `${SUB}onlysupp@example.com`, reason: "bounced" } });
      const rows = (await exportLib.beehiivImportRows()).filter((r) => r.email.startsWith(SUB));
      assert.deepEqual(rows.map((r) => r.email), [`${SUB}active@example.com`]);
      const { csv } = await exportLib.beehiivImportCsv();
      assert.match(csv.split("\r\n")[0], /^email,first_name,created_at,utm_source/);
      assert.match(csv, new RegExp(`${SUB}active@example\\.com,Ann,`));
      assert.doesNotMatch(csv, new RegExp(`${SUB}(pending|unsub|supp|onlysupp)`, "i"));
      const supp = (await exportLib.suppressionRows()).filter((r) => r.email.startsWith(SUB)).map((r) => r.email).sort();
      assert.deepEqual(supp, [`${SUB}onlysupp@example.com`, `${SUB}supp@example.com`, `${SUB}unsub@example.com`].sort());
    });

    await test("beehiiv mode retires built-in sending; built-in mode unchanged", async () => {
      await saveNewsletterSettings({ provider: "beehiiv" });
      const nl = await db.newsletter.create({ data: { subject: "bhtest campaign", content: {}, status: "SCHEDULED", approvedAt: new Date(), scheduledFor: new Date(Date.now() - 60_000) } });
      const due = await send.processDueNewsletters();
      assert.equal(due.skipped, "beehiiv");
      assert.equal((await db.newsletter.findUniqueOrThrow({ where: { id: nl.id } })).status, "SCHEDULED", "stays stored, not sent");
      const r = await send.startCampaign(nl.id);
      assert.equal(r.ok, false);
      assert.match((r as { error: string }).error, /beehiiv/);
      await saveNewsletterSettings({ provider: "builtin" });
      const due2 = await send.processDueNewsletters();
      assert.equal(due2.skipped, undefined);
    });

    await test("designer issues: the website gets a clean web version from the saved design (not the email tables)", async () => {
      const { defaultContent } = await import("@/lib/newsletter-designer/types");
      const content = defaultContent();
      const f = content.sections.find((x) => x.type === "featured") as { story: unknown };
      f.story = { id: "s1", articleId: null, title: "Changed title Z1", description: '<p>Eight people escaped. Give via <a href="https://venmo.com/u/Dover-Fire">Venmo</a>.</p><ul><li>Youth medium</li></ul>', imageUrl: "https://media.beehiiv.com/uploads/asset/file/fire.jpg", url: "/articles/bhtest-z1/" };
      const joke = content.sections.find((x) => x.type === "joke") as { setup: string; punchline: string };
      joke.setup = "Why did the scarecrow win?"; joke.punchline = "He was outstanding in his field.";
      posts.set("Z1", post("Z1", { tags: [], title: "Changed title Z1", web: '<div><table role="presentation" width="600"><tr><td style="padding:0 24px;background:#0B2340;border-radius:12px"><p>EMAIL LAYOUT</p></td></tr></table></div>' }));
      const d = await db.newsletterDesign.create({ data: { title: "Changed title Z1", issueDate: new Date("2026-11-23T12:00:00Z"), content: content as never, beehiivStatus: "created", beehiivPostId: "post_bhtest_Z1", beehiivSentAt: new Date() } });
      try {
        await syncBeehiiv({ trigger: "test" });
        const a = await db.article.findUniqueOrThrow({ where: { beehiivPostId: "post_bhtest_Z1" } });
        assert.ok(!/<table|EMAIL LAYOUT|style=|\{\{/.test(a.content), "no email layout: " + a.content.slice(0, 200));
        assert.match(a.content, /<h2 class="nl-label">Top Story<\/h2>/);
        assert.match(a.content, /<section id="nl-[^"]+" class="nl-section nl-joke">/);
        assert.match(a.content, /<a href="https:\/\/venmo\.com\/u\/Dover-Fire">Venmo<\/a>/);
        assert.match(a.content, /<ul><li>Youth medium<\/li><\/ul>/);
        assert.ok(!a.content.includes("fire.jpg"), "featured picture not repeated under the page's hero image");
        assert.equal(a.featuredImageUrl, posts.get("Z1")!.thumbnail_url);
        assert.match(a.content, /Why did the scarecrow win\?/);
        assert.ok(!a.content.includes("/articles/bhtest-z1/"), "no Read More link back to this same page");
        assert.ok(!/<h3[^>]*>[^<]*(<a[^>]*>)?Changed title Z1/.test(a.content), "headline not repeated under the page title");
        assert.ok(!/SPONSOR|Read it online/i.test(a.content), "email-only parts left out");
        assert.equal(a.beehiivContentSource, "web");
        const again = await syncBeehiiv({ trigger: "test" });
        assert.equal(again.counts.articlesUpdated, 0, "stable on re-run");
      } finally {
        await db.newsletterDesign.delete({ where: { id: d.id } });
        posts.delete("Z1");
      }
    });

    await test("default newsletter copy (no separate brand) and theName helper", async () => {
      const { newsletterCopy, theName } = await import("@/lib/newsletter/copy");
      const d = newsletterCopy();
      assert.equal(d.name, "T County Connect");
      assert.equal(d.navLabel, "Newsletter");
      assert.equal(d.heading, "Get T County Connect in your inbox");
      assert.equal(d.button, "Sign me up");
      assert.equal(d.tagline, "Local stories, weekend plans, and what's new across Tuscarawas County.");
      assert.equal(theName("T County Connect"), "the T County Connect newsletter");
      assert.equal(theName("Dover Weekly Newsletter"), "the Dover Weekly Newsletter");
      assert.match(d.frequencyNote, /^The T County Connect newsletter arrives/);
      assert.match(d.registerOptInLabel, /^Send me the T County Connect newsletter/);
      assert.equal((await getNewsletterSettings()).name, originalNl.name);
    });
  } finally {
    await cleanup();
    server.close();
    await db.$disconnect();
  }
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `All ${results.length} beehiiv tests passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

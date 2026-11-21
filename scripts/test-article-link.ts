/**
 * Admin → Newsletter → Article link + scheduled-ahead imports (no network: a local mock beehiiv v2 API).
 *
 *   DATABASE_URL=… npx tsx --conditions=react-server scripts/test-article-link.ts
 *
 * Covers: slug parsing; lookup of draft / scheduled / published posts; held URL (placeholder) at the importer's exact
 * slug; sync fills the SAME article (no duplicates) and imports scheduled posts hidden until their send time; going
 * live at send time without a sync; conflicts (published, draft, deleted article; legacy path) never return a -2 URL;
 * renamed beehiiv slug keeps the held URL; unscheduled → hidden but still held; email-only / premium / archive tag;
 * locally edited articles; idempotent hold; Bring in now.
 * Uses ids post_altest_* and slugs altest-*; removes everything it creates.
 */
import http from "node:http";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.APP_URL ||= "https://tcountyconnect.com";
process.env.BEEHIIV_API_KEY = "bh_altest_key";
process.env.BEEHIIV_PUBLICATION_ID = "pub_altest";

const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); }
}

type P = Record<string, unknown> & { id: string; slug: string; oldSlugs?: string[]; status: string; publish_date: number | null };
const posts = new Map<string, P>();
const sec = () => Math.floor(Date.now() / 1000);
const mk = (id: string, o: Partial<P> = {}): P => ({
  id: `post_altest_${id}`, title: `Altest ${id}`, slug: `altest-${id}`, status: "draft", publish_date: null, platform: "both", audience: "free",
  content_tags: [], thumbnail_url: null, web_url: null, subtitle: null,
  content: { free: { web: `<p>Web story ${id} with enough words to be the body.</p>`, email: `<p>Email ${id}</p>` } }, ...o,
});
const put = (p: P) => posts.set(p.id, p);

const server = http.createServer((req, res) => {
  const u = new URL(req.url ?? "/", "http://x");
  const send = (s: number, b: unknown) => res.writeHead(s, { "Content-Type": "application/json" }).end(JSON.stringify(b));
  if (req.headers.authorization !== "Bearer bh_altest_key") return send(401, {});
  const one = u.pathname.match(/^\/v2\/publications\/pub_altest\/posts\/([^/]+)$/);
  if (one) { const p = posts.get(decodeURIComponent(one[1])); return p ? send(200, { data: strip(p) }) : send(404, { errors: [] }); }
  if (u.pathname !== "/v2/publications/pub_altest/posts") return send(404, {});
  const slugs = u.searchParams.getAll("slugs[]");
  const status = u.searchParams.get("status") ?? "all";
  let list = [...posts.values()];
  if (slugs.length) list = list.filter((p) => slugs.includes(p.slug) || (p.oldSlugs ?? []).some((s) => slugs.includes(s)));
  if (status !== "all") list = list.filter((p) => p.status === status);
  send(200, { data: list.map(strip), page: 1, total_pages: 1, total_results: list.length, limit: 100 });
});
const strip = (p: P) => { const { oldSlugs: _o, ...rest } = p; void _o; return rest; };

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.BEEHIIV_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v2`;
  const { db } = await import("@/lib/db");
  const { publishedArticleWhere } = await import("@/lib/queries");
  const link = await import("@/lib/beehiiv/article-link");
  const { syncBeehiiv } = await import("@/lib/beehiiv/sync");

  const cleanup = async () => {
    await db.article.deleteMany({ where: { OR: [{ beehiivPostId: { startsWith: "post_altest_" } }, { slug: { startsWith: "altest-" } }] } });
  };
  await cleanup();
  const byPost = (id: string) => db.article.findMany({ where: { beehiivPostId: `post_altest_${id}` } });
  const isPublic = async (slug: string) => !!(await db.article.findFirst({ where: publishedArticleWhere({ slug }) }));
  const URL_OF = (slug: string) => `https://tcountyconnect.com/articles/${slug}/`;

  try {
    await test("parseSlugInput: slug, beehiiv URL, rejects junk", async () => {
      assert.equal(link.parseSlugInput(" meet-colt-liggett-the-man-behind-c3-excavation "), "meet-colt-liggett-the-man-behind-c3-excavation");
      assert.equal(link.parseSlugInput("https://tcountyconnect.beehiiv.com/p/meet-colt-liggett-the-man-behind-c3-excavation"), "meet-colt-liggett-the-man-behind-c3-excavation");
      assert.equal(link.parseSlugInput("../../etc"), null);
      assert.equal(link.parseSlugInput("<script>"), null);
    });

    put(mk("colt"));
    await test("draft post: URL free → available (no link until held)", async () => {
      const r = await link.checkArticleLink("altest-colt");
      assert.equal(r.kind, "available");
      if (r.kind !== "available") return;
      assert.equal(r.url, URL_OF("altest-colt"));
      assert.equal(r.post.timing, "draft");
      assert.equal((await byPost("colt")).length, 0, "check is read-only");
    });
    await test("hold a draft: hidden placeholder at the exact slug, linked to the post; state held", async () => {
      const h = await link.holdArticleUrl("post_altest_colt", null);
      assert.ok(h.ok && h.created);
      const rows = await byPost("colt");
      assert.equal(rows.length, 1); assert.equal(rows[0].slug, "altest-colt"); assert.equal(rows[0].status, "DRAFT");
      assert.equal(await isPublic("altest-colt"), false);
      const r = await link.checkArticleLink("altest-colt");
      assert.equal(r.kind, "linked"); if (r.kind !== "linked") return;
      assert.equal(r.state, "held"); assert.equal(r.article.url, URL_OF("altest-colt"));
    });
    await test("hold again is idempotent (same article, no duplicate)", async () => {
      const before = (await byPost("colt"))[0].id;
      const h = await link.holdArticleUrl("post_altest_colt", null);
      assert.ok(h.ok && !h.created && h.articleId === before);
      assert.equal((await byPost("colt")).length, 1);
    });
    await test("sync ignores beehiiv drafts and never demotes the held placeholder", async () => {
      const s = await syncBeehiiv({ trigger: "test" });
      assert.equal(s.status, "ok", s.errors.join("; "));
      const [a] = await byPost("colt");
      assert.equal(a.status, "DRAFT"); assert.equal(a.slug, "altest-colt");
    });

    const sendAt = sec() + 3;
    await test("post scheduled in beehiiv → sync fills the SAME article, hidden until send time; state ready", async () => {
      put({ ...posts.get("post_altest_colt")!, status: "confirmed", publish_date: sendAt, title: "Meet Colt" });
      assert.equal((await link.checkArticleLink("altest-colt")).kind === "linked" && (await link.checkArticleLink("altest-colt") as { state: string }).state, "needs_import");
      const held = (await byPost("colt"))[0].id;
      const s = await syncBeehiiv({ trigger: "test" });
      assert.equal(s.counts.articlesScheduled, 1);
      const rows = await byPost("colt");
      assert.equal(rows.length, 1, "no duplicate"); assert.equal(rows[0].id, held); assert.equal(rows[0].slug, "altest-colt");
      assert.equal(rows[0].status, "PUBLISHED"); assert.equal(rows[0].title, "Meet Colt");
      assert.equal(rows[0].publishedAt!.getTime(), sendAt * 1000);
      assert.equal(await isPublic("altest-colt"), false, "hidden before send time");
      const r = await link.checkArticleLink("altest-colt");
      assert.ok(r.kind === "linked" && r.state === "ready", JSON.stringify(r).slice(0, 200));
    });
    await test("goes live at send time with no further sync", async () => {
      await new Promise((r) => setTimeout(r, Math.max(0, sendAt * 1000 - Date.now()) + 1200));
      assert.equal(await isPublic("altest-colt"), true);
      const r = await link.checkArticleLink("altest-colt");
      assert.ok(r.kind === "linked" && r.state === "live");
    });
    await test("re-sync after sending: same article, still one row, same URL", async () => {
      await syncBeehiiv({ trigger: "test" });
      const rows = await byPost("colt");
      assert.equal(rows.length, 1); assert.equal(rows[0].slug, "altest-colt");
    });
    await test("beehiiv slug renamed later: site keeps the held URL and says so", async () => {
      put({ ...posts.get("post_altest_colt")!, slug: "altest-colt-renamed", oldSlugs: ["altest-colt"] });
      for (const q of ["altest-colt", "altest-colt-renamed"]) {
        const r = await link.checkArticleLink(q);
        assert.equal(r.kind, "linked"); if (r.kind !== "linked") return;
        assert.equal(r.article.url, URL_OF("altest-colt"));
        assert.match(r.slugNote ?? "", /keeps \/articles\/altest-colt\//);
      }
      await syncBeehiiv({ trigger: "test" });
      assert.equal((await byPost("colt"))[0].slug, "altest-colt");
    });

    await test("conflicts never return a URL or create a -2 article (published, draft, deleted, legacy path)", async () => {
      await db.article.create({ data: { slug: "altest-pub", title: "Other published", content: "", status: "PUBLISHED", publishedAt: new Date() } });
      await db.article.create({ data: { slug: "altest-drf", title: "Other draft", content: "", status: "DRAFT" } });
      await db.article.create({ data: { slug: "altest-del", title: "Other deleted", content: "", status: "DRAFT", deletedAt: new Date() } });
      await db.article.create({ data: { slug: "altest-legacy-holder", legacyPath: "/articles/altest-leg/", title: "Legacy", content: "", status: "PUBLISHED", publishedAt: new Date() } });
      for (const s of ["pub", "drf", "del", "leg"]) {
        put(mk(s, { slug: `altest-${s}` }));
        const r = await link.checkArticleLink(`altest-${s}`);
        assert.equal(r.kind, "conflict", s);
        const h = await link.holdArticleUrl(`post_altest_${s}`, null);
        assert.equal(h.ok, false, s);
        assert.equal((await byPost(s)).length, 0, `${s}: nothing created`);
      }
      assert.equal(await db.article.count({ where: { slug: { startsWith: "altest-pub-" } } }), 0);
      const r = await link.checkArticleLink("altest-del");
      assert.ok(r.kind === "conflict" && /deleted article/.test(r.message));
    });

    await test("email-only, premium and newsletter-archive posts get no article URL; scheduled archive issue not imported early", async () => {
      put(mk("email", { platform: "email" })); put(mk("prem", { audience: "premium" }));
      put(mk("arch", { content_tags: ["newsletter-archive"], status: "confirmed", publish_date: sec() + 3600 }));
      for (const s of ["email", "prem", "arch"]) {
        const r = await link.checkArticleLink(`altest-${s}`);
        assert.equal(r.kind, "not_article", s);
        assert.equal((await link.holdArticleUrl(`post_altest_${s}`, null)).ok, false);
      }
      await syncBeehiiv({ trigger: "test" });
      assert.equal(await db.newsletterIssue.count({ where: { beehiivPostId: "post_altest_arch" } }), 0);
    });

    await test("scheduled post never held: sync imports it hidden at its own slug", async () => {
      put(mk("auto", { status: "confirmed", publish_date: sec() + 3600 }));
      await syncBeehiiv({ trigger: "test" });
      const rows = await byPost("auto");
      assert.equal(rows.length, 1); assert.equal(rows[0].slug, "altest-auto"); assert.equal(await isPublic("altest-auto"), false);
    });
    await test("unscheduled back to draft: article hidden again but URL stays held for the post", async () => {
      put({ ...posts.get("post_altest_auto")!, status: "draft", publish_date: null });
      await syncBeehiiv({ trigger: "test" });
      const [a] = await byPost("auto");
      assert.equal(a.status, "DRAFT");
      const r = await link.checkArticleLink("altest-auto");
      assert.ok(r.kind === "linked" && r.state === "held" && r.article.url === URL_OF("altest-auto"));
    });
    await test("scheduled + held: hold imports immediately (no sync), hidden until send", async () => {
      put(mk("now", { status: "confirmed", publish_date: sec() + 7200 }));
      const h = await link.holdArticleUrl("post_altest_now", null);
      assert.ok(h.ok);
      const [a] = await byPost("now");
      assert.equal(a.status, "PUBLISHED"); assert.equal(a.slug, "altest-now"); assert.equal(await isPublic("altest-now"), false);
      assert.ok((await link.checkArticleLink("altest-now") as { state?: string }).state === "ready");
    });
    await test("Bring in now: placeholder for a now-scheduled post becomes the scheduled article; reschedule updates go-live", async () => {
      put(mk("bring"));
      assert.ok((await link.holdArticleUrl("post_altest_bring", null)).ok);
      put({ ...posts.get("post_altest_bring")!, status: "confirmed", publish_date: sec() + 5000 });
      assert.ok((await link.bringInPostNow("post_altest_bring", null)).ok);
      let [a] = await byPost("bring");
      assert.equal(a.status, "PUBLISHED"); assert.equal(a.publishedAt!.getTime(), (posts.get("post_altest_bring")!.publish_date as number) * 1000);
      const later = sec() + 9000;
      put({ ...posts.get("post_altest_bring")!, publish_date: later });
      const r = await link.checkArticleLink("altest-bring");
      assert.ok(r.kind === "linked" && r.state === "needs_import");
      assert.ok((await link.bringInPostNow("post_altest_bring", null)).ok);
      [a] = await byPost("bring");
      assert.equal(a.publishedAt!.getTime(), later * 1000);
      assert.equal((await byPost("bring")).length, 1);
    });
    await test("locally edited unpublished article: warns it won't go live automatically", async () => {
      put(mk("edit"));
      assert.ok((await link.holdArticleUrl("post_altest_edit", null)).ok);
      await db.article.updateMany({ where: { beehiivPostId: "post_altest_edit" }, data: { localEditedAt: new Date() } });
      put({ ...posts.get("post_altest_edit")!, status: "confirmed", publish_date: sec() + 3600 });
      const r = await link.checkArticleLink("altest-edit");
      assert.ok(r.kind === "linked" && r.state === "attention" && /will NOT go live automatically/.test(r.message));
    });
    await test("unknown slug → not_found; API failure → error (nothing changed)", async () => {
      assert.equal((await link.checkArticleLink("altest-nope")).kind, "not_found");
      const saved = process.env.BEEHIIV_API_KEY;
      process.env.BEEHIIV_API_KEY = "wrong";
      const r = await link.checkArticleLink("altest-colt");
      process.env.BEEHIIV_API_KEY = saved;
      assert.equal(r.kind, "error");
    });
  } finally {
    await cleanup();
    await db.setting.deleteMany({ where: { key: "beehiiv.sync" } });
    server.close();
  }
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Newsletter designer — renderer, sanitizer and beehiiv draft blocks (no network).
 *
 *   npx tsx --conditions=react-server scripts/test-newsletter-designer.ts
 *
 * Covers: intro sanitizer (allowlist, links, scripts/attributes removed); text escaping everywhere; unsafe URLs
 * dropped; disabled/empty sections skipped; section order; no <style>/<link>/<script> in any output; events only
 * from what was entered; sponsor slot and weather as separate beehiiv blocks (RSS block on the weather feed, or a
 * snapshot image); draft-only body (status "draft", no scheduling keys).
 */
import assert from "node:assert/strict";

process.env.APP_URL ||= "https://tcountyconnect.com";
const results: string[] = [];
let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); }
}

async function main() {
  const r = await import("@/lib/newsletter-designer/render");
  const t = await import("@/lib/newsletter-designer/types");
  const { beehiivBlocks } = await import("@/lib/newsletter-designer/server");
  const { buildDraftPostBody, assertDraftOnly } = await import("@/lib/beehiiv/posts-api");

  const ctx: import("@/lib/newsletter-designer/render").RenderContext = {
    siteUrl: "https://tcountyconnect.com", logoUrl: "https://tcountyconnect.com/brand/logo-sm.png?v=1",
    weather: { imageUrl: "https://tcountyconnect.com/weather/forecast/abc123def456.png", alt: "3-Day Forecast", linkUrl: "https://forecast.weather.gov/x" },
    socials: [{ label: "Facebook", url: "https://facebook.com/tcountyconnect" }],
  };
  const content = t.defaultContent();
  const sec = <T extends import("@/lib/newsletter-designer/types").SectionType>(type: T) => content.sections.find((s) => s.type === type) as Extract<import("@/lib/newsletter-designer/types").Section, { type: T }>;
  sec("intro").html = `<div>Hello <b>neighbors</b> &amp; friends</div><p>See <a href="https://tcountyconnect.com/events/" onclick="x()">events</a> <a href="javascript:alert(1)">bad</a></p><script>alert(1)</script><img src=x onerror=alert(1)>`;
  sec("featured").story = { id: "f1", articleId: "a1", title: "Main <Story> & More", description: "Line one\nLine two", imageUrl: "/media/hero.jpg", url: "/articles/main/" };
  sec("events").items = [
    { id: "e1", title: "Craft Fair", date: "2026-12-05", time: "9 AM–3 PM", location: "Dover", description: "", imageUrl: "", url: "https://example.com/fair" },
    { id: "e2", title: "Tree Lighting", date: "2026-12-01", time: "6 PM", location: "New Philadelphia", description: "Bring cocoa", imageUrl: "javascript:bad", url: "" },
  ];
  sec("articles").items = [{ id: "s1", title: "Second story", description: "Desc", imageUrl: "", url: "https://tcountyconnect.com/articles/two/" }, { id: "s2", title: "", description: "", imageUrl: "", url: "" }];
  sec("spotlight").business = { businessId: "b1", name: "Joe's Diner", imageUrl: "https://tcountyconnect.com/media/joe.jpg", text: "Great pie", url: "https://tcountyconnect.com/business/joes-diner/" };
  const meta = { title: "Issue 4", previewText: "Preview <text>", issueNumber: 4, issueDate: "2026-11-23", content };

  test("intro sanitizer: keeps p/strong/links, drops scripts, attributes, unsafe links and images", () => {
    const s = r.sanitizeIntroHtml(sec("intro").html);
    assert.ok(s.includes("<p>Hello <strong>neighbors</strong> &amp; friends</p>"), s);
    assert.ok(s.includes('<a href="https://tcountyconnect.com/events/">events</a>'));
    assert.ok(!/onclick|javascript:|<script|alert\(1\)<\/script>|<img|onerror/i.test(s), s);
    assert.equal(r.sanitizeIntroHtml("a < b > c"), "a &lt; b &gt; c");
  });
  const doc = r.renderEmailDocument(meta, ctx);
  test("document: masthead, escaping, absolute URLs, no style/link/script tags", () => {
    assert.match(doc, /Issue #004/); assert.match(doc, /Monday, November 23, 2026/);
    assert.ok(doc.includes("Main &lt;Story&gt; &amp; More") && !doc.includes("<Story>"));
    assert.ok(doc.includes('src="https://tcountyconnect.com/media/hero.jpg"') && doc.includes('href="https://tcountyconnect.com/articles/main/"'));
    assert.ok(doc.includes("Line one<br>Line two"));
    assert.ok(!/<style|<link|<script|javascript:/i.test(doc));
    assert.ok(!doc.includes("Preview <text>"), "preview text escaped");
  });
  test("events: only what was entered, in the entered order; date badges; unsafe image dropped", () => {
    const a = doc.indexOf("Craft Fair"), b = doc.indexOf("Tree Lighting");
    assert.ok(a > 0 && b > a, "keeps manual order");
    assert.match(doc, />DEC<\/div>[\s\S]*?>5<\/div>/);
    assert.ok(doc.includes("Sat, Dec 5") && doc.includes("Tue, Dec 1"));
  });
  test("empty items and disabled sections are skipped; section order follows the editor", () => {
    assert.equal((doc.match(/Read more &rarr;/g) ?? []).length, 1, "the untitled story is skipped");
    const c2 = structuredClone(content);
    c2.sections = c2.sections.map((s) => (s.type === "spotlight" ? { ...s, enabled: false } : s));
    assert.ok(!r.renderEmailDocument({ ...meta, content: c2 }, ctx).includes("Joe&#39;s Diner"));
    const c3 = structuredClone(content);
    const wi = c3.sections.findIndex((s) => s.type === "weather");
    const [w] = c3.sections.splice(wi, 1); c3.sections.unshift(w);
    const d3 = r.renderEmailDocument({ ...meta, content: c3 }, ctx);
    assert.ok(d3.indexOf("Your 3-Day Forecast") < d3.indexOf("Hello"));
  });
  test("preview notes appear only in preview mode", () => {
    assert.ok(!doc.includes("beehiiv adds its required footer"));
    assert.ok(r.renderEmailDocument(meta, { ...ctx, preview: true }).includes("beehiiv adds its required footer"));
  });
  test("warnings flag empty sections and missing links/dates", () => {
    const w = r.designWarnings({ ...meta, content: t.defaultContent() }, { ...ctx, weather: null });
    assert.ok(w.some((x) => x.startsWith("Featured article")) && w.some((x) => x.startsWith("Upcoming events")) && w.some((x) => x.includes("weather")));
  });
  test("beehiiv blocks: html runs, sponsor paragraph and weather RSS block in editor order", () => {
    const blocks = beehiivBlocks(meta, ctx, "rss") as Record<string, unknown>[];
    const kinds = blocks.map((b) => b.type);
    const sp = kinds.indexOf("paragraph"), rss = kinds.indexOf("rss");
    assert.ok(sp > 0 && rss > sp, kinds.join(","));
    const rssBlock = blocks[rss];
    assert.equal(rssBlock.rssFeedUrl, "https://tcountyconnect.com/weather/rss/");
    assert.equal(rssBlock.articlesToShow, 1); assert.equal(rssBlock.showArticleThumbnail, true); assert.equal(rssBlock.showArticleTitle, false);
    assert.ok(blocks.filter((b) => b.type === "html").every((b) => !/<style|<link|<script/i.test(String(b.html))));
    const snap = beehiivBlocks(meta, ctx, "snapshot") as Record<string, unknown>[];
    assert.ok(!snap.some((b) => b.type === "rss") && snap.some((b) => String(b.html ?? "").includes("/weather/forecast/abc123def456.png")));
  });
  test("draft body is draft-only", () => {
    const body = buildDraftPostBody({ title: meta.title, subtitle: meta.previewText, blocks: beehiivBlocks(meta, ctx, "rss") as never, contentTags: ["newsletter-archive"] });
    (assertDraftOnly as (b: unknown) => void)(body);
    assert.equal(body.status, "draft");
    assert.ok(!("scheduled_at" in body) && !("body_content" in body));
  });
  const { designInput } = await import("@/lib/newsletter-designer/server");
  test("save validation accepts a fresh template (empty preview text) and rejects unsafe values", () => {
    assert.ok(designInput.safeParse({ title: "x", previewText: null, issueNumber: null, issueDate: "2026-11-23", content: t.defaultContent() }).success);
    const c = t.defaultContent();
    (c.sections[1] as { story: unknown }).story = { id: "abc", title: "<b>T</b>", description: "", imageUrl: "javascript:alert(1)", url: "data:text/html,x" };
    const r2 = designInput.safeParse({ title: "x", previewText: "", issueNumber: 1, issueDate: "2026-11-23", content: c });
    assert.ok(r2.success);
    const st = (r2.data.content.sections[1] as { story: { title: string; imageUrl: string; url: string } }).story;
    assert.equal(st.imageUrl, ""); assert.equal(st.url, ""); assert.ok(!st.title.includes("<"));
    assert.ok(!designInput.safeParse({ title: "x", previewText: "", issueNumber: 1, issueDate: "not-a-date", content: t.defaultContent() }).success);
  });
  test("no content limits: long text and many items are kept in full", () => {
    const long = "Word ".repeat(4000).trim(); // ~20,000 characters
    const c = t.defaultContent();
    const arts = c.sections.find((x) => x.type === "articles") as { items: unknown[] };
    arts.items = Array.from({ length: 150 }, (_, i) => ({ id: `a${i}`, articleId: null, title: `Story ${i} ${"long title ".repeat(30)}`, description: long, imageUrl: "", url: "https://tcountyconnect.com/" }));
    const r3 = designInput.safeParse({ title: "T".repeat(500), previewText: "P".repeat(900), issueNumber: 1, issueDate: "2026-11-23", content: c });
    assert.ok(r3.success, r3.success ? "" : JSON.stringify(r3.error.issues[0]));
    const items = (r3.data.content.sections.find((x) => x.type === "articles") as { items: { description: string; title: string }[] }).items;
    assert.equal(items.length, 150); assert.equal(items[0].description, long); assert.ok(items[0].title.length > 300);
    assert.equal(r3.data.title.length, 500); assert.equal(r3.data.previewText.length, 900);
  });
  test("rich text in stories, events, spotlight, promo: lists and headings kept safely; plain text still works", () => {
    const c = t.defaultContent();
    const f = c.sections.find((x) => x.type === "featured") as { story: unknown };
    f.story = { id: "x1", articleId: null, title: "Rich", description: "<h2>Sub head</h2><p>Para <a href=\"https://x.org\" onclick=\"y()\">link</a></p><ul><li>One</li><li>Two</li></ul><script>bad()</script>", imageUrl: "", url: "https://tcountyconnect.com/a/" };
    const d = r.renderEmailDocument({ ...meta, content: c }, ctx);
    assert.ok(d.includes("<strong style=\"font-weight:700;\">Sub head</strong>"));
    assert.ok(/<ul style="[^"]*"><li style="[^"]*">One<\/li>/.test(d));
    assert.ok(!/onclick|<script|bad\(\)/.test(d));
    assert.equal(r.toEditorHtml("Line A\nLine B\n\nPara 2"), "<p>Line A<br>Line B</p><p>Para 2</p>");
    assert.equal(r.toEditorHtml("<p>x</p>"), "<p>x</p>");
  });
  test("custom sections: any number, heading/title/text/image/button, in editor order", () => {
    const c = t.defaultContent();
    const a = t.newSection("custom") as Extract<import("@/lib/newsletter-designer/types").Section, { type: "custom" }>;
    Object.assign(a, { heading: "Community News", title: "Library Hours Change", html: "<p>New <strong>winter</strong> hours.</p>", imageUrl: "https://tcountyconnect.com/media/lib.jpg", ctaLabel: "See hours", ctaUrl: "https://example.org/hours" });
    const b2 = t.newSection("custom") as Extract<import("@/lib/newsletter-designer/types").Section, { type: "custom" }>;
    Object.assign(b2, { title: "Second custom", html: "Plain text\nwith a break" });
    c.sections.unshift(a); c.sections.push(b2, t.newSection("featured"), t.newSection("sponsor"));
    const d = r.renderEmailDocument({ ...meta, content: c }, ctx);
    assert.ok(d.includes("Community News") && d.includes("Library Hours Change") && d.includes("<strong style=\"font-weight:700;\">winter</strong>"));
    assert.ok(d.includes("https://example.org/hours") && d.includes("See hours &rarr;"));
    assert.ok(d.indexOf("Issue #004") < d.indexOf("Library Hours Change") && d.indexOf("Library Hours Change") < d.indexOf("Hi neighbors"), "masthead, then the custom section moved to the top, then the intro");
    assert.ok(d.includes("Plain text<br>with a break"));
    const blocks = beehiivBlocks({ ...meta, content: c }, ctx, "rss") as Record<string, unknown>[];
    assert.equal(blocks.filter((x) => x.type === "paragraph").length, 2, "two sponsor slots");
    const saved = designInput.safeParse({ title: "x", previewText: "", issueNumber: 1, issueDate: "2026-11-23", content: c });
    assert.ok(saved.success, saved.success ? "" : JSON.stringify(saved.error.issues[0]));
  });
  test("Gmail clipping warning for very large issues (nothing is cut)", () => {
    const c = t.defaultContent();
    (c.sections.find((x) => x.type === "intro") as { html: string }).html = `<p>${"Long letter. ".repeat(9000)}</p>`;
    const w = r.designWarnings({ ...meta, content: c }, ctx);
    assert.ok(w.some((x) => /Gmail clips emails over about 102 KB/.test(x)));
    assert.ok(r.renderEmailDocument({ ...meta, content: c }, ctx).length > 100_000, "content not truncated");
  });
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

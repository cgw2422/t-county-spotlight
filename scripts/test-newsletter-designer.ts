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
  try { fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).message.split("\n").slice(0, 12).join(" | ")} @ ${(e as Error).stack?.split("\n").find((l) => l.includes("test-newsletter-designer"))}`); }
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
    assert.ok(doc.includes("Line one<br>Line two"), "story text shown in full as written, line breaks kept");
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
    const sp = blocks.findIndex((b) => JSON.stringify(b).includes("SPONSOR")), rss = kinds.indexOf("rss");
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
    (c.sections.find((x) => x.type === "featured") as { story: unknown }).story = { id: "abc", title: "<b>T</b>", description: "", imageUrl: "javascript:alert(1)", url: "data:text/html,x" };
    const r2 = designInput.safeParse({ title: "x", previewText: "", issueNumber: 1, issueDate: "2026-11-23", content: c });
    assert.ok(r2.success);
    const st = (r2.data.content.sections.find((x) => x.type === "featured") as { story: { title: string; imageUrl: string; url: string } }).story;
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
    // Story text is shown in full as plain paragraphs (formatting from older drafts removed, text kept)…
    assert.ok(d.includes("Sub head") && d.includes("Para link") && !d.includes("<strong style=\"font-weight:700;\">Sub head"));
    assert.ok(!/onclick|<script|bad\(\)/.test(d));
    // …while events, spotlight and custom text keep their formatting.
    const ev = c.sections.find((x) => x.type === "events") as { items: unknown[] };
    ev.items = [{ id: "e9", title: "Fair", date: "2026-12-05", time: "", location: "", description: "<ul><li>One</li><li>Two</li></ul>", imageUrl: "", url: "" }];
    assert.ok(/<ul style="[^"]*"><li style="[^"]*">One<\/li>/.test(r.renderEmailDocument({ ...meta, content: c }, ctx)));
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
    assert.equal(blocks.filter((x) => JSON.stringify(x).includes("SPONSOR")).length, 2, "two sponsor slots");
    const saved = designInput.safeParse({ title: "x", previewText: "", issueNumber: 1, issueDate: "2026-11-23", content: c });
    assert.ok(saved.success, saved.success ? "" : JSON.stringify(saved.error.issues[0]));
  });
  test("your story text appears in full with paragraphs (no shortening)", () => {
    const c = structuredClone(content);
    const long = "As the winter light fades, a quiet glow will fill one of Ohio's most storied historic sites. New Philadelphia residents are invited to a free candlelight service at 2 p.m. Bring a friend. Dress warmly.\n\nMark your calendars for 2 p.m. and join neighbors at Schoenbrunn Village for this special free event. It's a lovely way to spend an afternoon and connect with the community.";
    (c.sections.find((x) => x.type === "articles") as { items: { description: string }[] }).items[0].description = long;
    const d = r.renderEmailDocument({ ...meta, content: c }, ctx);
    assert.ok(d.includes("Dress warmly.") && d.includes("connect with the community."), "every sentence kept");
    assert.ok(/Dress warmly\.<\/p><p style="margin:12px 0 0;[^"]*">Mark your calendars/.test(d), "blank line → new paragraph");
  });
  test("auto excerpts for picked articles: 2–3 clean sentences, generated from long text", () => {
    assert.equal(r.excerpt("One. Two! Three? Four. Five."), "One. Two! Three?");
    assert.equal(r.excerpt("<h2>The story</h2><p>A new bakery opened. It sells bread. Owners are local. More later.</p>"), "A new bakery opened. It sells bread. Owners are local.", "headings never leak into excerpts");
    assert.equal(r.excerpt("<p>Hello <b>there</b>.</p><p>Second &amp; last.</p>"), "Hello there. Second & last.");
    const long = r.excerpt("word ".repeat(300));
    assert.ok(long.length <= 361 && long.endsWith("…"));
    const many = r.excerpt("This is a sentence of moderate length here. ".repeat(20));
    assert.ok(many.length <= 360 && (many.match(/\./g) ?? []).length <= 3);
  });
  test("Read Online: first, above the logo; {{live_url}} in exported HTML; inert in preview; email-only native paragraph in beehiiv", () => {
    const d = r.renderEmailDocument(meta, ctx);
    const i = d.indexOf("Having trouble viewing this email?");
    assert.ok(i > 0 && i < d.indexOf("brand/logo-sm.png"));
    assert.ok(d.includes('href="{{live_url}}"'));
    assert.ok(r.renderEmailDocument(meta, { ...ctx, preview: true }).includes('href="#"'));
    const first = (beehiivBlocks(meta, ctx, "rss") as Record<string, unknown>[])[0] as { type: string; formattedText: { text: string; link?: { href: string } }[]; visibility_settings: Record<string, boolean> };
    assert.equal(first.type, "paragraph");
    assert.equal(first.formattedText[1].text, "Read it online"); assert.equal(first.formattedText[1].link?.href, "{{live_url}}");
    assert.deepEqual(first.visibility_settings, { show_on_web: false, show_on_email: true });
  });
  test("overview: every included section in newsletter order — featured headline, each story title, section headings; follows edits; keeps your rewording", () => {
    const c = structuredClone(content);
    const toc = c.sections.find((x) => x.type === "toc") as Extract<import("@/lib/newsletter-designer/types").Section, { type: "toc" }>;
    const arts = c.sections.find((x) => x.type === "articles") as Extract<import("@/lib/newsletter-designer/types").Section, { type: "articles" }>;
    arts.items.push({ id: "s3", title: "Library Adds Sunday Hours", description: "", imageUrl: "", url: "https://tcountyconnect.com/x/" });
    let lines = r.tocLines(c, ctx, toc).map((l) => l.label);
    assert.deepEqual(lines, ["📰 Main <Story> & More", "☀️ Your 3-Day Forecast", "📅 Upcoming Events", "🗞️ Second story", "🗞️ Library Adds Sunday Hours", "🏪 Business Spotlight: Joe's Diner", "🔎 Explore More on T County Connect"]);
    // Same order as the newsletter: move weather to the end → its line moves too
    const order = structuredClone(c);
    const wi = order.sections.findIndex((x) => x.type === "weather");
    order.sections.push(order.sections.splice(wi, 1)[0]);
    assert.equal(r.tocLines(order, ctx, toc).at(-1)!.label, "☀️ Your 3-Day Forecast");
    // A switched-on but empty section is listed as pending in the editor, never in the email
    const empty = structuredClone(c);
    (empty.sections.find((x) => x.type === "events") as { items: unknown[] }).items = [];
    const outline = r.tocOutline(empty, ctx, toc);
    assert.ok(outline.some((o) => o.kind === "pending" && o.hint.startsWith("📅 Upcoming Events — appears once you add an event")));
    assert.ok(!r.tocLines(empty, ctx, toc).some((l) => l.label.startsWith("📅")));
    const evIdx = outline.findIndex((o) => o.kind === "pending"), wIdx = outline.findIndex((o) => o.kind === "line" && o.label.startsWith("☀️"));
    assert.ok(evIdx === wIdx + 1, "pending hint sits in its newsletter position");
    // Change a story title → its line follows
    arts.items[0].title = "Second story, updated";
    assert.ok(r.tocLines(c, ctx, toc).some((l) => l.label === "🗞️ Second story, updated"));
    // Disabled section / untitled story never listed
    c.sections.find((x) => x.type === "spotlight")!.enabled = false;
    lines = r.tocLines(c, ctx, toc).map((l) => l.label);
    assert.ok(!lines.some((l) => l.startsWith("🏪")) && !lines.includes("🗞️ "));
    // Your wording + order: reworded line keeps your text; untouched lines (null) keep following the titles
    const all = r.tocLines(c, ctx, toc);
    const ev = all.find((l) => l.label.startsWith("📅"))!, feat = all[0];
    toc.entries = [{ sectionId: ev.sectionId, label: "📅 What's On This Week" }, { sectionId: feat.sectionId, label: null }];
    (c.sections.find((x) => x.type === "featured") as { story: { title: string } }).story.title = "New Top Headline";
    lines = r.tocLines(c, ctx, toc).map((l) => l.label);
    assert.deepEqual(lines.slice(0, 3), ["📰 New Top Headline", "☀️ Your 3-Day Forecast", "📅 What's On This Week"], "reworded line keeps your text, order stays the newsletter's");
    // Older drafts stored the generic wording for every line: those now follow the content
    toc.entries = [{ sectionId: feat.sectionId, label: "📰 Local Headlines" }];
    assert.equal(r.tocLines(c, ctx, toc)[0].label, "📰 New Top Headline");
    const evLine = (o?: { editing?: boolean }) => r.tocLines(c, ctx, toc, o).find((l) => l.sectionId === ev.sectionId)!.label;
    // Editing keeps text exactly as typed (trailing space, empty line); the email trims / falls back to the content
    toc.entries = [{ sectionId: ev.sectionId, label: "📅 What's On " }];
    assert.equal(evLine({ editing: true }), "📅 What's On ");
    assert.equal(evLine(), "📅 What's On");
    toc.entries = [{ sectionId: ev.sectionId, label: "" }];
    assert.equal(evLine({ editing: true }), "");
    assert.equal(evLine(), "📅 Upcoming Events");
    toc.entries = [{ sectionId: ev.sectionId, label: "📅 What's On This Week" }];
    const sv = designInput.safeParse({ title: "x", previewText: "", issueNumber: 1, issueDate: "2026-11-23", content: c });
    assert.ok(sv.success, sv.success ? "" : JSON.stringify(sv.error.issues[0]));
    const story = r.tocLines(c, ctx, toc).find((l) => l.label.includes("Library"))!;
    assert.match(story.sectionId, /^[a-z0-9]+:s3$/i, "per-story key");
    const d = r.renderEmailDocument({ ...meta, content: c }, ctx);
    assert.ok(d.includes("In This T County Connect Issue") && d.includes("What&#39;s On This Week") && d.includes("New Top Headline") && d.includes("Library Adds Sunday Hours"));
    const tiny = t.defaultContent(); // nothing filled in and Explore off → only the weather → no one-line overview
    tiny.sections.find((x) => x.type === "promo")!.enabled = false;
    assert.ok(!r.renderEmailDocument({ ...meta, content: tiny }, ctx).includes("In This T County Connect Issue"));
  });
  test("Daily Dad Joke: setup and punchline clearly separated; skipped until both are filled; never generated", () => {
    const c = structuredClone(content);
    const j = c.sections.find((x) => x.type === "joke") as Extract<import("@/lib/newsletter-designer/types").Section, { type: "joke" }>;
    assert.ok(!r.renderEmailDocument({ ...meta, content: c }, ctx).includes("Daily Dad Joke"), "empty joke left out");
    Object.assign(j, { intro: "From a reader in Dover.", setup: "Why did the scarecrow win an award?", punchline: "He was outstanding in his field." });
    const d = r.renderEmailDocument({ ...meta, content: c }, ctx);
    const a = d.indexOf("Why did the scarecrow"), b = d.indexOf("He was outstanding");
    assert.ok(a > 0 && b > a && d.slice(a, b).includes("dashed"), "dashed divider between setup and punchline");
    assert.ok(d.includes("Daily Dad Joke") && d.includes("&#128516;") && d.includes("From a reader in Dover."));
    assert.ok(r.tocLines(c, ctx).some((l) => l.label === "😄 Daily Dad Joke"));
  });
  test("Community Poll: native beehiiv poll block; preview placeholder only in the builder; left out without a poll", () => {
    const c = structuredClone(content);
    const pl = c.sections.find((x) => x.type === "poll") as Extract<import("@/lib/newsletter-designer/types").Section, { type: "poll" }>;
    assert.ok(!(beehiivBlocks({ ...meta, content: c }, ctx, "rss") as Record<string, unknown>[]).some((b) => b.type === "poll"));
    pl.poll = { id: "poll_abc-123", name: "Holiday lights", question: "Best light display?", choices: ["Dover", "New Phila"] };
    const blocks = beehiivBlocks({ ...meta, content: c }, ctx, "rss") as Record<string, unknown>[];
    const pb = blocks.find((b) => b.type === "poll");
    assert.deepEqual(pb, { type: "poll", poll_id: "poll_abc-123", show_options_initially: true });
    assert.ok(!blocks.some((b) => JSON.stringify(b).includes("Preview only")), "placeholder never sent");
    assert.ok(!r.renderEmailDocument({ ...meta, content: c }, ctx).includes("Best light display?"), "not in exported HTML");
    assert.ok(r.renderEmailDocument({ ...meta, content: c }, { ...ctx, preview: true }).includes("Preview only · native beehiiv poll"));
    assert.ok(r.tocLines(c, ctx).some((l) => l.label === "📊 Community Poll"));
  });
  test("mobile-safe email: wrapping on all text, stacked story images, no fixed-height or scrolling containers", () => {
    const d = r.renderEmailDocument(meta, ctx);
    assert.ok((d.match(/overflow-wrap:break-word/g) ?? []).length > 20);
    assert.ok(!/width="120"/.test(d), "no narrow thumbnail columns");
    assert.ok(!/overflow:(auto|scroll)|overflow-x|overflow-y/i.test(d));
    assert.ok(!/[^-]height:\s*\d{3,}px/i.test(d), "no fixed-height containers");
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

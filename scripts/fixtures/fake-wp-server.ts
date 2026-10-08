/**
 * Fake WordPress REST API for importer tests — TEST DATA ONLY.
 *
 *   npx tsx scripts/fixtures/fake-wp-server.ts          (listens on :8787)
 *
 * Mimics: /wp-json/ root (site_logo, site_icon), /wp/v2/types (incl. a
 * "business" CPT and an unmapped "fixture_recipe" CPT), /wp/v2/taxonomies
 * (incl. the custom "business_category"), paginated collections with
 * X-WP-Total / X-WP-TotalPages (max 3 per page so posts span 2+ pages),
 * drafts / scheduled posts and menus behind Basic auth, ACF fields,
 * yoast_head_json, media with real PNG/JPEG bytes, sized variants, a missing
 * file, a PDF, a sitemap exposing a CPT hidden from REST, and homepage HTML.
 *
 * Every title is prefixed "Fixture" so the data can never be mistaken for
 * real content. Credentials: fixture-admin / "fixture app pass".
 */
import http from "node:http";
import zlib from "node:zlib";

export const FIXTURE_PORT = Number(process.env.FAKE_WP_PORT ?? 8787);
export const FIXTURE_BASE = `http://localhost:${FIXTURE_PORT}`;
export const FIXTURE_USER = "fixture-admin";
export const FIXTURE_PASS = "fixture app pass";
const B = FIXTURE_BASE;
const UP = `${B}/wp-content/uploads/2024/05`;
const PER_PAGE_CAP = 3;

// ───────── real image bytes ─────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf: Buffer) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Solid-colour RGB PNG generated in code. */
export function makePng(w: number, h: number, rgb: [number, number, number]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// 8×6 baseline JPEG
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAGAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCSiiivGPWP/9k=", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

/** Files served under /wp-content/uploads (sized variants resolve to the same bytes). */
const FILES: Record<string, Buffer> = {
  "fixture-logo.png": makePng(40, 12, [22, 50, 92]),
  "fixture-icon.png": makePng(16, 16, [240, 120, 30]),
  "fixture-latte-scaled.jpg": JPEG,
  "fixture-latte.jpg": JPEG,
  "fixture-map.png": makePng(12, 9, [10, 160, 90]),
  "fixture-coffee-logo.png": makePng(10, 10, [90, 50, 20]),
  "fixture-gallery-1.jpg": JPEG,
  "fixture-gallery-2.png": makePng(9, 7, [200, 30, 60]),
  "fixture-og.jpg": JPEG,
  "fixture-bakery.png": makePng(11, 8, [230, 200, 150]),
  "fixture-wxr-photo.png": makePng(14, 10, [60, 60, 200]),
  "fixture-flyer.pdf": PDF,
};

// ───────── data ─────────
type Media = { id: number; file: string; alt: string; title: string; caption?: string; sizes?: string[]; original?: string; mime: string; post?: number };
const MEDIA: Media[] = [
  { id: 101, file: "fixture-logo.png", alt: "Fixture logo", title: "fixture-logo", mime: "image/png" },
  { id: 102, file: "fixture-icon.png", alt: "", title: "fixture-icon", mime: "image/png", sizes: ["fixture-icon-192x192.png", "fixture-icon-32x32.png"] },
  { id: 103, file: "fixture-latte-scaled.jpg", original: "fixture-latte.jpg", alt: "Fixture latte art", title: "fixture-latte", caption: "<p>Fixture caption</p>", mime: "image/jpeg", sizes: ["fixture-latte-1024x768.jpg", "fixture-latte-300x225.jpg"], post: 11 },
  { id: 104, file: "fixture-map.png", alt: "Fixture map", title: "fixture-map", mime: "image/png", sizes: ["fixture-map-300x200.png"], post: 12 },
  { id: 105, file: "fixture-coffee-logo.png", alt: "Fixture Coffee Co logo", title: "fixture-coffee-logo", mime: "image/png", post: 201 },
  { id: 106, file: "fixture-gallery-1.jpg", alt: "Fixture gallery one", title: "fixture-gallery-1", mime: "image/jpeg", post: 201 },
  { id: 107, file: "fixture-gallery-2.png", alt: "Fixture gallery two", title: "fixture-gallery-2", mime: "image/png", post: 201 },
  { id: 108, file: "fixture-og.jpg", alt: "Fixture social image", title: "fixture-og", mime: "image/jpeg", post: 14 },
  { id: 109, file: "fixture-bakery.png", alt: "Fixture bakery storefront", title: "fixture-bakery", mime: "image/png", post: 202 },
];
const mediaUrl = (m: Media) => `${UP}/${m.file}`;
function mediaJson(m: Media) {
  return {
    id: m.id, date: "2024-05-01T10:00:00", slug: m.title, type: "attachment", link: `${B}/${m.title}/`,
    title: { rendered: m.title }, author: 1, caption: { rendered: m.caption ?? "" }, alt_text: m.alt, media_type: "image", mime_type: m.mime,
    media_details: {
      width: 8, height: 6, file: `2024/05/${m.file}`, ...(m.original ? { original_image: m.original } : {}),
      sizes: Object.fromEntries((m.sizes ?? []).map((s) => [s.match(/-(\d+x\d+)\./)?.[1] ?? s, { file: s, source_url: `${UP}/${s}` }])),
    },
    post: m.post ?? null, source_url: mediaUrl(m),
  };
}

type Term = { id: number; taxonomy: string; name: string; slug: string; parent?: number; base: string };
const TERMS: Term[] = [
  { id: 1, taxonomy: "category", name: "Uncategorized", slug: "uncategorized", base: "category" },
  { id: 2, taxonomy: "category", name: "Fixture Business Spotlights", slug: "fixture-business-spotlights", base: "category" },
  { id: 3, taxonomy: "category", name: "Fixture Announcements", slug: "fixture-announcements", base: "category" },
  { id: 4, taxonomy: "category", name: "Fixture Things To Do", slug: "fixture-things-to-do", base: "category" },
  { id: 5, taxonomy: "category", name: "Fixture News", slug: "fixture-news", base: "category" },
  { id: 9, taxonomy: "post_tag", name: "Fixture Tag", slug: "fixture-tag", base: "tag" },
  { id: 31, taxonomy: "business_category", name: "Fixture Cafes", slug: "fixture-cafes", base: "business-category" },
  { id: 32, taxonomy: "business_category", name: "Fixture Bakeries &amp; Sweets", slug: "fixture-bakeries", base: "business-category" },
  { id: 33, taxonomy: "business_category", name: "Fixture Hardware", slug: "fixture-hardware", base: "business-category" },
  { id: 41, taxonomy: "recipe_cuisine", name: "Fixture Breakfast", slug: "fixture-breakfast", base: "cuisine" },
];
const termJson = (t: Term) => ({ id: t.id, count: 1, description: "", link: `${B}/${t.base}/${t.slug}/`, name: t.name, slug: t.slug, taxonomy: t.taxonomy, parent: t.parent ?? 0, meta: [] });

type Post = {
  id: number; type: string; status: string; title: string; slug: string; link: string; content: string; excerpt?: string;
  date: string; featured?: number; categories?: number[]; tags?: number[]; terms?: Record<string, number[]>; acf?: Record<string, unknown>;
  meta?: Record<string, unknown>; yoast?: Record<string, unknown>; extra?: Record<string, unknown>; parent?: number;
};

const P = (s: string) => `<p>${s}</p>\n`;
const POSTS: Post[] = [
  {
    id: 11, type: "post", status: "publish", title: "Business Spotlight: Fixture Coffee Co &#8211; Test Data", slug: "business-spotlight-fixture-coffee-co",
    link: `${B}/2024/05/business-spotlight-fixture-coffee-co/`, date: "2024-05-02T14:00:00", featured: 103, categories: [2], tags: [9],
    content: P(`Fixture paragraph &#8220;quoted&#8221; — this is importer test data. Visit <a href="${B}/business/fixture-coffee-co/">Fixture Coffee Co</a>.`)
      + `<figure class="wp-block-image size-large"><img decoding="async" src="${UP}/fixture-latte-1024x768.jpg" srcset="${UP}/fixture-latte-1024x768.jpg 1024w, ${UP}/fixture-latte-300x225.jpg 300w" sizes="(max-width: 1024px) 100vw, 1024px" alt="Fixture latte art" class="wp-image-103"/><figcaption>Fixture caption</figcaption></figure>\n`
      + P(`Read the <a href="${B}/2024/05/fixture-announcement-library-hours/">fixture announcement</a> and this <a href="${B}/fixture-missing-page/">broken fixture link</a> and <a href="/category/fixture-news/">fixture news</a>.`),
    excerpt: P("Fixture excerpt for the spotlight."),
    yoast: { title: "Fixture Coffee Co Spotlight | Fixture SEO", description: "Fixture SEO description.", og_image: [{ url: `${UP}/fixture-latte-scaled.jpg` }] },
  },
  {
    id: 12, type: "post", status: "publish", title: "Fixture Announcement: Library Hours", slug: "fixture-announcement-library-hours",
    link: `${B}/2024/05/fixture-announcement-library-hours/`, date: "2024-05-03T09:30:00", featured: 104, categories: [3],
    content: P(`Fixture announcement text. <img src="${UP}/fixture-map-300x200.png" alt="Fixture map" width="300" height="200" />`)
      + P(`Download the <a href="${UP}/fixture-flyer.pdf">fixture flyer (PDF)</a>. Missing image: <img src="${UP}/fixture-missing.png" alt="missing fixture" />`),
  },
  {
    id: 13, type: "post", status: "publish", title: "Fixture Weekend Picks featuring Fixture Hardware Store", slug: "fixture-weekend-picks",
    link: `${B}/2024/05/fixture-weekend-picks/`, date: "2024-05-04T12:00:00", categories: [4],
    content: P("Fixture weekend list. Nothing here is real."),
  },
  {
    id: 14, type: "post", status: "publish", title: "Fixture General Note", slug: "fixture-general-note",
    link: `${B}/2024/05/fixture-general-note/`, date: "2024-05-05T12:00:00", featured: 108, categories: [1],
    acf: { related_business: [202], fixture_note_field: "kept in wpMeta" },
    content: P(`Fixture general content with a Photon image <img src="https://i0.wp.com/localhost:${FIXTURE_PORT}/wp-content/uploads/2024/05/fixture-latte.jpg?resize=300%2C200&#038;ssl=1" alt="photon fixture" />`),
    yoast: { title: "Fixture General Note - Fixture Spotlight Test Site", description: "Fixture general description.", og_image: [{ url: `${UP}/fixture-og.jpg` }] },
  },
  {
    id: 15, type: "post", status: "publish", title: "Fixture News Item", slug: "fixture-news-item",
    link: `${B}/2024/05/fixture-news-item/`, date: "2024-05-06T12:00:00", categories: [5], tags: [9],
    content: P(`Fixture news. See <a href="${B}/about-fixture-site/">About</a> and <a href="${B}/?p=12">shortlink</a>.`),
  },
  {
    id: 16, type: "post", status: "draft", title: "Fixture Draft Spotlight", slug: "", link: `${B}/?p=16`, date: "2024-06-01T12:00:00", categories: [2],
    content: P("Fixture draft body — only visible with credentials."),
  },
  {
    id: 17, type: "post", status: "future", title: "Fixture Scheduled Note", slug: "fixture-scheduled-note", link: `${B}/2027/01/fixture-scheduled-note/`, date: "2027-01-15T12:00:00", categories: [3],
    content: P("Fixture scheduled body — only visible with credentials."),
  },
  { id: 21, type: "page", status: "publish", title: "About Fixture Site", slug: "about-fixture-site", link: `${B}/about-fixture-site/`, date: "2024-01-01T00:00:00", content: P("Fixture about page.") },
  { id: 22, type: "page", status: "publish", title: "Contact Fixture", slug: "contact-fixture", link: `${B}/about-fixture-site/contact-fixture/`, date: "2024-01-01T00:00:00", parent: 21, content: P(`Fixture contact page. <a href="${B}/about-fixture-site/">Back</a>`) },
  {
    id: 201, type: "business", status: "publish", title: "Fixture Coffee Co", slug: "fixture-coffee-co", link: `${B}/business/fixture-coffee-co/`, date: "2024-04-01T00:00:00",
    featured: 106, terms: { business_category: [31] },
    content: P("Fixture Coffee Co description. Test data only."),
    acf: {
      address: "123 Fixture St, Dover, OH 44622", phone: "330-555-0101", email: "hello@fixture-coffee.test", website: "fixture-coffee.test",
      facebook: "https://facebook.com/fixturecoffee", instagram: "https://instagram.com/fixturecoffee", hours: "Mon–Fri 7am–3pm (fixture)",
      logo: { ID: 105, id: 105, url: `${UP}/fixture-coffee-logo.png`, alt: "Fixture Coffee Co logo", filename: "fixture-coffee-logo.png" },
      gallery: [{ ID: 106, id: 106, url: `${UP}/fixture-gallery-1.jpg`, filename: "fixture-gallery-1.jpg", alt: "" }, { ID: 107, id: 107, url: `${UP}/fixture-gallery-2.png`, filename: "fixture-gallery-2.png", alt: "" }],
    },
    yoast: { title: "Fixture Coffee Co | Fixture Directory", description: "Fixture coffee listing." },
  },
  {
    id: 202, type: "business", status: "publish", title: "Fixture Bakery &amp; Bread", slug: "fixture-bakery-bread", link: `${B}/business/fixture-bakery-bread/`, date: "2024-04-02T00:00:00",
    featured: 109, terms: { business_category: [32] }, content: P("Fixture bakery description."),
    meta: { business_phone: "330-555-0102", business_email: "bread@fixture-bakery.test", business_city: "New Philadelphia" },
    extra: { fixture_rating: 5 },
  },
  {
    id: 203, type: "business", status: "publish", title: "Fixture Hardware Store", slug: "fixture-hardware-store", link: `${B}/business/fixture-hardware-store/`, date: "2024-04-03T00:00:00",
    terms: { business_category: [31, 33] }, content: P("Fixture hardware description."),
    acf: {
      location: { address: "45 Fixture Ave, Sugarcreek, OH 44681", lat: "40.5031", lng: "-81.6409" },
      business_hours: [{ day: "Monday", open: "8:00", close: "17:00" }, { day: "Sunday", open: "", close: "", closed: true }],
      twitter: "https://x.com/fixturehardware",
    },
  },
  { id: 301, type: "fixture_recipe", status: "publish", title: "Fixture Recipe Pancakes", slug: "fixture-recipe-pancakes", link: `${B}/recipes/fixture-recipe-pancakes/`, date: "2024-03-01T00:00:00", terms: { recipe_cuisine: [41] }, content: P("Fixture pancake recipe.") },
];

const TYPES: Record<string, { rest_base: string; name: string; hierarchical: boolean; taxonomies: string[] }> = {
  post: { rest_base: "posts", name: "Posts", hierarchical: false, taxonomies: ["category", "post_tag"] },
  page: { rest_base: "pages", name: "Pages", hierarchical: true, taxonomies: [] },
  attachment: { rest_base: "media", name: "Media", hierarchical: false, taxonomies: [] },
  wp_block: { rest_base: "blocks", name: "Patterns", hierarchical: false, taxonomies: [] },
  business: { rest_base: "business", name: "Businesses", hierarchical: false, taxonomies: ["business_category"] },
  fixture_recipe: { rest_base: "recipes", name: "Fixture Recipes", hierarchical: false, taxonomies: ["recipe_cuisine"] },
};
const TAXES: Record<string, { rest_base: string; name: string; types: string[] }> = {
  category: { rest_base: "categories", name: "Categories", types: ["post"] },
  post_tag: { rest_base: "tags", name: "Tags", types: ["post"] },
  business_category: { rest_base: "business-category", name: "Business Categories", types: ["business"] },
  recipe_cuisine: { rest_base: "cuisine", name: "Fixture Cuisines", types: ["fixture_recipe"] },
};

function postJson(p: Post, edit: boolean, embed: boolean) {
  const gmt = p.date; // fixture site runs on UTC
  const out: Record<string, unknown> = {
    id: p.id, date: p.date, date_gmt: p.status === "draft" ? null : gmt, modified: p.date, modified_gmt: gmt,
    slug: p.slug, status: p.status, type: p.type, link: p.link,
    title: edit ? { raw: p.title.replace("&#8211;", "–").replace("&amp;", "&"), rendered: p.title } : { rendered: p.title },
    content: { rendered: p.content, protected: false }, excerpt: { rendered: p.excerpt ?? P(p.content.replace(/<[^>]+>/g, "").slice(0, 40) + " [&hellip;]"), protected: false },
    author: 1, featured_media: p.featured ?? 0, parent: p.parent ?? 0, menu_order: 0, meta: p.meta ?? { footnotes: "" },
    ...(edit ? { generated_slug: p.slug || p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") } : {}),
    _links: { self: [{ href: `${B}/wp-json/wp/v2/${TYPES[p.type].rest_base}/${p.id}` }] },
  };
  if (p.type === "post") { out.categories = p.categories ?? []; out.tags = p.tags ?? []; }
  for (const [tax, ids] of Object.entries(p.terms ?? {})) out[TAXES[tax].rest_base] = ids;
  if (p.acf) out.acf = p.acf;
  else if (p.type !== "page") out.acf = [];
  if (p.yoast) out.yoast_head_json = p.yoast;
  Object.assign(out, p.extra ?? {});
  if (embed) {
    const m = MEDIA.find((x) => x.id === p.featured);
    out._embedded = { author: [{ id: 1, name: "Fixture Author", slug: "fixture-author" }], ...(m ? { "wp:featuredmedia": [mediaJson(m)] } : {}) };
  }
  return out;
}

// ───────── server ─────────
function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { "Content-Type": isBuf ? headers["Content-Type"] ?? "application/octet-stream" : typeof body === "string" ? headers["Content-Type"] ?? "text/html; charset=UTF-8" : "application/json; charset=UTF-8", ...headers });
  res.end(isBuf || typeof body === "string" ? body : JSON.stringify(body));
}

function paginate(res: http.ServerResponse, q: URLSearchParams, all: unknown[]) {
  const per = Math.min(Number(q.get("per_page") ?? 10), PER_PAGE_CAP);
  const page = Number(q.get("page") ?? 1);
  const totalPages = Math.max(1, Math.ceil(all.length / per));
  if (page > totalPages && all.length) return send(res, 400, { code: "rest_post_invalid_page_number", message: "The page number requested is larger than the number of pages available." });
  send(res, 200, all.slice((page - 1) * per, page * per), { "X-WP-Total": String(all.length), "X-WP-TotalPages": String(totalPages) });
}

export const requestLog: string[] = [];

export function createFakeWpServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", B);
    const p = url.pathname;
    const q = url.searchParams;
    requestLog.push(`${req.method} ${p}${url.search}`);
    const authed = req.headers.authorization === "Basic " + Buffer.from(`${FIXTURE_USER}:${FIXTURE_PASS.replace(/\s+/g, "")}`).toString("base64");
    const badAuth = !!req.headers.authorization && !authed;
    if (badAuth && p.startsWith("/wp-json/")) return send(res, 401, { code: "incorrect_password", message: "The provided password is an invalid application password." });

    // uploads
    if (p.startsWith("/wp-content/uploads/")) {
      const name = decodeURIComponent(p.split("/").pop() ?? "");
      const base = FILES[name] ? name : name.replace(/-\d+x\d+(\.[a-z]+)$/i, "$1");
      const buf = FILES[base] ?? (base === "fixture-latte.jpg" ? FILES["fixture-latte-scaled.jpg"] : undefined);
      if (!buf) return send(res, 404, "Not found");
      const ext = base.split(".").pop();
      return send(res, 200, buf, { "Content-Type": ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "image/jpeg", "Content-Length": String(buf.length) });
    }
    if (p === "/" && !q.has("rest_route")) {
      return send(res, 200, `<!doctype html><html><head><title>Fixture Spotlight Test Site</title><link rel="icon" href="${UP}/fixture-icon-32x32.png" sizes="32x32"><link rel="icon" href="${UP}/fixture-icon-192x192.png" sizes="192x192"><meta property="og:site_name" content="Fixture Spotlight Test Site"><link rel="https://api.w.org/" href="${B}/wp-json/"></head><body class="home"><a href="${B}/" class="custom-logo-link"><img width="40" height="12" src="${UP}/fixture-logo.png" class="custom-logo" alt="Fixture Spotlight"></a></body></html>`);
    }
    if (p === "/wp-sitemap.xml") {
      return send(res, 200, `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${B}/wp-sitemap-posts-post-1.xml</loc></sitemap><sitemap><loc>${B}/wp-sitemap-posts-business-1.xml</loc></sitemap><sitemap><loc>${B}/wp-sitemap-posts-fixture_event-1.xml</loc></sitemap><sitemap><loc>${B}/wp-sitemap-taxonomies-category-1.xml</loc></sitemap></sitemapindex>`, { "Content-Type": "application/xml" });
    }
    const sm = p.match(/^\/wp-sitemap-posts-([a-z_]+)-1\.xml$/);
    if (sm) {
      const urls = sm[1] === "fixture_event" ? [`${B}/fixture-event/fixture-hidden-festival/`] : POSTS.filter((x) => x.type === sm[1] && x.status === "publish").map((x) => x.link);
      return send(res, 200, `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`, { "Content-Type": "application/xml" });
    }
    if (p === "/fixture-event/fixture-hidden-festival/") {
      return send(res, 200, `<!doctype html><html><head><title>Fixture Hidden Festival - Fixture Spotlight Test Site</title><meta name="description" content="Fixture hidden festival description."><meta property="og:image" content="${UP}/fixture-og.jpg"><meta property="article:published_time" content="2024-07-04T15:00:00+00:00"><link rel='shortlink' href='${B}/?p=601'></head><body class="fixture_event-template-default single postid-601"><article id="post-601" class="post-601 fixture_event type-fixture_event status-publish hentry"><h1 class="entry-title">Fixture Hidden Festival</h1><div class="entry-content"><p>Fixture festival content from public HTML.</p><div class="inner"><p>Nested fixture block.</p></div></div></article></body></html>`);
    }

    // REST: /wp-json/... or ?rest_route=
    const route = p.startsWith("/wp-json") ? p.slice("/wp-json".length) || "/" : q.get("rest_route");
    if (route === null) return send(res, 404, "<h1>Not found</h1>");
    const edit = q.get("context") === "edit";
    if (edit && !authed && !route.startsWith("/wp/v2/types") && !route.startsWith("/wp/v2/taxonomies")) {
      return send(res, 401, { code: "rest_forbidden_context", message: "Sorry, you are not allowed to edit posts in this post type.", data: { status: 401 } });
    }
    if (route === "/" || route === "") {
      return send(res, 200, { name: "Fixture Spotlight Test Site", description: "Fixture tagline &amp; test data", url: B, home: B, gmt_offset: "0", namespaces: ["oembed/1.0", "wp/v2", "wp-site-health/v1", "yoast/v1"], site_logo: 101, site_icon: 102, site_icon_url: `${UP}/fixture-icon.png`, routes: {} });
    }
    if (route === "/wp/v2/users/me") return authed ? send(res, 200, { id: 1, name: "Fixture Admin", slug: FIXTURE_USER }) : send(res, 401, { code: "rest_not_logged_in", message: "You are not currently logged in." });
    if (route === "/wp/v2/types") return send(res, 200, Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, { slug: k, ...v, rest_namespace: "wp/v2" }])));
    if (route === "/wp/v2/taxonomies") return send(res, 200, Object.fromEntries(Object.entries(TAXES).map(([k, v]) => [k, { slug: k, ...v, rest_namespace: "wp/v2" }])));
    if (route === "/wp/v2/users") return paginate(res, q, [{ id: 1, name: "Fixture Author", slug: "fixture-author", link: `${B}/author/fixture-author/` }]);
    if (route === "/wp/v2/media") return paginate(res, q, MEDIA.map(mediaJson));
    const mm = route.match(/^\/wp\/v2\/media\/(\d+)$/);
    if (mm) { const m = MEDIA.find((x) => x.id === Number(mm[1])); return m ? send(res, 200, mediaJson(m)) : send(res, 404, { code: "rest_post_invalid_id" }); }
    if (route === "/wp/v2/menus") return authed ? paginate(res, q, [{ id: 501, name: "Fixture Primary", slug: "fixture-primary", locations: ["primary"] }]) : send(res, 401, { code: "rest_cannot_view", message: "Sorry, you are not allowed to view menus.", data: { status: 401 } });
    if (route === "/wp/v2/menu-locations") return authed ? send(res, 200, { primary: { name: "primary", menu: 501 } }) : send(res, 401, { code: "rest_cannot_view" });
    if (route === "/wp/v2/menu-items") return authed ? paginate(res, q, [{ id: 511, title: { rendered: "Fixture Home" }, url: `${B}/`, parent: 0, menu_order: 1 }, { id: 512, title: { rendered: "Fixture About" }, url: `${B}/about-fixture-site/`, parent: 0, menu_order: 2 }]) : send(res, 401, { code: "rest_cannot_view" });
    for (const [tax, t] of Object.entries(TAXES)) {
      if (route === `/wp/v2/${t.rest_base}`) return paginate(res, q, TERMS.filter((x) => x.taxonomy === tax).map(termJson));
    }
    for (const [type, t] of Object.entries(TYPES)) {
      if (route !== `/wp/v2/${t.rest_base}` || type === "attachment") continue;
      const statuses = (q.get("status") ?? "publish").split(",");
      const wantsPrivate = statuses.some((s) => s !== "publish");
      if (wantsPrivate && !authed) return send(res, 400, { code: "rest_invalid_param", message: "Invalid parameter(s): status", data: { status: 400, params: { status: "Status is forbidden." } } });
      const all = POSTS.filter((x) => x.type === type && (statuses.includes("any") ? x.status !== "trash" : statuses.includes(x.status)));
      return paginate(res, q, all.map((x) => postJson(x, edit, q.has("_embed"))));
    }
    send(res, 404, { code: "rest_no_route", message: "No route was found matching the URL and request method.", data: { status: 404 } });
  });
}

export function startFakeWpServer(port = FIXTURE_PORT): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const s = createFakeWpServer();
    s.once("error", reject);
    s.listen(port, () => resolve(s));
  });
}

if (process.argv[1] && /fake-wp-server\.ts$/.test(process.argv[1])) {
  startFakeWpServer().then(() => console.log(`Fake WordPress (fixture data) listening on ${FIXTURE_BASE}`));
}

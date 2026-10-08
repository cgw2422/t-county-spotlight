/**
 * WordPress REST API client + discovery. Produces a normalized WpSnapshot.
 *
 * - Discovers every post type and taxonomy the site exposes (incl. custom ones).
 * - Paginates with X-WP-TotalPages, retries 429/5xx/network errors with backoff.
 * - Optional Basic auth with a WordPress Application Password
 *   (WP_USERNAME + WP_APP_PASSWORD) unlocks status=any + context=edit, i.e.
 *   drafts, scheduled, pending and private content, raw titles and menus.
 * - 401/403/404 per endpoint are recorded, never fatal.
 * - Post types hidden from REST but listed in the XML sitemap are discovered
 *   and (best effort) read from their public HTML pages.
 */
import { decodeEntities, htmlToText } from "./html";
import type { EndpointResult, Logger, WpAuthor, WpItem, WpMedia, WpMenu, WpSnapshot, WpTaxonomyInfo, WpTerm, WpTypeInfo } from "./types";
import { scrapePublicPage } from "./scrape";

export type RestClientOptions = {
  baseUrl: string;
  username?: string;
  appPassword?: string;
  log?: Logger;
  perPage?: number;
  maxRetries?: number;
  timeoutMs?: number;
  /** Max items per post type (testing / dry runs). */
  limitPerType?: number;
  /** Read hidden post types from their public HTML pages (default true). */
  scrapeHidden?: boolean;
};

type Res = { status: number; headers: Headers; json: unknown; text: string; url: string };

const UA = "TCountySpotlight-Migrator/1.0 (+https://tcountyspotlight.com)";

/** Post types that are WordPress internals, never content. */
export const INTERNAL_TYPES = new Set([
  "attachment", "nav_menu_item", "wp_block", "wp_template", "wp_template_part", "wp_navigation",
  "wp_global_styles", "wp_font_family", "wp_font_face", "revision", "custom_css", "customize_changeset",
  "oembed_cache", "user_request", "wp_pattern", "acf-field", "acf-field-group", "acf-post-type", "acf-taxonomy",
  "acf-ui-options-page", "wpcf7_contact_form", "elementor_library", "e-landing-page", "elementor_snippet",
  "elementor_font", "elementor_icons", "wpforms", "wpforms_log", "frm_form", "frm_styles", "shop_order",
]);

const STANDARD_FIELDS = new Set([
  "id", "date", "date_gmt", "guid", "modified", "modified_gmt", "slug", "status", "type", "link", "title",
  "content", "excerpt", "author", "featured_media", "comment_status", "ping_status", "sticky", "template",
  "format", "meta", "categories", "tags", "_links", "_embedded", "acf", "yoast_head", "yoast_head_json",
  "parent", "menu_order", "class_list", "permalink_template", "generated_slug", "password", "jetpack_featured_media_url",
  "jetpack_sharing_enabled", "jetpack_shortlink", "jetpack-related-posts", "jetpack_likes_enabled", "amp_enabled",
  "uagb_featured_image_src", "uagb_author_info", "uagb_comment_info", "uagb_excerpt",
]);

export class WpRestClient {
  readonly base: string;
  private auth?: string;
  private log: Logger;
  private perPage: number;
  private maxRetries: number;
  private timeoutMs: number;
  /** "pretty" = /wp-json/..., "query" = /?rest_route=... */
  private mode: "pretty" | "query" = "pretty";
  readonly endpoints: EndpointResult[] = [];
  readonly requiresCredentials = new Set<string>();

  constructor(opts: RestClientOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    if (opts.username && opts.appPassword) {
      this.auth = "Basic " + Buffer.from(`${opts.username}:${opts.appPassword.replace(/\s+/g, "")}`).toString("base64");
    }
    this.log = opts.log ?? (() => {});
    this.perPage = Math.min(100, opts.perPage ?? 100);
    this.maxRetries = opts.maxRetries ?? 4;
    this.timeoutMs = opts.timeoutMs ?? 45_000;
  }

  get hasAuth() { return !!this.auth; }
  dropAuth() { this.auth = undefined; }

  apiUrl(route: string, params: Record<string, string | number | undefined> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    if (this.mode === "query") {
      const q = qs.toString();
      return `${this.base}/?rest_route=${encodeURIComponent(route)}${q ? "&" + q : ""}`;
    }
    const q = qs.toString();
    return `${this.base}/wp-json${route}${q ? "?" + q : ""}`;
  }

  /** Raw GET with retries. Never throws for HTTP errors; throws after exhausting retries on network errors. */
  async get(url: string, opts: { auth?: boolean; accept?: string } = {}): Promise<Res> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const headers: Record<string, string> = { "User-Agent": UA, Accept: opts.accept ?? "application/json" };
        if (this.auth && opts.auth !== false) headers.Authorization = this.auth;
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs), redirect: "follow" });
        if ([429, 500, 502, 503, 504, 520, 522, 524].includes(r.status) && attempt < this.maxRetries) {
          const retryAfter = Number(r.headers.get("retry-after"));
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : 1000 * 2 ** attempt;
          this.log(`  ↻ HTTP ${r.status} for ${url} — retrying in ${Math.round(wait / 1000)}s`);
          await sleep(wait);
          continue;
        }
        const text = await r.text();
        let json: unknown = undefined;
        if (text && /^[\s﻿]*[\[{]/.test(text)) {
          try { json = JSON.parse(text.replace(/^﻿/, "")); } catch { /* not json */ }
        }
        return { status: r.status, headers: r.headers, json, text, url: r.url || url };
      } catch (e) {
        lastErr = e;
        if (attempt < this.maxRetries) {
          const wait = 1000 * 2 ** attempt;
          this.log(`  ↻ network error for ${url} (${(e as Error).message}) — retrying in ${wait / 1000}s`);
          await sleep(wait);
        }
      }
    }
    throw new Error(`Request failed after ${this.maxRetries + 1} attempts: ${url} — ${(lastErr as Error)?.message}`);
  }

  private record(endpoint: string, status: number | "error", note?: string) {
    this.endpoints.push({ endpoint, status, note });
    if (status === 401 || status === 403) this.requiresCredentials.add(endpoint);
  }

  /** GET a single route, recording the outcome. */
  async route(route: string, params: Record<string, string | number | undefined> = {}): Promise<Res | null> {
    try {
      const r = await this.get(this.apiUrl(route, params));
      const code = (r.json as { code?: string } | undefined)?.code;
      this.record(route, r.status, r.status >= 400 ? code || r.text.slice(0, 120) : undefined);
      return r;
    } catch (e) {
      this.record(route, "error", (e as Error).message);
      return null;
    }
  }

  /** Paginate a collection route. Returns all items plus the reported total. */
  async collection<T = Record<string, unknown>>(
    route: string,
    params: Record<string, string | number | undefined> = {},
    limit?: number,
  ): Promise<{ items: T[]; total: number | null; status: number | "error" }> {
    const items: T[] = [];
    let total: number | null = null;
    let page = 1;
    let totalPages = 1;
    let status: number | "error" = 200;
    while (page <= totalPages) {
      let r: Res;
      try {
        r = await this.get(this.apiUrl(route, { ...params, per_page: params.per_page ?? this.perPage, page }));
      } catch (e) {
        this.record(route, "error", (e as Error).message);
        return { items, total, status: "error" };
      }
      status = r.status;
      if (r.status === 400 && page > 1) break; // rest_post_invalid_page_number
      if (r.status >= 400 || !Array.isArray(r.json)) {
        const code = (r.json as { code?: string } | undefined)?.code;
        this.record(route, r.status, code || (r.status < 400 ? "unexpected response (not a JSON array)" : r.text.slice(0, 120)));
        return { items, total, status: r.status >= 400 ? r.status : "error" };
      }
      if (page === 1) {
        const tp = Number(r.headers.get("x-wp-totalpages"));
        const t = Number(r.headers.get("x-wp-total"));
        totalPages = Number.isFinite(tp) && tp > 0 ? tp : r.json.length >= Number(params.per_page ?? this.perPage) ? 9999 : 1;
        total = Number.isFinite(t) && r.headers.has("x-wp-total") ? t : null;
        this.record(route, r.status);
      }
      items.push(...(r.json as T[]));
      if (!r.headers.has("x-wp-totalpages") && r.json.length < Number(params.per_page ?? this.perPage)) break;
      if (r.json.length === 0) break;
      if (limit && items.length >= limit) break;
      if (totalPages > 1) this.log(`    ${route} page ${page}/${totalPages === 9999 ? "?" : totalPages}`);
      page++;
    }
    return { items: limit ? items.slice(0, limit) : items, total: total ?? items.length, status };
  }

  /** Find the REST root (pretty permalinks or ?rest_route=). */
  async discoverRoot(): Promise<Record<string, unknown> | null> {
    let r = await this.route("/");
    if (r && r.status === 200 && r.json && typeof r.json === "object" && "namespaces" in (r.json as object)) return r.json as Record<string, unknown>;
    if (r && r.status === 401 && this.auth) {
      this.log("  ! Credentials were rejected by WordPress (401). Continuing without authentication.");
      this.dropAuth();
      r = await this.route("/");
      if (r && r.status === 200 && r.json && "namespaces" in (r.json as object)) return r.json as Record<string, unknown>;
    }
    this.mode = "query";
    r = await this.route("/");
    if (r && r.status === 200 && r.json && "namespaces" in (r.json as object)) {
      this.log("  Using ?rest_route= (pretty permalinks for the API are unavailable)");
      return r.json as Record<string, unknown>;
    }
    this.mode = "pretty";
    return null;
  }
}

function sleep(ms: number) { return new Promise((res) => setTimeout(res, ms)); }

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const rendered = (v: unknown): string => (isObj(v) ? String(v.rendered ?? "") : typeof v === "string" ? v : "");
const rawOr = (v: unknown): string | undefined => (isObj(v) && typeof v.raw === "string" ? v.raw : undefined);
const isoGmt = (v: unknown) => (typeof v === "string" && v && !v.startsWith("0000") ? (v.endsWith("Z") ? v : v + "Z") : undefined);

export function normalizeRestMedia(m: Json): WpMedia {
  const details = isObj(m.media_details) ? m.media_details : {};
  const sizes = isObj(details.sizes) ? details.sizes : {};
  const url = String(m.source_url ?? (isObj(m.guid) ? m.guid.rendered : "") ?? "");
  const variants = new Set<string>([url]);
  for (const s of Object.values(sizes)) if (isObj(s) && typeof s.source_url === "string") variants.add(s.source_url);
  if (typeof details.original_image === "string" && url) variants.add(url.replace(/[^/]+$/, details.original_image));
  return {
    id: Number(m.id),
    url,
    alt: typeof m.alt_text === "string" ? m.alt_text : undefined,
    caption: rendered(m.caption) || undefined,
    title: rawOr(m.title) ?? (htmlToText(rendered(m.title)) || undefined),
    mimeType: typeof m.mime_type === "string" ? m.mime_type : undefined,
    variants: [...variants].filter(Boolean),
    parentId: typeof m.post === "number" && m.post ? m.post : undefined,
  };
}

export function normalizeRestTerm(t: Json, taxonomy?: string): WpTerm {
  return {
    id: Number(t.id),
    taxonomy: String(t.taxonomy ?? taxonomy ?? ""),
    name: decodeEntities(String(t.name ?? "")),
    slug: String(t.slug ?? ""),
    description: typeof t.description === "string" && t.description ? t.description : undefined,
    parent: typeof t.parent === "number" && t.parent ? t.parent : undefined,
    link: typeof t.link === "string" ? t.link : undefined,
    count: typeof t.count === "number" ? t.count : undefined,
  };
}

export function normalizeRestItem(p: Json, typeName: string, taxByRestBase: Map<string, string>): WpItem {
  const terms: Record<string, number[]> = {};
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    const tax = taxByRestBase.get(k);
    if (tax && Array.isArray(v) && v.every((x) => typeof x === "number")) { terms[tax] = v as number[]; continue; }
    if (k === "categories" && Array.isArray(v)) { terms.category = v as number[]; continue; }
    if (k === "tags" && Array.isArray(v)) { terms.post_tag = v as number[]; continue; }
    if (STANDARD_FIELDS.has(k) || k.startsWith("_")) continue;
    if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    meta[k] = v; // unknown top-level field exposed by a plugin / register_rest_field
  }
  if (isObj(p.meta)) for (const [k, v] of Object.entries(p.meta)) if (v !== "" && v !== null && !(Array.isArray(v) && !v.length)) meta[k] = v;
  if (isObj(p.acf)) for (const [k, v] of Object.entries(p.acf)) meta[k] = v; // ACF wins
  const y = isObj(p.yoast_head_json) ? p.yoast_head_json : null;
  const og = y && Array.isArray(y.og_image) && isObj(y.og_image[0]) ? String(y.og_image[0].url ?? "") : undefined;
  const embedded = isObj(p._embedded) ? p._embedded : {};
  const fm = Array.isArray(embedded["wp:featuredmedia"]) && isObj(embedded["wp:featuredmedia"][0]) ? embedded["wp:featuredmedia"][0] : null;
  const author = Array.isArray(embedded.author) && isObj(embedded.author[0]) ? embedded.author[0] : null;
  const slug = String(p.slug || p.generated_slug || "");
  return {
    id: Number(p.id),
    type: typeName,
    status: String(p.status ?? "publish"),
    title: rawOr(p.title) ?? htmlToText(rendered(p.title)),
    slug,
    link: typeof p.link === "string" ? p.link : undefined,
    content: rendered(p.content),
    excerpt: rawOr(p.excerpt)?.trim() || rendered(p.excerpt) || undefined,
    dateGmt: isoGmt(p.date_gmt) ?? isoGmt(p.date),
    modifiedGmt: isoGmt(p.modified_gmt) ?? isoGmt(p.modified),
    authorId: typeof p.author === "number" ? p.author : undefined,
    authorName: author && typeof author.name === "string" ? decodeEntities(author.name) : undefined,
    featuredMediaId: typeof p.featured_media === "number" && p.featured_media ? p.featured_media : undefined,
    featuredImageUrl: fm && typeof fm.source_url === "string" ? fm.source_url : typeof p.jetpack_featured_media_url === "string" && p.jetpack_featured_media_url ? p.jetpack_featured_media_url : undefined,
    terms,
    meta,
    seo: y ? {
      title: typeof y.title === "string" ? decodeEntities(y.title) : undefined,
      description: typeof y.description === "string" ? decodeEntities(y.description) : undefined,
      ogImage: og || undefined,
      canonical: typeof y.canonical === "string" ? y.canonical : undefined,
    } : undefined,
    parentId: typeof p.parent === "number" && p.parent ? p.parent : undefined,
    menuOrder: typeof p.menu_order === "number" ? p.menu_order : undefined,
  };
}

/** Read the public homepage HTML for logo / icon (fallback when REST has none). */
export async function fetchHomepageBranding(client: WpRestClient): Promise<{ logoUrl?: string; iconUrl?: string; name?: string; description?: string }> {
  try {
    const r = await client.get(client.base + "/", { auth: false, accept: "text/html" });
    if (r.status >= 400) return {};
    const html = r.text;
    const out: { logoUrl?: string; iconUrl?: string; name?: string; description?: string } = {};
    const logoTag = html.match(/<img[^>]*class=["'][^"']*\bcustom-logo\b[^"']*["'][^>]*>/i) ?? html.match(/<img[^>]*class=["'][^"']*\b(?:site-logo|logo)\b[^"']*["'][^>]*>/i);
    if (logoTag) {
      const src = logoTag[0].match(/\bsrc=["']([^"']+)["']/i)?.[1];
      if (src) out.logoUrl = new URL(decodeEntities(src), client.base + "/").toString();
    }
    const icon = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*>/gi);
    if (icon?.length) {
      // prefer the largest declared size
      const scored = icon.map((t) => ({ href: t.match(/href=["']([^"']+)["']/i)?.[1], size: Number(t.match(/sizes=["'](\d+)x/i)?.[1] ?? 0) })).filter((x) => x.href);
      scored.sort((a, b) => b.size - a.size);
      if (scored[0]?.href) out.iconUrl = new URL(decodeEntities(scored[0].href), client.base + "/").toString();
    }
    const ogSite = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i)?.[1];
    if (ogSite) out.name = decodeEntities(ogSite);
    return out;
  } catch {
    return {};
  }
}

/** Parse sitemap(s) to find public URLs per post type (detects CPTs hidden from REST). */
async function discoverSitemaps(client: WpRestClient, log: Logger): Promise<Record<string, string[]>> {
  const byType: Record<string, string[]> = {};
  const candidates = ["/wp-sitemap.xml", "/sitemap_index.xml", "/sitemap.xml"];
  for (const c of candidates) {
    let r: Res;
    try { r = await client.get(client.base + c, { auth: false, accept: "application/xml,text/xml" }); } catch { continue; }
    if (r.status !== 200 || !/<(sitemapindex|urlset)/i.test(r.text)) continue;
    const subs = [...r.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
    const isIndex = /<sitemapindex/i.test(r.text);
    const maps = isIndex ? subs : [client.base + c];
    for (const sm of maps) {
      // wp-sitemap-posts-business-1.xml  |  business-sitemap.xml / business-sitemap2.xml
      const m = sm.match(/wp-sitemap-posts-([a-z0-9_-]+?)-\d+\.xml/i) ?? sm.match(/\/([a-z0-9_-]+?)-sitemap\d*\.xml/i);
      if (!m) continue;
      const type = m[1];
      if (/^(category|post_tag|tag|author|users?|taxonomies|local|news|video|image)$/i.test(type) || /taxonom|users/.test(sm)) continue;
      try {
        const s = await client.get(sm, { auth: false, accept: "application/xml,text/xml" });
        if (s.status !== 200) continue;
        const urls = [...s.text.matchAll(/<url>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((x) => decodeEntities(x[1]));
        (byType[type] ??= []).push(...urls);
      } catch { /* ignore */ }
    }
    if (Object.keys(byType).length) {
      log(`  Sitemap ${c}: ${Object.entries(byType).map(([t, u]) => `${t}=${u.length}`).join(", ")}`);
      break;
    }
  }
  return byType;
}

/** Discover and download everything the REST API exposes. */
export async function fetchRestSnapshot(opts: RestClientOptions): Promise<WpSnapshot> {
  const log = opts.log ?? (() => {});
  const client = new WpRestClient(opts);
  const snap: WpSnapshot = {
    source: "rest", baseUrl: client.base, site: {}, authenticated: false, types: [], taxonomies: [], terms: [],
    authors: [], media: [], items: [], menus: [], endpoints: client.endpoints, requiresCredentials: [], warnings: [], totals: {},
  };

  log(`Discovering ${client.base}/wp-json/ …`);
  const root = await client.discoverRoot();
  if (!root) {
    throw new Error(`The WordPress REST API was not reachable at ${client.base}/wp-json/ (or ?rest_route=/). Check the URL, or import a WXR export instead.`);
  }
  snap.site = {
    name: typeof root.name === "string" ? decodeEntities(root.name) : undefined,
    description: typeof root.description === "string" ? decodeEntities(root.description) : undefined,
    url: typeof root.home === "string" ? root.home : typeof root.url === "string" ? root.url : undefined,
    logoId: typeof root.site_logo === "number" && root.site_logo ? root.site_logo : undefined,
    iconId: typeof root.site_icon === "number" && root.site_icon ? root.site_icon : undefined,
    iconUrl: typeof root.site_icon_url === "string" && root.site_icon_url ? root.site_icon_url : undefined,
    namespaces: Array.isArray(root.namespaces) ? (root.namespaces as string[]) : [],
  };
  log(`  Site: ${snap.site.name ?? "(no name)"} — namespaces: ${snap.site.namespaces?.join(", ")}`);

  if (client.hasAuth) {
    const me = await client.route("/wp/v2/users/me", { context: "edit" });
    if (me?.status === 200) {
      snap.authenticated = true;
      log(`  Authenticated as ${(me.json as Json).name ?? (me.json as Json).slug}`);
    } else {
      snap.warnings.push(`Application Password was rejected (HTTP ${me?.status ?? "error"}); continuing with public data only.`);
      log(`  ! Credentials rejected (HTTP ${me?.status}) — continuing with public data only`);
      client.dropAuth();
    }
  } else {
    snap.warnings.push("No WordPress credentials provided: drafts, scheduled, pending and private posts are not visible over REST. Set WP_USERNAME + WP_APP_PASSWORD (Application Password) or import a WXR export.");
  }
  const ctx = snap.authenticated ? "edit" : "view";

  // ── types & taxonomies
  const typesRes = await client.route("/wp/v2/types", { context: ctx });
  const typesJson = typesRes?.status === 200 && isObj(typesRes.json) ? typesRes.json : {};
  for (const [name, t] of Object.entries(typesJson)) {
    if (!isObj(t)) continue;
    snap.types.push({
      name, label: typeof t.name === "string" ? t.name : name,
      restBase: typeof t.rest_base === "string" ? t.rest_base : name,
      restNamespace: typeof t.rest_namespace === "string" ? t.rest_namespace : "wp/v2",
      hierarchical: !!t.hierarchical, taxonomies: Array.isArray(t.taxonomies) ? (t.taxonomies as string[]) : [],
    });
  }
  if (!snap.types.length) {
    snap.warnings.push("/wp/v2/types returned nothing; falling back to posts and pages only.");
    snap.types.push({ name: "post", restBase: "posts", restNamespace: "wp/v2" }, { name: "page", restBase: "pages", restNamespace: "wp/v2", hierarchical: true });
  }
  log(`  Post types: ${snap.types.map((t) => t.name).join(", ")}`);

  const taxRes = await client.route("/wp/v2/taxonomies", { context: ctx });
  const taxJson = taxRes?.status === 200 && isObj(taxRes.json) ? taxRes.json : {};
  for (const [name, t] of Object.entries(taxJson)) {
    if (!isObj(t)) continue;
    snap.taxonomies.push({
      name, label: typeof t.name === "string" ? t.name : name,
      restBase: typeof t.rest_base === "string" ? t.rest_base : name,
      restNamespace: typeof t.rest_namespace === "string" ? t.rest_namespace : "wp/v2",
      types: Array.isArray(t.types) ? (t.types as string[]) : [], hierarchical: !!t.hierarchical,
    });
  }
  if (!snap.taxonomies.length) {
    snap.taxonomies.push({ name: "category", restBase: "categories", restNamespace: "wp/v2", types: ["post"], hierarchical: true }, { name: "post_tag", restBase: "tags", restNamespace: "wp/v2", types: ["post"] });
  }
  log(`  Taxonomies: ${snap.taxonomies.map((t) => t.name).join(", ")}`);
  const taxByRestBase = new Map(snap.taxonomies.map((t) => [t.restBase ?? t.name, t.name]));

  for (const tax of snap.taxonomies) {
    if (["nav_menu", "wp_pattern_category", "wp_theme", "wp_template_part_area", "link_category", "post_format"].includes(tax.name)) continue;
    const r = await client.collection<Json>(`/${tax.restNamespace}/${tax.restBase}`, { context: "view", hide_empty: "false" });
    snap.totals[`term:${tax.name}`] = r.total ?? r.items.length;
    for (const t of r.items) snap.terms.push(normalizeRestTerm(t, tax.name));
    log(`  Terms ${tax.name}: ${r.items.length}${r.status !== 200 ? ` (HTTP ${r.status})` : ""}`);
  }

  // ── users
  const users = await client.collection<Json>("/wp/v2/users", { context: snap.authenticated ? "edit" : "view" });
  snap.authors = users.items.map((u): WpAuthor => ({
    id: Number(u.id), name: decodeEntities(String(u.name ?? u.slug ?? "")), slug: typeof u.slug === "string" ? u.slug : undefined,
    email: typeof u.email === "string" ? u.email : undefined, link: typeof u.link === "string" ? u.link : undefined,
  }));
  log(`  Users: ${snap.authors.length}`);

  // ── media library
  const media = await client.collection<Json>("/wp/v2/media", { context: "view", ...(snap.authenticated ? { status: "inherit,private" } : {}) });
  snap.media = media.items.map(normalizeRestMedia);
  snap.totals.attachment = media.total ?? snap.media.length;
  log(`  Media library: ${snap.media.length}`);
  const mediaIds = new Set(snap.media.map((m) => m.id));

  // ── content of every post type
  const termIds = new Set(snap.terms.map((t) => `${t.taxonomy}:${t.id}`));
  const hasAcfV3 = snap.site.namespaces?.includes("acf/v3");
  for (const type of snap.types) {
    if (INTERNAL_TYPES.has(type.name)) continue;
    const route = `/${type.restNamespace ?? "wp/v2"}/${type.restBase ?? type.name}`;
    const params: Record<string, string> = { _embed: "1", context: ctx };
    if (snap.authenticated) params.status = "any";
    let r = await client.collection<Json>(route, { ...params, per_page: 50 }, opts.limitPerType);
    if (snap.authenticated && r.status !== 200 && !r.items.length) {
      r = await client.collection<Json>(route, { _embed: "1", per_page: 50 }, opts.limitPerType);
    }
    snap.totals[type.name] = r.total ?? r.items.length;
    log(`  ${type.name}: ${r.items.length} item(s)${r.status !== 200 ? ` (HTTP ${r.status})` : ""}`);
    let acfById: Map<number, unknown> | null = null;
    if (hasAcfV3 && r.items.length && r.items.every((i) => !("acf" in i))) {
      const acf = await client.collection<Json>(`/acf/v3/${type.restBase ?? type.name}`, {}, opts.limitPerType);
      acfById = new Map(acf.items.map((a) => [Number(a.id), a.acf]));
    }
    for (const raw of r.items) {
      if (acfById?.has(Number(raw.id))) raw.acf = acfById.get(Number(raw.id));
      const item = normalizeRestItem(raw, type.name, taxByRestBase);
      snap.items.push(item);
      // capture embedded media / terms that list endpoints may have hidden
      const emb = isObj(raw._embedded) ? raw._embedded : {};
      const fm = Array.isArray(emb["wp:featuredmedia"]) && isObj(emb["wp:featuredmedia"][0]) ? emb["wp:featuredmedia"][0] : null;
      if (fm && typeof fm.id === "number" && !mediaIds.has(fm.id) && typeof fm.source_url === "string") {
        snap.media.push(normalizeRestMedia(fm)); mediaIds.add(fm.id);
      }
      if (Array.isArray(emb["wp:term"])) {
        for (const group of emb["wp:term"]) if (Array.isArray(group)) for (const t of group) {
          if (isObj(t) && !termIds.has(`${t.taxonomy}:${t.id}`)) { snap.terms.push(normalizeRestTerm(t)); termIds.add(`${t.taxonomy}:${t.id}`); }
        }
      }
      if (!item.authorName && item.authorId) item.authorName = snap.authors.find((a) => a.id === item.authorId)?.name;
    }
  }

  // ── branding: resolve site logo id
  if (snap.site.logoId) {
    let m = snap.media.find((x) => x.id === snap.site.logoId);
    if (!m) {
      const r = await client.route(`/wp/v2/media/${snap.site.logoId}`);
      if (r?.status === 200 && isObj(r.json)) { m = normalizeRestMedia(r.json); snap.media.push(m); }
    }
    snap.site.logoUrl = m?.url;
  }
  if (snap.site.iconId && !snap.media.find((x) => x.id === snap.site.iconId)) {
    const r = await client.route(`/wp/v2/media/${snap.site.iconId}`);
    if (r?.status === 200 && isObj(r.json)) snap.media.push(normalizeRestMedia(r.json));
  }
  if (!snap.site.logoUrl || !snap.site.iconUrl) {
    const hp = await fetchHomepageBranding(client);
    if (!snap.site.logoUrl && hp.logoUrl) { snap.site.logoUrl = hp.logoUrl; log(`  Logo found in homepage HTML: ${hp.logoUrl}`); }
    if (!snap.site.iconUrl && hp.iconUrl) { snap.site.iconUrl = hp.iconUrl; log(`  Icon found in homepage HTML: ${hp.iconUrl}`); }
    if (!snap.site.name && hp.name) snap.site.name = hp.name;
  }

  // ── menus (core endpoint needs auth; plugins expose public variants)
  snap.menus = await fetchMenus(client, log);

  // ── post types hidden from REST, found via sitemap
  const sitemap = await discoverSitemaps(client, log);
  const restTypes = new Set(snap.types.map((t) => t.name));
  const restBases = new Set(snap.types.map((t) => t.restBase));
  const knownLinks = new Set(snap.items.map((i) => i.link?.replace(/\/+$/, "")).filter(Boolean));
  for (const [type, urls] of Object.entries(sitemap)) {
    const typeName = type === "post" || type === "page" ? type : type;
    if (restTypes.has(typeName) || restBases.has(typeName)) {
      const missing = urls.filter((u) => !knownLinks.has(u.replace(/\/+$/, "")));
      if (missing.length) snap.warnings.push(`${missing.length} ${typeName} URL(s) in the sitemap were not returned by REST (e.g. ${missing.slice(0, 3).join(", ")}).`);
      continue;
    }
    snap.totals[`${typeName} (sitemap only)`] = urls.length;
    snap.warnings.push(`Post type "${typeName}" has ${urls.length} public URL(s) in the sitemap but is hidden from the REST API (show_in_rest=false). ${opts.scrapeHidden === false ? "Not scraped." : "Imported from public HTML pages (best effort) — a WXR export gives complete data."}`);
    snap.types.push({ name: typeName, label: `${typeName} (hidden from REST)`, restBase: undefined, count: urls.length });
    if (opts.scrapeHidden === false) continue;
    log(`  Reading ${urls.length} hidden "${typeName}" page(s) from public HTML …`);
    let n = 0;
    for (const url of opts.limitPerType ? urls.slice(0, opts.limitPerType) : urls) {
      try {
        const page = await client.get(url, { auth: false, accept: "text/html" });
        if (page.status !== 200) { snap.warnings.push(`Could not read ${url} (HTTP ${page.status})`); continue; }
        const item = scrapePublicPage(page.text, url, typeName);
        if (item) { snap.items.push(item); n++; }
        else snap.warnings.push(`Could not find a WordPress post id on ${url}; skipped.`);
      } catch (e) {
        snap.warnings.push(`Could not read ${url}: ${(e as Error).message}`);
      }
    }
    log(`    scraped ${n}/${urls.length}`);
  }

  snap.requiresCredentials = [...client.requiresCredentials];
  return snap;
}

async function fetchMenus(client: WpRestClient, log: Logger): Promise<WpMenu[]> {
  const menus: WpMenu[] = [];
  const core = await client.collection<Json>("/wp/v2/menus", { context: "edit" });
  if (core.status === 200 && core.items.length) {
    const locRes = await client.route("/wp/v2/menu-locations");
    const locs = locRes?.status === 200 && isObj(locRes.json) ? locRes.json : {};
    for (const m of core.items) {
      const items = await client.collection<Json>("/wp/v2/menu-items", { menus: Number(m.id), context: "edit" });
      menus.push({
        id: Number(m.id), name: decodeEntities(String(m.name ?? "")), slug: String(m.slug ?? ""),
        locations: Object.entries(locs).filter(([, l]) => isObj(l) && l.menu === m.id).map(([k]) => k),
        items: items.items.map((i) => ({ id: Number(i.id), title: htmlToText(rendered(i.title)), url: String(i.url ?? ""), parent: Number(i.parent ?? 0) || undefined, order: Number(i.menu_order ?? 0) })),
      });
    }
    log(`  Menus (core): ${menus.length}`);
    return menus;
  }
  const plugin = await client.route("/menus/v1/menus");
  if (plugin?.status === 200 && Array.isArray(plugin.json)) {
    for (const m of plugin.json as Json[]) {
      const d = await client.route(`/menus/v1/menus/${m.slug ?? m.term_id}`);
      const items = d?.status === 200 && isObj(d.json) && Array.isArray(d.json.items) ? (d.json.items as Json[]) : [];
      const flat: WpMenu["items"] = [];
      const walk = (arr: Json[], parent?: number) => arr.forEach((i) => {
        flat.push({ id: Number(i.ID ?? i.id), title: decodeEntities(String(i.title ?? "")), url: String(i.url ?? ""), parent, order: Number(i.menu_order ?? 0) });
        if (Array.isArray(i.child_items)) walk(i.child_items as Json[], Number(i.ID ?? i.id));
      });
      walk(items);
      menus.push({ id: Number(m.term_id ?? m.id), name: decodeEntities(String(m.name ?? "")), slug: String(m.slug ?? ""), items: flat });
    }
    log(`  Menus (menus/v1 plugin): ${menus.length}`);
    return menus;
  }
  const legacy = await client.route("/wp-api-menus/v2/menus");
  if (legacy?.status === 200 && Array.isArray(legacy.json)) {
    for (const m of legacy.json as Json[]) {
      const d = await client.route(`/wp-api-menus/v2/menus/${m.ID ?? m.term_id}`);
      const items = d?.status === 200 && isObj(d.json) && Array.isArray(d.json.items) ? (d.json.items as Json[]) : [];
      menus.push({ id: Number(m.ID ?? m.term_id), name: decodeEntities(String(m.name ?? "")), slug: String(m.slug ?? ""), items: items.map((i) => ({ id: Number(i.id), title: decodeEntities(String(i.title ?? "")), url: String(i.url ?? ""), parent: Number(i.parent ?? 0) || undefined, order: Number(i.order ?? 0) })) });
    }
    log(`  Menus (wp-api-menus plugin): ${menus.length}`);
  }
  return menus;
}

export type { WpSnapshot, WpTypeInfo, WpTaxonomyInfo };

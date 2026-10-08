/**
 * Core WordPress importer: normalized WpSnapshot → Prisma.
 *
 * Guarantees:
 *  - Idempotent. Records are matched on (wpType, wpId), then legacyPath /
 *    slug / sourceUrl, so a second run updates instead of duplicating.
 *  - Verbatim. Titles and HTML are never rewritten or summarized. Only URLs
 *    change: media → permanent storage, absolute internal links → relative.
 *    The untouched HTML is kept in originalContent (wpMeta for businesses).
 *  - Local edits win. Articles/pages with localEditedAt, and businesses whose
 *    fields changed since the last import, are not overwritten unless
 *    options.force (businesses still get empty fields filled).
 *  - Everything is accounted for in WpRecord and the run report.
 */
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { saveSettings } from "@/lib/settings";
import { articleHref, businessHref, normalizePath, pageHref } from "@/lib/links";
import { slugify } from "@/lib/utils";
import { expandCoreShortcodes, extractHrefs, findShortcodes, htmlToText, wpautop } from "./html";
import { MediaManager } from "./media";
import {
  articleKind, articleStatus, businessStatus, isBusinessType, isFormSubmissionType, isImageObject,
  mapBusinessFields, relationshipIds, resolveSeoTemplate, flattenMeta,
} from "./mapping";
import { emptyReport, type ImportReport } from "./report";
import type { Logger, WpItem, WpSnapshot, WpTerm } from "./types";

export type ImportOptions = {
  dryRun?: boolean;
  force?: boolean;
  skipMedia?: boolean;
  /** Also download library images no content references. */
  importAllMedia?: boolean;
  mediaConcurrency?: number;
  runId?: string;
  log?: Logger;
};

/** App routes that exist besides imported content (for the broken-link check). */
const APP_ROUTES = new Set([
  "/articles/", "/businesses/", "/events/", "/specials/", "/jobs/", "/spotlights/", "/things-to-do/", "/search/",
  "/login/", "/register/", "/signup/", "/account/", "/dashboard/", "/memberships/", "/list-your-business/",
  "/privacy/", "/terms/", "/admin/", "/events/submit/",
]);
const APP_ROUTE_PREFIXES = ["/articles/", "/businesses/", "/events/", "/specials/", "/jobs/", "/media/", "/admin/", "/dashboard/", "/account/"];

const INTERNAL_PATH_SKIP = /^\/(wp-admin|wp-login\.php|wp-json|xmlrpc\.php|wp-cron\.php)/;

type Ctx = {
  snap: WpSnapshot;
  opts: ImportOptions;
  report: ImportReport;
  media: MediaManager;
  log: Logger;
  termById: Map<string, WpTerm>; // `${taxonomy}:${id}`
  termIdsByTax: Map<string, WpTerm[]>;
  categoryIdByWp: Map<number, string>;
  tagIdByWp: Map<number, string>;
  bizCatIdByTerm: Map<string, string>; // `${taxonomy}:${id}`
  businessTypes: Set<string>;
  businessTaxonomies: Set<string>;
  recordPaths: Set<string>;
  wpRecords: Prisma.WpRecordCreateInput[];
  unmappedFieldCounts: Map<string, number>;
  shortcodeCounts: Map<string, number>;
  processed: { kind: "article" | "page" | "business"; id: string; item: WpItem; path: string; content: string }[];
};

export function siteHostsOf(snap: WpSnapshot) {
  const hosts = new Set<string>();
  for (const u of [snap.baseUrl, snap.site.url]) {
    if (!u) continue;
    try {
      const h = new URL(u).host;
      hosts.add(h); hosts.add(h.replace(/^www\./, "")); hosts.add(`www.${h.replace(/^www\./, "")}`);
    } catch { /* ignore */ }
  }
  return hosts;
}

/** Path of a WordPress permalink, or null for query-string / front-page links. */
export function legacyPathOf(link: string | undefined, snap: WpSnapshot): string | null {
  if (!link) return null;
  let u: URL;
  try { u = new URL(link, snap.baseUrl + "/"); } catch { return null; }
  if (!siteHostsOf(snap).has(u.host)) return null;
  if (u.search && /[?&](p|page_id|post_type|attachment_id)=/.test(u.search)) return null;
  const p = normalizePath(u.pathname);
  return p === "/" ? null : p;
}

function hash(v: unknown) {
  return crypto.createHash("sha1").update(JSON.stringify(v)).digest("hex");
}

function dateOrNull(s?: string) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inc(obj: Record<string, number>, k: string, by = 1) { obj[k] = (obj[k] ?? 0) + by; }

/** Rewrite absolute links to the old site into relative paths (href attributes only). */
export function rewriteInternalLinks(html: string, hosts: Set<string>) {
  return html.replace(/(\bhref\s*=\s*)(["'])(.*?)\2/gi, (m, pre: string, q: string, url: string) => {
    let u: URL;
    try { u = new URL(url.replace(/&amp;/g, "&")); } catch { return m; }
    if (!/^https?:$/.test(u.protocol) || !hosts.has(u.host)) return m;
    if (u.pathname.includes("/wp-content/") || INTERNAL_PATH_SKIP.test(u.pathname)) return m;
    const rel = `${u.pathname}${u.search}${u.hash}`.replace(/&/g, "&amp;");
    return `${pre}${q}${rel}${q}`;
  });
}

async function uniqueSlug(table: "article" | "business" | "page", desired: string, selfId?: string): Promise<{ slug: string; changed: boolean }> {
  const base = (desired || "item").slice(0, 90);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const hit = table === "article"
      ? await db.article.findUnique({ where: { slug }, select: { id: true } })
      : table === "business"
        ? await db.business.findUnique({ where: { slug }, select: { id: true } })
        : await db.page.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === selfId) return { slug, changed: i > 0 };
  }
  return { slug: `${base}-${crypto.randomBytes(3).toString("hex")}`, changed: true };
}

// ───────────────────────────── entry point ─────────────────────────────

export async function importSnapshot(snap: WpSnapshot, opts: ImportOptions = {}): Promise<ImportReport> {
  const log = opts.log ?? (() => {});
  const report = emptyReport(snap.source, snap.baseUrl, !!opts.dryRun, {
    force: !!opts.force, skipMedia: !!opts.skipMedia, dryRun: !!opts.dryRun, importAllMedia: !!opts.importAllMedia,
  });
  report.runId = opts.runId;
  report.authenticated = snap.authenticated;
  report.site = { name: snap.site.name, description: snap.site.description, url: snap.site.url };
  report.sourceTotals = { ...snap.totals };
  report.requiresCredentials = [...snap.requiresCredentials];
  report.endpointErrors = snap.endpoints.filter((e) => e.status === "error" || (typeof e.status === "number" && e.status >= 400 && e.status !== 401 && e.status !== 403));
  report.warnings.push(...snap.warnings);
  report.menus = snap.menus.map((m) => ({ name: m.name, items: m.items.length, locations: m.locations }));

  // de-duplicate the snapshot itself (REST pagination can shift while paging)
  const seen = new Set<string>();
  const items: WpItem[] = [];
  for (const it of snap.items) {
    const k = `${it.type}:${it.id}`;
    if (seen.has(k)) { report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: "returned twice by the source; imported once" }); continue; }
    seen.add(k);
    items.push(it);
  }
  for (const it of items) inc(report.discovered, it.type);
  report.discovered.attachment = snap.media.length;
  for (const t of snap.terms) inc(report.discovered, `term:${t.taxonomy}`);
  if (snap.authors.length) report.discovered.author = snap.authors.length;
  if (snap.menus.length) report.discovered.menu = snap.menus.length;
  report.media.libraryTotal = snap.media.length;

  const businessTypes = new Set(snap.types.filter((t) => isBusinessType(t.name, t.label)).map((t) => t.name));
  for (const it of items) if (isBusinessType(it.type)) businessTypes.add(it.type);
  const businessTaxonomies = new Set<string>();
  for (const tax of snap.taxonomies) {
    if (tax.name === "post_tag") continue;
    if (tax.types.some((t) => businessTypes.has(t)) && (tax.name !== "category" || tax.types.every((t) => businessTypes.has(t)))) businessTaxonomies.add(tax.name);
  }
  for (const it of items) if (businessTypes.has(it.type)) for (const tax of Object.keys(it.terms)) if (tax !== "post_tag" && tax !== "category") businessTaxonomies.add(tax);
  // a business CPT that uses the regular "category" taxonomy
  const bizUsesCategory = items.some((it) => businessTypes.has(it.type) && it.terms.category?.length);

  const termById = new Map(snap.terms.map((t) => [`${t.taxonomy}:${t.id}`, t]));
  const termIdsByTax = new Map<string, WpTerm[]>();
  for (const t of snap.terms) termIdsByTax.set(t.taxonomy, [...(termIdsByTax.get(t.taxonomy) ?? []), t]);

  const media = new MediaManager({ baseUrl: snap.baseUrl, media: snap.media, skipDownload: !!opts.skipMedia || !!opts.dryRun, concurrency: opts.mediaConcurrency ?? 4, log, extraHosts: [...siteHostsOf(snap)] });

  const ctx: Ctx = {
    snap, opts, report, media, log, termById, termIdsByTax,
    categoryIdByWp: new Map(), tagIdByWp: new Map(), bizCatIdByTerm: new Map(),
    businessTypes, businessTaxonomies, recordPaths: new Set(), wpRecords: [],
    unmappedFieldCounts: new Map(), shortcodeCounts: new Map(), processed: [],
  };

  // unmapped taxonomies
  for (const tax of snap.taxonomies) {
    if (["category", "post_tag", "nav_menu", "post_format", "wp_theme", "wp_template_part_area", "wp_pattern_category", "link_category"].includes(tax.name) || businessTaxonomies.has(tax.name)) continue;
    const n = termIdsByTax.get(tax.name)?.length ?? 0;
    report.unmappedTaxonomies.push({ taxonomy: tax.name, terms: n, note: "term names kept in each record's wpMeta.terms" });
  }

  const typeTargets = (type: string) =>
    type === "post" ? "Article" : type === "page" ? "Page" : businessTypes.has(type) ? "Business" : isFormSubmissionType(type) ? "skip" : "Article (GENERAL)";
  const otherTypes = [...new Set(items.map((i) => i.type))].filter((t) => typeTargets(t) === "Article (GENERAL)" || typeTargets(t) === "skip");
  for (const t of otherTypes) {
    report.unmappedPostTypes.push({ type: t, count: items.filter((i) => i.type === t).length, importedAs: typeTargets(t) === "skip" ? "not imported (form submissions — export from the form plugin)" : "Article (kind GENERAL, wpType kept)" });
  }
  log(`Business post types: ${[...businessTypes].join(", ") || "(none found)"}; business taxonomies: ${[...businessTaxonomies].join(", ") || "(none)"}`);

  if (opts.dryRun) {
    report.plan = items.map((it) => {
      const target = typeTargets(it.type);
      const cats = (it.terms.category ?? []).map((id) => termById.get(`category:${id}`)).filter(Boolean) as WpTerm[];
      const tags = (it.terms.post_tag ?? []).map((id) => termById.get(`post_tag:${id}`)).filter(Boolean) as WpTerm[];
      const kind = target.startsWith("Article") ? (it.type === "post" ? articleKind({ title: it.title, categoryNames: cats.map((c) => c.name), categorySlugs: cats.map((c) => c.slug), tagNames: tags.map((t) => t.name) }) : "GENERAL") : undefined;
      const path = legacyPathOf(it.link, snap) ?? undefined;
      return { type: it.type, wpId: it.id, title: it.title, target, kind, status: it.status, path };
    });
    for (const it of items) for (const s of findShortcodes(it.content)) ctx.shortcodeCounts.set(s, (ctx.shortcodeCounts.get(s) ?? 0) + 1);
    report.unexpandedShortcodes = [...ctx.shortcodeCounts].map(([shortcode, count]) => ({ shortcode, count }));
    if (!snap.site.logoUrl) report.branding.logo = "not found"; else report.branding.logo = `would import ${snap.site.logoUrl} (if no logo is set)`;
    if (snap.site.iconUrl) report.branding.icon = `would import ${snap.site.iconUrl} (if no favicon is set)`;
    log(`Dry run: ${items.length} records planned, no database writes.`);
    return finish(report);
  }

  // ── taxonomies
  log("Importing terms …");
  await importTerms(ctx, bizUsesCategory);

  // ── content
  const order = (t: string) => (businessTypes.has(t) ? 0 : t === "page" ? 1 : t === "post" ? 2 : 3);
  const sorted = [...items].sort((a, b) => order(a.type) - order(b.type));
  let n = 0;
  for (const it of sorted) {
    n++;
    if (n % 25 === 0) log(`  … ${n}/${sorted.length} records`);
    const target = typeTargets(it.type);
    try {
      if (target === "skip") {
        report.skipped.push({ type: it.type, wpId: it.id, title: it.title, reason: "form submission post type — use the form plugin's CSV export" });
        record(ctx, it, "skipped", null, null, null, "form submission");
      } else if (target === "Business") await importBusiness(ctx, it);
      else if (target === "Page") await importPage(ctx, it);
      else await importArticle(ctx, it, it.type !== "post");
    } catch (e) {
      const msg = (e as Error).message?.split("\n").slice(-3).join(" ").slice(0, 500) || String(e);
      report.failed.push({ type: it.type, wpId: it.id, title: it.title, error: msg });
      record(ctx, it, "failed", null, null, null, msg);
      log(`  ✗ ${it.type} #${it.id} "${it.title}": ${msg}`);
    }
  }

  // ── media that nothing referenced
  const unreferenced = snap.media.filter((m) => !media.processedIds.has(m.id));
  if (opts.importAllMedia && !opts.skipMedia) {
    log(`Downloading ${unreferenced.length} unreferenced library file(s) …`);
    await Promise.all(unreferenced.map((m) => media.ensure(m.url, { context: "media library", wpId: m.id })));
  }
  report.media.unreferencedInLibrary = snap.media.filter((m) => !media.processedIds.has(m.id)).length;
  for (const m of snap.media) {
    if (!media.processedIds.has(m.id)) continue;
    const newUrl = media.urlMap.get(m.url) ?? null;
    ctx.wpRecords.push({ wpType: "attachment", wpId: m.id, title: m.title?.slice(0, 300), status: newUrl ? "imported" : opts.skipMedia ? "skipped" : "failed", wpStatus: "inherit", targetType: "Media", targetId: null, sourceUrl: m.url, newPath: newUrl, error: newUrl ? null : opts.skipMedia ? "media skipped" : "download failed" });
  }

  // ── article ↔ business links + spotlight flag
  log("Linking articles to businesses …");
  await linkArticlesToBusinesses(ctx);

  // ── branding
  await importBranding(ctx);

  // ── redirects
  log("Creating redirects …");
  await createRedirects(ctx);

  // ── broken links
  await checkLinks(ctx);

  // ── bookkeeping
  report.media = { ...report.media, referenced: media.stats.referenced, downloaded: media.stats.downloaded, reused: media.stats.reused, failed: media.stats.failed, skipped: media.stats.skipped };
  report.missingFiles = media.failures;
  report.unexpandedShortcodes = [...ctx.shortcodeCounts].map(([shortcode, count]) => ({ shortcode, count })).sort((a, b) => b.count - a.count);
  report.unmappedFields = [...ctx.unmappedFieldCounts].map(([k, count]) => { const [type, field] = k.split("\u0000"); return { type, field, count }; }).sort((a, b) => b.count - a.count);
  if (snap.menus.length) {
    await db.setting.upsert({ where: { key: "wpMenus" }, create: { key: "wpMenus", value: snap.menus as unknown as Prisma.InputJsonValue }, update: { value: snap.menus as unknown as Prisma.InputJsonValue } });
    report.warnings.push(`${snap.menus.length} WordPress menu(s) saved to the "wpMenus" setting for reference; site menus were not replaced (edit them in Admin → Menus).`);
  }
  await flushWpRecords(ctx);
  log(`Done: ${report.imported.articles} articles, ${report.imported.businesses} businesses, ${report.imported.pages} pages, ${report.failed.length} failed.`);
  return finish(report);
}

function finish(report: ImportReport) {
  report.finishedAt = new Date().toISOString();
  report.durationSec = Math.round((Date.parse(report.finishedAt) - Date.parse(report.startedAt)) / 1000);
  return report;
}

function record(ctx: Ctx, it: WpItem, status: string, targetType: string | null, targetId: string | null, newPath: string | null, error?: string | null) {
  ctx.wpRecords.push({
    wpType: it.type, wpId: it.id, title: it.title.slice(0, 300), status, wpStatus: it.status, targetType, targetId,
    sourceUrl: it.link ?? null, newPath, error: error ?? null,
  });
}

async function flushWpRecords(ctx: Ctx) {
  const seen = new Map<string, Prisma.WpRecordCreateInput>();
  for (const r of ctx.wpRecords) seen.set(`${r.wpType}:${r.wpId}`, r);
  for (const r of seen.values()) {
    const { wpType, wpId, ...rest } = r;
    await db.wpRecord.upsert({ where: { wpType_wpId: { wpType, wpId } }, create: r, update: rest });
  }
}

function trackUnmapped(ctx: Ctx, type: string, keys: string[]) {
  for (const k of keys) {
    if (k.startsWith("__") || /^_(yoast_wpseo_|thumbnail_id|wp_|edit_|oembed_|menu_item)/.test(k) || /^rank_math_/.test(k)) continue;
    const key = `${type}\u0000${k}`;
    ctx.unmappedFieldCounts.set(key, (ctx.unmappedFieldCounts.get(key) ?? 0) + 1);
  }
}

// ───────────────────────────── terms ─────────────────────────────

async function importTerms(ctx: Ctx, bizUsesCategory: boolean) {
  const { snap, report } = ctx;
  for (const t of snap.terms) {
    const wpType = `term:${t.taxonomy}`;
    const realId = t.id > 0 ? t.id : null;
    const name = t.name.slice(0, 200) || t.slug;
    const slug = (t.slug || slugify(name)).slice(0, 190);
    try {
      if (t.taxonomy === "category") {
        let row = realId ? await db.category.findUnique({ where: { wpId: realId } }) : null;
        row ??= await db.category.findUnique({ where: { slug } });
        if (row) row = await db.category.update({ where: { id: row.id }, data: { name, description: t.description ?? row.description, wpId: row.wpId ?? realId } });
        else row = await db.category.create({ data: { name, slug, description: t.description, wpId: realId } });
        ctx.categoryIdByWp.set(t.id, row.id);
        report.imported.categories++;
        ctx.wpRecords.push({ wpType, wpId: t.id, title: name, status: "imported", targetType: "Category", targetId: row.id, sourceUrl: t.link ?? null, newPath: `/articles/?category=${row.slug}` });
      } else if (t.taxonomy === "post_tag") {
        let row = realId ? await db.tag.findUnique({ where: { wpId: realId } }) : null;
        row ??= await db.tag.findUnique({ where: { slug } });
        if (row) row = await db.tag.update({ where: { id: row.id }, data: { name, wpId: row.wpId ?? realId } });
        else row = await db.tag.create({ data: { name, slug, wpId: realId } });
        ctx.tagIdByWp.set(t.id, row.id);
        report.imported.tags++;
        ctx.wpRecords.push({ wpType, wpId: t.id, title: name, status: "imported", targetType: "Tag", targetId: row.id, sourceUrl: t.link ?? null, newPath: `/articles/?tag=${row.slug}` });
      }
      if (ctx.businessTaxonomies.has(t.taxonomy) || (t.taxonomy === "category" && bizUsesCategory)) {
        let row = realId ? await db.businessCategory.findFirst({ where: { wpId: realId, wpTaxonomy: t.taxonomy } }) : null;
        row ??= await db.businessCategory.findFirst({ where: { wpTaxonomy: t.taxonomy, slug } });
        if (!row) {
          const bySlug = await db.businessCategory.findUnique({ where: { slug } });
          if (bySlug && (!bySlug.wpTaxonomy || bySlug.wpTaxonomy === t.taxonomy)) row = bySlug; // adopt a seeded category with the same slug
          else if (bySlug) {
            const alt = `${slug}-${slugify(t.taxonomy)}`.slice(0, 190);
            row = await db.businessCategory.findUnique({ where: { slug: alt } });
            row ??= await db.businessCategory.create({ data: { name, slug: alt, description: t.description, wpId: realId, wpTaxonomy: t.taxonomy } });
            report.duplicates.push({ type: `term:${t.taxonomy}`, wpId: t.id, title: name, detail: `slug "${slug}" already used by another business category; stored as "${alt}"` });
          }
        }
        if (row) row = await db.businessCategory.update({ where: { id: row.id }, data: { name: row.wpId ? name : row.name, description: row.description ?? t.description, wpId: row.wpId ?? realId, wpTaxonomy: row.wpTaxonomy ?? t.taxonomy } });
        else row = await db.businessCategory.create({ data: { name, slug, description: t.description, wpId: realId, wpTaxonomy: t.taxonomy } });
        ctx.bizCatIdByTerm.set(`${t.taxonomy}:${t.id}`, row.id);
        report.imported.businessCategories++;
        if (t.taxonomy !== "category") ctx.wpRecords.push({ wpType, wpId: t.id, title: name, status: "imported", targetType: "BusinessCategory", targetId: row.id, sourceUrl: t.link ?? null, newPath: `/businesses/?category=${row.slug}` });
      } else if (t.taxonomy !== "category" && t.taxonomy !== "post_tag") {
        ctx.wpRecords.push({ wpType, wpId: t.id, title: name, status: "skipped", targetType: null, targetId: null, sourceUrl: t.link ?? null, newPath: null, error: "taxonomy not mapped; names kept on records (wpMeta.terms)" });
      }
    } catch (e) {
      report.failed.push({ type: wpType, wpId: t.id, title: name, error: (e as Error).message.slice(0, 300) });
      ctx.wpRecords.push({ wpType, wpId: t.id, title: name, status: "failed", error: (e as Error).message.slice(0, 500), sourceUrl: t.link ?? null });
    }
  }
}

function termsOf(ctx: Ctx, it: WpItem) {
  const out: Record<string, { id: number; slug: string; name: string }[]> = {};
  for (const [tax, ids] of Object.entries(it.terms)) {
    out[tax] = ids.map((id) => ctx.termById.get(`${tax}:${id}`)).filter(Boolean).map((t) => ({ id: t!.id, slug: t!.slug, name: t!.name }));
  }
  return out;
}

// ───────────────────────────── content helpers ─────────────────────────────

async function prepareHtml(ctx: Ctx, it: WpItem, html: string, label: string) {
  let out = html;
  if (it.contentIsRaw) {
    out = expandCoreShortcodes(out, (id) => {
      const m = ctx.media.mediaById(id);
      return m ? { url: m.url, alt: m.alt, caption: m.caption } : undefined;
    });
    out = wpautop(out);
  }
  for (const s of findShortcodes(out)) ctx.shortcodeCounts.set(s, (ctx.shortcodeCounts.get(s) ?? 0) + 1);
  out = await ctx.media.rewriteHtml(out, label);
  out = rewriteInternalLinks(out, siteHostsOf(ctx.snap));
  return out;
}

async function featured(ctx: Ctx, it: WpItem, label: string) {
  if (it.featuredMediaId) {
    const r = await ctx.media.ensureId(it.featuredMediaId, label);
    if (r) return r;
  }
  if (it.featuredImageUrl && ctx.media.isSiteFile(it.featuredImageUrl)) {
    const url = await ctx.media.ensure(it.featuredImageUrl, { context: label });
    if (url) return { url, alt: undefined as string | undefined };
  }
  return null;
}

async function seoFor(ctx: Ctx, it: WpItem, label: string, fallbackOg?: string | null) {
  const cat = it.terms.category?.[0] ? ctx.termById.get(`category:${it.terms.category[0]}`)?.name : undefined;
  const title = resolveSeoTemplate(it.seo?.title, { title: it.title, siteName: ctx.snap.site.name, category: cat, excerpt: htmlToText(it.excerpt) });
  const description = resolveSeoTemplate(it.seo?.description, { title: it.title, siteName: ctx.snap.site.name, category: cat, excerpt: htmlToText(it.excerpt) });
  let og: string | null = null;
  if (it.seo?.ogImage) {
    if (ctx.media.isSiteFile(it.seo.ogImage)) og = await ctx.media.ensure(it.seo.ogImage, { context: `${label} (og:image)` });
    else if (/^https?:\/\//.test(it.seo.ogImage)) og = it.seo.ogImage;
  }
  return { seoTitle: title?.slice(0, 300) ?? null, seoDescription: description?.slice(0, 1000) ?? null, ogImageUrl: og ?? fallbackOg ?? null };
}

// ───────────────────────────── articles ─────────────────────────────

async function importArticle(ctx: Ctx, it: WpItem, otherType: boolean) {
  const { report, snap, opts } = ctx;
  const label = `${it.type} #${it.id} "${it.title}"`;
  const wpType = it.type;
  let existing = await db.article.findUnique({ where: { wpType_wpId: { wpType, wpId: it.id } } });
  let legacyPath = legacyPathOf(it.link, snap);
  if (legacyPath && ctx.recordPaths.has(legacyPath)) {
    report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `path ${legacyPath} is already used by another imported record` });
    legacyPath = null;
  }
  if (legacyPath) {
    const byPath = await db.article.findUnique({ where: { legacyPath } });
    if (byPath && byPath.id !== existing?.id) {
      if (!existing && byPath.wpId === null) {
        report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `an existing local article already uses ${legacyPath}; linked to it` });
        existing = byPath;
      } else {
        report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `path ${legacyPath} belongs to another article (${byPath.wpType} #${byPath.wpId}); imported without legacy path` });
        legacyPath = null;
      }
    }
    const pageHit = legacyPath ? await db.page.findUnique({ where: { legacyPath }, select: { wpId: true } }) : null;
    if (pageHit) {
      report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `path ${legacyPath} is also used by page #${pageHit.wpId}; article imported without legacy path` });
      legacyPath = null;
    }
  }

  const cats = (it.terms.category ?? []).map((id) => ctx.termById.get(`category:${id}`)).filter(Boolean) as WpTerm[];
  const tags = (it.terms.post_tag ?? []).map((id) => ctx.termById.get(`post_tag:${id}`)).filter(Boolean) as WpTerm[];
  const kind = otherType ? "GENERAL" : articleKind({ title: it.title, categoryNames: cats.map((c) => c.name), categorySlugs: cats.map((c) => c.slug), tagNames: tags.map((t) => t.name) });
  const status = articleStatus(it.status);

  if (existing?.localEditedAt && !opts.force) {
    report.preservedLocalEdits.push({ type: it.type, wpId: it.id, title: it.title, reason: `edited locally ${existing.localEditedAt.toISOString()}` });
    record(ctx, it, "preserved_local_edits", "Article", existing.id, articleHref(existing));
    if (existing.legacyPath) ctx.recordPaths.add(existing.legacyPath);
    ctx.processed.push({ kind: "article", id: existing.id, item: it, path: articleHref(existing), content: existing.content });
    inc(report.imported.articlesByKind, existing.kind);
    inc(report.imported.articlesByStatus, existing.status);
    return;
  }

  const content = await prepareHtml(ctx, it, it.content, label);
  const feat = await featured(ctx, it, label);
  const seo = await seoFor(ctx, it, label);
  const desiredSlug = slugify(it.slug ? decodeURIComponent(it.slug) : it.title);
  const { slug, changed } = existing && existing.slug === desiredSlug ? { slug: existing.slug, changed: false } : await uniqueSlug("article", desiredSlug, existing?.id);
  if (changed) report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `slug "${desiredSlug}" already taken; stored as "${slug}"` });

  const termNames = termsOf(ctx, it);
  const otherTerms = Object.fromEntries(Object.entries(termNames).filter(([t]) => t !== "category" && t !== "post_tag"));
  const wpMeta = {
    source: snap.source, base: snap.baseUrl, link: it.link ?? null, wpStatus: it.status, authorId: it.authorId ?? null,
    excerptHtml: it.excerpt ?? null, parentId: it.parentId ?? null, menuOrder: it.menuOrder ?? null,
    terms: termNames, meta: it.meta, seo: it.seo ?? null, importedAt: new Date().toISOString(),
  } as Prisma.InputJsonValue;
  if (otherType || Object.keys(otherTerms).length) trackUnmapped(ctx, it.type, otherType ? Object.keys(it.meta) : []);
  else trackUnmapped(ctx, it.type, Object.keys(it.meta).filter((k) => !/business|related|listing/i.test(k)));

  const publishedAt = ["publish", "future", "private"].includes(it.status) ? dateOrNull(it.dateGmt) : null;
  const data = {
    wpId: it.id, wpType, slug, title: it.title.slice(0, 500) || "(untitled)",
    excerpt: it.excerpt ? htmlToText(it.excerpt).slice(0, 2000) || null : null,
    content, originalContent: it.content,
    featuredImageUrl: feat?.url ?? null, featuredImageAlt: feat?.alt ?? null,
    status, kind, publishedAt, authorName: it.authorName ?? null,
    seoTitle: seo.seoTitle, seoDescription: seo.seoDescription, ogImageUrl: seo.ogImageUrl,
    legacyPath, wpModifiedAt: dateOrNull(it.modifiedGmt), wpMeta,
    categories: { set: cats.map((c) => ({ id: ctx.categoryIdByWp.get(c.id)! })).filter((c) => c.id) },
    tags: { set: tags.map((t) => ({ id: ctx.tagIdByWp.get(t.id)! })).filter((t) => t.id) },
  };
  let row;
  if (existing) {
    row = await db.article.update({ where: { id: existing.id }, data: { ...data, ...(opts.force && existing.localEditedAt ? { localEditedAt: null } : {}) } });
    report.imported.updated++;
  } else {
    row = await db.article.create({ data: { ...data, categories: { connect: data.categories.set }, tags: { connect: data.tags.set } } });
    report.imported.created++;
  }
  report.imported.articles++;
  if (otherType) report.imported.otherTypesAsArticles++;
  inc(report.imported.articlesByKind, kind);
  inc(report.imported.articlesByStatus, status);
  const path = articleHref(row);
  if (legacyPath) ctx.recordPaths.add(legacyPath);
  ctx.recordPaths.add(path);
  record(ctx, it, "imported", "Article", row.id, path);
  ctx.processed.push({ kind: "article", id: row.id, item: it, path, content });
  noteUrlChange(ctx, it, path);
}

function noteUrlChange(ctx: Ctx, it: WpItem, newPath: string) {
  const old = legacyPathOf(it.link, ctx.snap);
  if (old && old !== newPath && ["publish", "private"].includes(it.status)) ctx.report.urlChanges.push({ type: it.type, wpId: it.id, title: it.title, from: old, to: newPath });
}

// ───────────────────────────── pages ─────────────────────────────

async function importPage(ctx: Ctx, it: WpItem) {
  const { report, snap, opts } = ctx;
  const label = `page #${it.id} "${it.title}"`;
  let existing = await db.page.findUnique({ where: { wpId: it.id } });
  let legacyPath = legacyPathOf(it.link, snap);
  if (legacyPath) {
    const byPath = await db.page.findUnique({ where: { legacyPath } });
    if (byPath && byPath.id !== existing?.id) {
      if (!existing && byPath.wpId === null) { existing = byPath; report.duplicates.push({ type: "page", wpId: it.id, title: it.title, detail: `existing local page at ${legacyPath}; linked to it` }); }
      else { report.duplicates.push({ type: "page", wpId: it.id, title: it.title, detail: `path ${legacyPath} belongs to another page; imported without legacy path` }); legacyPath = null; }
    }
  } else if (it.link && ["publish", "private"].includes(it.status)) {
    try { if (new URL(it.link).pathname === "/") report.warnings.push(`Page "${it.title}" (#${it.id}) is the WordPress front page; imported as /${it.slug}/ (the new homepage is built from Admin → Homepage).`); } catch { /* ignore */ }
  }
  if (existing?.localEditedAt && !opts.force) {
    report.preservedLocalEdits.push({ type: "page", wpId: it.id, title: it.title });
    record(ctx, it, "preserved_local_edits", "Page", existing.id, pageHref(existing));
    if (existing.legacyPath) ctx.recordPaths.add(existing.legacyPath);
    ctx.processed.push({ kind: "page", id: existing.id, item: it, path: pageHref(existing), content: existing.content });
    return;
  }
  const content = await prepareHtml(ctx, it, it.content, label);
  const feat = await featured(ctx, it, label);
  const seo = await seoFor(ctx, it, label);
  const desired = slugify(it.slug ? decodeURIComponent(it.slug) : it.title);
  let { slug, changed } = existing && existing.slug === desired ? { slug: existing.slug, changed: false } : await uniqueSlug("page", desired, existing?.id);
  if (changed && legacyPath) {
    // nested pages: prefer the full path as slug ("about-contact") over a numeric suffix
    const pathSlug = slugify(legacyPath.replace(/\//g, " "));
    const r = await uniqueSlug("page", pathSlug, existing?.id);
    slug = r.slug; changed = r.changed;
  }
  if (changed) report.duplicates.push({ type: "page", wpId: it.id, title: it.title, detail: `slug "${desired}" already taken; stored as "${slug}"` });
  trackUnmapped(ctx, "page", Object.keys(it.meta));
  const data = {
    wpId: it.id, slug, title: it.title.slice(0, 500) || "(untitled)", content, originalContent: it.content,
    featuredImageUrl: feat?.url ?? null, status: articleStatus(it.status), seoTitle: seo.seoTitle, seoDescription: seo.seoDescription, legacyPath,
  };
  const row = existing
    ? await db.page.update({ where: { id: existing.id }, data: { ...data, ...(opts.force && existing.localEditedAt ? { localEditedAt: null } : {}) } })
    : await db.page.create({ data });
  if (existing) report.imported.updated++; else report.imported.created++;
  report.imported.pages++;
  const path = pageHref(row);
  if (legacyPath) ctx.recordPaths.add(legacyPath);
  ctx.recordPaths.add(path);
  record(ctx, it, "imported", "Page", row.id, path);
  ctx.processed.push({ kind: "page", id: row.id, item: it, path, content });
  noteUrlChange(ctx, it, path);
}

// ───────────────────────────── businesses ─────────────────────────────

type BizFields = {
  name: string; description: string | null; tagline: string | null; logoUrl: string | null; coverUrl: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null; latitude: number | null; longitude: number | null;
  phone: string | null; email: string | null; website: string | null; socials: Prisma.InputJsonValue | null; hours: Prisma.InputJsonValue | null;
  seoTitle: string | null; seoDescription: string | null; status: string;
};

function bizSnapshot(b: Record<string, unknown>) {
  const keys: (keyof BizFields)[] = ["name", "description", "tagline", "logoUrl", "coverUrl", "address", "city", "zip", "phone", "email", "website", "socials", "hours", "seoTitle", "seoDescription", "status"];
  return hash(keys.map((k) => b[k] ?? null));
}

async function resolveImage(ctx: Ctx, v: unknown, label: string): Promise<{ url: string; alt?: string } | null> {
  if (v === null || v === undefined || v === "" || v === false) return null;
  if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) return ctx.media.ensureId(Number(v), label);
  if (typeof v === "string") {
    if (ctx.media.isSiteFile(v)) { const url = await ctx.media.ensure(v, { context: label }); return url ? { url } : null; }
    return /^https?:\/\//.test(v) ? { url: v } : null;
  }
  if (isImageObject(v)) {
    const id = Number(v.ID ?? v.id);
    if (id) { const r = await ctx.media.ensureId(id, label); if (r) return { url: r.url, alt: v.alt || r.alt }; }
    if (v.url) return resolveImage(ctx, v.url, label);
  }
  return null;
}

async function importBusiness(ctx: Ctx, it: WpItem) {
  const { report, snap, opts } = ctx;
  const label = `${it.type} #${it.id} "${it.title}"`;
  const legacyPath = legacyPathOf(it.link, snap);
  let existing = await db.business.findUnique({ where: { wpType_wpId: { wpType: it.type, wpId: it.id } } });
  if (!existing && legacyPath) {
    const byPath = await db.business.findUnique({ where: { legacyPath } });
    if (byPath && byPath.wpId === null) existing = byPath;
  }
  const desired = slugify(it.slug ? decodeURIComponent(it.slug) : it.title);
  if (!existing) {
    const bySlug = await db.business.findUnique({ where: { slug: desired } });
    if (bySlug && bySlug.wpId === null) {
      existing = bySlug;
      report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `matched existing local business "${bySlug.name}" by slug; only empty fields were filled` });
    }
  }

  const bizIds = new Set(ctx.snap.items.filter((x) => ctx.businessTypes.has(x.type)).map((x) => x.id));
  const mapped = mapBusinessFields(it.meta, bizIds);
  const allKeys = flattenMeta(it.meta).map(([k]) => k).filter((k) => !k.includes("."));
  trackUnmapped(ctx, it.type, allKeys.filter((k) => !mapped.usedKeys.some((u) => u === k || u.startsWith(`${k}.`))));

  const description = it.content ? await prepareHtml(ctx, it, it.content, label) : null;
  const feat = await featured(ctx, it, label);
  const logo = await resolveImage(ctx, mapped.logo, `${label} (logo)`);
  const seo = await seoFor(ctx, it, label);
  const gallery: { url: string; alt?: string }[] = [];
  for (const g of mapped.gallery) { const r = await resolveImage(ctx, g, `${label} (gallery)`); if (r) gallery.push(r); }

  // business categories from every non-tag taxonomy on the listing (+ scraped class names)
  const catIds = new Set<string>();
  for (const [tax, ids] of Object.entries(it.terms)) for (const id of ids) { const c = ctx.bizCatIdByTerm.get(`${tax}:${id}`); if (c) catIds.add(c); }
  if (it.meta.__scraped && Array.isArray(it.meta.__classes)) {
    for (const cls of it.meta.__classes as string[]) for (const tax of ctx.businessTaxonomies) {
      if (!cls.startsWith(`${tax}-`)) continue;
      const t = (ctx.termIdsByTax.get(tax) ?? []).find((x) => x.slug === cls.slice(tax.length + 1));
      const c = t && ctx.bizCatIdByTerm.get(`${tax}:${t.id}`);
      if (c) catIds.add(c);
    }
  }

  const fields: BizFields = {
    name: it.title.slice(0, 300) || "(untitled)",
    description,
    tagline: mapped.tagline?.slice(0, 300) ?? null,
    logoUrl: logo?.url ?? null,
    coverUrl: feat?.url ?? null,
    address: mapped.address?.slice(0, 300) ?? null,
    city: mapped.city?.slice(0, 120) ?? null,
    state: mapped.state ? (/^ohio$/i.test(mapped.state) ? "OH" : mapped.state.slice(0, 40)) : null,
    zip: mapped.zip?.slice(0, 20) ?? null,
    latitude: Number.isFinite(mapped.latitude) ? mapped.latitude! : null,
    longitude: Number.isFinite(mapped.longitude) ? mapped.longitude! : null,
    phone: mapped.phone?.slice(0, 60) ?? null,
    email: mapped.email?.slice(0, 200) ?? null,
    website: mapped.website?.slice(0, 500) ?? null,
    socials: Object.keys(mapped.socials).length ? (mapped.socials as Prisma.InputJsonValue) : null,
    hours: mapped.hours ? (mapped.hours as unknown as Prisma.InputJsonValue) : null,
    seoTitle: seo.seoTitle, seoDescription: seo.seoDescription,
    status: businessStatus(it.status),
  };

  const prevMeta = (existing?.wpMeta ?? {}) as Record<string, unknown>;
  const prevImport = prevMeta.__import as { hash?: string } | undefined;
  const locallyEdited = !!existing && (!prevImport?.hash || prevImport.hash !== bizSnapshot(existing as unknown as Record<string, unknown>));
  const preserve = locallyEdited && !opts.force;

  const { slug, changed } = existing ? { slug: existing.slug, changed: false } : await uniqueSlug("business", desired);
  if (changed) report.duplicates.push({ type: it.type, wpId: it.id, title: it.title, detail: `slug "${desired}" already taken; stored as "${slug}"` });

  // when preserving local edits, only fill fields that are empty locally
  const finalFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined) continue;
    if (preserve && existing) {
      const cur = (existing as unknown as Record<string, unknown>)[k];
      if (cur !== null && cur !== undefined && cur !== "") continue;
    }
    finalFields[k] = v;
  }
  // a field removed in WordPress is cleared too (unless the record has local edits)
  if (!preserve && existing) for (const k of Object.keys(fields)) if (!(k in finalFields) && k !== "status" && k !== "state") finalFields[k] = k === "socials" || k === "hours" ? Prisma.DbNull : null;

  const wpMetaBase = {
    source: snap.source, base: snap.baseUrl, link: it.link ?? null, wpStatus: it.status, terms: termsOf(ctx, it), meta: it.meta,
    originalContent: it.content, excerptHtml: it.excerpt ?? null, seo: it.seo ?? null,
    mapped: { usedKeys: mapped.usedKeys, hoursText: mapped.hoursText ?? null, gallery: gallery.map((g) => g.url) },
  };
  const data = {
    ...finalFields,
    wpId: it.id, wpType: it.type,
    legacyPath: legacyPath && !(await db.business.findFirst({ where: { legacyPath, NOT: { id: existing?.id ?? "" } }, select: { id: true } })) ? legacyPath : existing?.legacyPath ?? null,
    publishedAt: existing?.publishedAt ?? (it.status === "publish" ? dateOrNull(it.dateGmt) : null),
  } as Prisma.BusinessUncheckedCreateInput;

  let row = existing
    ? await db.business.update({ where: { id: existing.id }, data: { ...data, categories: { connect: [...catIds].map((id) => ({ id })) } } })
    : await db.business.create({ data: { ...data, slug, categories: { connect: [...catIds].map((id) => ({ id })) } } });
  // remember what the importer wrote, to detect later local edits
  row = await db.business.update({
    where: { id: row.id },
    data: { wpMeta: { ...wpMetaBase, __import: { hash: preserve ? prevImport?.hash ?? null : bizSnapshot(row as unknown as Record<string, unknown>), at: new Date().toISOString(), wpModified: it.modifiedGmt ?? null } } as Prisma.InputJsonValue },
  });
  if (gallery.length) {
    const have = new Set((await db.businessPhoto.findMany({ where: { businessId: row.id }, select: { url: true } })).map((p) => p.url));
    const add = gallery.filter((g) => !have.has(g.url));
    if (add.length) await db.businessPhoto.createMany({ data: add.map((g, i) => ({ businessId: row.id, url: g.url, alt: g.alt ?? null, sortOrder: have.size + i })) });
  }
  if (existing) report.imported.updated++; else report.imported.created++;
  report.imported.businesses++;
  const path = businessHref(row);
  ctx.recordPaths.add(path);
  if (row.legacyPath) ctx.recordPaths.add(row.legacyPath);
  if (preserve) {
    report.preservedLocalEdits.push({ type: it.type, wpId: it.id, title: it.title, reason: "fields changed locally since the last import; only empty fields were filled" });
    record(ctx, it, "preserved_local_edits", "Business", row.id, path);
  } else record(ctx, it, "imported", "Business", row.id, path);
  ctx.processed.push({ kind: "business", id: row.id, item: it, path, content: description ?? "" });
  noteUrlChange(ctx, it, path);
}

// ───────────────────────────── linking ─────────────────────────────

const normName = (s: string) => ` ${s.toLowerCase().replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;

async function linkArticlesToBusinesses(ctx: Ctx) {
  const businesses = ctx.processed.filter((p) => p.kind === "business");
  if (!businesses.length) return;
  const bizRows = await db.business.findMany({ where: { id: { in: businesses.map((b) => b.id) } }, select: { id: true, slug: true, name: true, legacyPath: true, wpId: true } });
  const byPath = new Map<string, string>();
  const byWpId = new Map<number, string>();
  for (const b of bizRows) {
    byPath.set(businessHref(b), b.id);
    if (b.legacyPath) byPath.set(b.legacyPath, b.id);
    if (b.wpId) byWpId.set(b.wpId, b.id);
  }
  const hosts = siteHostsOf(ctx.snap);
  const bizWpIds = new Set(byWpId.keys());
  const links: { articleId: string; businessId: string }[] = [];
  for (const a of ctx.processed.filter((p) => p.kind === "article")) {
    const found = new Set<string>();
    for (const href of [...extractHrefs(a.content), ...extractHrefs(a.item.content)]) {
      let u: URL;
      try { u = new URL(href, ctx.snap.baseUrl + "/"); } catch { continue; }
      if (!hosts.has(u.host)) continue;
      const id = byPath.get(normalizePath(u.pathname));
      if (id) found.add(id);
    }
    for (const wpId of relationshipIds(a.item.meta, bizWpIds)) { const id = byWpId.get(wpId); if (id) found.add(id); }
    const title = normName(a.item.title);
    for (const b of bizRows) {
      const n = normName(b.name);
      if (n.trim().length >= 5 && title.includes(n)) found.add(b.id);
    }
    for (const businessId of found) links.push({ articleId: a.id, businessId });
  }
  if (links.length) {
    const r = await db.articleBusiness.createMany({ data: links, skipDuplicates: true });
    ctx.log(`  ${links.length} article↔business link(s) (${r.count} new)`);
  }
  ctx.report.imported.articleBusinessLinks = links.length;
  const spot = await db.business.updateMany({
    where: { id: { in: bizRows.map((b) => b.id) }, isSpotlighted: false, articles: { some: { article: { kind: "SPOTLIGHT", status: "PUBLISHED", deletedAt: null } } } },
    data: { isSpotlighted: true },
  });
  ctx.report.imported.spotlightedBusinesses = await db.business.count({ where: { id: { in: bizRows.map((b) => b.id) }, isSpotlighted: true } });
  if (spot.count) ctx.log(`  ${spot.count} business(es) newly marked as spotlighted`);
}

// ───────────────────────────── branding ─────────────────────────────

async function importBranding(ctx: Ctx) {
  const { snap, report, media } = ctx;
  const current = async (key: string) => {
    const row = await db.setting.findUnique({ where: { key } });
    return row && row.value !== null && row.value !== "" ? row.value : null;
  };
  /** True when the current setting is the file a previous run imported from `src`. */
  const isOurs = async (value: unknown, src: string | undefined, id?: number) => {
    if (typeof value !== "string") return false;
    const m = await db.media.findFirst({ where: { url: value }, select: { sourceUrl: true, wpId: true } });
    return !!m && ((!!id && m.wpId === id) || (!!src && media.key(m.sourceUrl ?? "") === media.key(src)));
  };
  let logoNew: string | null = null;
  let iconNew: string | null = null;
  if (snap.site.logoUrl) {
    const cur = await current("logoUrl");
    if (cur && (await isOurs(cur, snap.site.logoUrl, snap.site.logoId))) { report.branding.logo = `already imported (${cur})`; await media.ensure(snap.site.logoUrl, { context: "site logo" }); }
    else if (cur) report.branding.logo = `kept the existing logo (WordPress logo: ${snap.site.logoUrl})`;
    else {
      logoNew = snap.site.logoId ? (await media.ensureId(snap.site.logoId, "site logo"))?.url ?? null : null;
      logoNew ??= await media.ensure(snap.site.logoUrl, { context: "site logo" });
      if (logoNew) { await saveSettings({ logoUrl: logoNew }); report.branding.logo = `imported ${snap.site.logoUrl} → ${logoNew}`; }
      else report.branding.logo = `download failed: ${snap.site.logoUrl}`;
    }
  }
  if (snap.site.iconUrl || snap.site.iconId) {
    const src = snap.site.iconUrl ?? `attachment #${snap.site.iconId}`;
    const cur = await current("faviconUrl");
    if (cur && (await isOurs(cur, snap.site.iconUrl, snap.site.iconId))) report.branding.icon = `already imported (${cur})`;
    else if (cur) report.branding.icon = `kept the existing favicon (WordPress icon: ${src})`;
    else {
      iconNew = snap.site.iconId ? (await media.ensureId(snap.site.iconId, "site icon"))?.url ?? null : null;
      if (!iconNew && snap.site.iconUrl) iconNew = media.isSiteFile(snap.site.iconUrl) ? await media.ensure(snap.site.iconUrl, { context: "site icon" }) : null;
      if (iconNew) { await saveSettings({ faviconUrl: iconNew }); report.branding.icon = `imported ${src} → ${iconNew}`; }
      else report.branding.icon = `download failed: ${src}`;
    }
  }
  const info = { name: snap.site.name ?? null, description: snap.site.description ?? null, url: snap.site.url ?? snap.baseUrl, logoSourceUrl: snap.site.logoUrl ?? null, iconSourceUrl: snap.site.iconUrl ?? null, importedAt: new Date().toISOString(), source: snap.source };
  await db.setting.upsert({ where: { key: "wpSiteInfo" }, create: { key: "wpSiteInfo", value: info }, update: { value: info } });
}

// ───────────────────────────── redirects ─────────────────────────────

async function upsertRedirect(ctx: Ctx, fromPath: string, toPath: string) {
  const { report } = ctx;
  if (!fromPath || fromPath === toPath) return;
  if (!fromPath.includes("?") && ctx.recordPaths.has(fromPath)) { report.redirects.skippedConflict++; return; }
  const existing = await db.redirect.findUnique({ where: { fromPath } });
  if (existing) {
    if (existing.source !== "migration") { report.redirects.skippedManual++; return; }
    if (existing.toPath === toPath && existing.statusCode === 301) { report.redirects.unchanged++; report.redirects.list.push({ from: fromPath, to: toPath }); return; }
    await db.redirect.update({ where: { id: existing.id }, data: { toPath, statusCode: 301 } });
    report.redirects.updated++;
  } else {
    await db.redirect.create({ data: { fromPath, toPath, statusCode: 301, source: "migration" } });
    report.redirects.created++;
  }
  report.redirects.list.push({ from: fromPath, to: toPath });
}

async function createRedirects(ctx: Ctx) {
  const { snap } = ctx;
  for (const p of ctx.processed) {
    const it = p.item;
    if (!["publish", "private"].includes(it.status)) continue;
    const old = legacyPathOf(it.link, snap);
    if (old && old !== p.path) await upsertRedirect(ctx, old, p.path);
    // WordPress shortlinks: /?p=123 and /?page_id=123
    await upsertRedirect(ctx, `/?p=${it.id}`, p.path);
    if (it.type === "page") await upsertRedirect(ctx, `/?page_id=${it.id}`, p.path);
  }
  // term archives
  for (const t of snap.terms) {
    let from: string | null = null;
    if (t.link) { try { const u = new URL(t.link); if (siteHostsOf(snap).has(u.host)) from = normalizePath(u.pathname); } catch { /* ignore */ } }
    if (t.taxonomy === "category") {
      const cat = ctx.categoryIdByWp.has(t.id) ? await db.category.findUnique({ where: { id: ctx.categoryIdByWp.get(t.id)! }, select: { slug: true } }) : null;
      if (cat) await upsertRedirect(ctx, from ?? `/category/${t.slug}/`, `/articles/?category=${cat.slug}`);
    } else if (t.taxonomy === "post_tag") {
      const tag = ctx.tagIdByWp.has(t.id) ? await db.tag.findUnique({ where: { id: ctx.tagIdByWp.get(t.id)! }, select: { slug: true } }) : null;
      if (tag) await upsertRedirect(ctx, from ?? `/tag/${t.slug}/`, `/articles/?tag=${tag.slug}`);
    } else if (ctx.bizCatIdByTerm.has(`${t.taxonomy}:${t.id}`)) {
      const bc = await db.businessCategory.findUnique({ where: { id: ctx.bizCatIdByTerm.get(`${t.taxonomy}:${t.id}`)! }, select: { slug: true } });
      if (bc && from) await upsertRedirect(ctx, from, `/businesses/?category=${bc.slug}`);
    }
  }
  for (const a of snap.authors) {
    let from = a.slug ? `/author/${a.slug}/` : null;
    if (a.link) { try { from = normalizePath(new URL(a.link).pathname); } catch { /* ignore */ } }
    if (from && from.startsWith("/author/")) await upsertRedirect(ctx, from, "/articles/");
  }
  for (const [from, to] of [["/feed/", "/articles/"], ["/comments/feed/", "/articles/"]] as const) {
    if (!ctx.recordPaths.has(from)) await upsertRedirect(ctx, from, to);
  }
  // archive of the business CPT itself (e.g. /business/ or /listings/)
  for (const t of ctx.businessTypes) {
    const sample = ctx.processed.find((p) => p.kind === "business" && p.item.type === t)?.item.link;
    const old = legacyPathOf(sample, snap);
    if (old) {
      const archive = old.replace(/[^/]+\/$/, "");
      if (archive !== "/" && archive !== old) await upsertRedirect(ctx, archive, "/businesses/");
    }
  }
}

// ───────────────────────────── broken links ─────────────────────────────

async function checkLinks(ctx: Ctx) {
  const hosts = siteHostsOf(ctx.snap);
  const redirects = new Set((await db.redirect.findMany({ select: { fromPath: true } })).map((r) => r.fromPath));
  const businessSlugs = new Set((await db.business.findMany({ where: { deletedAt: null }, select: { slug: true } })).map((b) => b.slug));
  const known = new Set([...ctx.recordPaths]);
  for (const a of await db.article.findMany({ where: { legacyPath: { not: null }, deletedAt: null }, select: { legacyPath: true } })) known.add(a.legacyPath!);
  for (const p of await db.page.findMany({ where: { deletedAt: null }, select: { legacyPath: true, slug: true } })) known.add(pageHref(p));
  const seen = new Set<string>();
  for (const p of ctx.processed) {
    for (const href of extractHrefs(p.content)) {
      if (!href || /^(#|mailto:|tel:|sms:|javascript:|data:)/i.test(href)) continue;
      let u: URL;
      try { u = new URL(href, ctx.snap.baseUrl + p.path); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      const relative = !/^[a-z]+:/i.test(href) && !href.startsWith("//");
      if (!relative && !hosts.has(u.host)) continue;
      if (u.pathname.includes("/wp-content/")) continue; // reported under missing files
      if (INTERNAL_PATH_SKIP.test(u.pathname)) continue;
      const path = normalizePath(u.pathname);
      const withQuery = u.search ? `/${u.search}` : "";
      if (path === "/" && !u.search) continue;
      if (known.has(path) || redirects.has(path) || (withQuery && redirects.has(withQuery))) continue;
      const biz = path.match(/^\/business\/([^/]+)\/$/);
      if (biz && businessSlugs.has(biz[1])) continue;
      if (APP_ROUTES.has(path) || APP_ROUTE_PREFIXES.some((r) => path.startsWith(r))) continue;
      if (path.startsWith("/page/") || /^\/\d{4}\/(\d{2}\/)?(\d{2}\/)?$/.test(path)) continue; // pagination / date archives
      const k = `${p.path}\u0000${href}`;
      if (seen.has(k)) continue;
      seen.add(k);
      ctx.report.brokenLinks.push({ from: p.path, href });
    }
  }
}

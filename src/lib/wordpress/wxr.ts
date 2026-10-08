/**
 * WordPress eXtended RSS (Tools → Export) parser → normalized WpSnapshot.
 * A WXR export contains every status (draft, future, pending, private),
 * every post type, raw postmeta (ACF, Yoast, directory plugins) and terms.
 */
import { XMLParser } from "fast-xml-parser";
import { decodeEntities } from "./html";
import { maybeUnserialize } from "./php-unserialize";
import { INTERNAL_TYPES } from "./rest-client";
import type { WpAuthor, WpItem, WpMedia, WpMenu, WpSnapshot, WpTerm } from "./types";
import { fromDateInput } from "@/lib/utils";

type X = Record<string, unknown>;
const arr = <T = X>(v: unknown): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const txt = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return txt((v as X)["#text"] ?? "");
  return String(v);
};

/** Stable synthetic id for terms referenced by slug only (negative = not a real WP id). */
function syntheticId(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return -Math.abs(h || 1);
}

function wpDate(gmt: string, local: string): string | undefined {
  if (gmt && !gmt.startsWith("0000")) return new Date(gmt.replace(" ", "T") + "Z").toISOString();
  if (local && !local.startsWith("0000")) return fromDateInput(local.replace(" ", "T"))?.toISOString();
  return undefined;
}

export function parseWxr(xml: string): WpSnapshot {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
    htmlEntities: true,
    isArray: (name) => ["item", "wp:postmeta", "category", "wp:author", "wp:category", "wp:tag", "wp:term", "wp:comment"].includes(name),
  });
  const doc = parser.parse(xml) as X;
  const channel = (doc.rss as X | undefined)?.channel as X | undefined;
  if (!channel) throw new Error("This file is not a WordPress WXR export (missing <rss><channel>).");

  const baseUrl = (txt(channel["wp:base_blog_url"]) || txt(channel.link) || txt(channel["wp:base_site_url"])).trim().replace(/\/+$/, "");
  const snap: WpSnapshot = {
    source: "wxr", baseUrl,
    site: { name: decodeEntities(txt(channel.title).trim()), description: decodeEntities(txt(channel.description).trim()), url: baseUrl },
    authenticated: true, types: [], taxonomies: [], terms: [], authors: [], media: [], items: [], menus: [],
    endpoints: [], requiresCredentials: [], warnings: [], totals: {},
  };

  // ── authors
  for (const a of arr(channel["wp:author"])) {
    const author: WpAuthor = {
      id: Number(txt(a["wp:author_id"])) || syntheticId(txt(a["wp:author_login"])),
      name: decodeEntities(txt(a["wp:author_display_name"]).trim() || txt(a["wp:author_login"]).trim()),
      slug: txt(a["wp:author_login"]).trim(),
      email: txt(a["wp:author_email"]).trim() || undefined,
    };
    snap.authors.push(author);
  }
  const authorByLogin = new Map(snap.authors.map((a) => [a.slug, a]));

  // ── terms
  const termKey = (tax: string, slug: string) => `${tax}::${slug}`;
  const termByKey = new Map<string, WpTerm>();
  const addTerm = (t: WpTerm) => { if (!termByKey.has(termKey(t.taxonomy, t.slug))) { termByKey.set(termKey(t.taxonomy, t.slug), t); snap.terms.push(t); } };
  const parentSlugs: [WpTerm, string][] = [];
  for (const c of arr(channel["wp:category"])) {
    const t: WpTerm = { id: Number(txt(c["wp:term_id"])) || 0, taxonomy: "category", slug: txt(c["wp:category_nicename"]).trim(), name: decodeEntities(txt(c["wp:cat_name"]).trim()), description: txt(c["wp:category_description"]).trim() || undefined };
    if (!t.id) t.id = syntheticId(termKey(t.taxonomy, t.slug));
    const p = txt(c["wp:category_parent"]).trim();
    if (p) parentSlugs.push([t, p]);
    addTerm(t);
  }
  for (const c of arr(channel["wp:tag"])) {
    const t: WpTerm = { id: Number(txt(c["wp:term_id"])) || 0, taxonomy: "post_tag", slug: txt(c["wp:tag_slug"]).trim(), name: decodeEntities(txt(c["wp:tag_name"]).trim()), description: txt(c["wp:tag_description"]).trim() || undefined };
    if (!t.id) t.id = syntheticId(termKey(t.taxonomy, t.slug));
    addTerm(t);
  }
  for (const c of arr(channel["wp:term"])) {
    const t: WpTerm = { id: Number(txt(c["wp:term_id"])) || 0, taxonomy: txt(c["wp:term_taxonomy"]).trim(), slug: txt(c["wp:term_slug"]).trim(), name: decodeEntities(txt(c["wp:term_name"]).trim()), description: txt(c["wp:term_description"]).trim() || undefined };
    if (!t.id) t.id = syntheticId(termKey(t.taxonomy, t.slug));
    const p = txt(c["wp:term_parent"]).trim();
    if (p) parentSlugs.push([t, p]);
    addTerm(t);
  }
  for (const [t, p] of parentSlugs) t.parent = termByKey.get(termKey(t.taxonomy, p))?.id;

  // ── items
  const rawItems = arr(channel.item);
  const attachments: X[] = [];
  const menuItems: { item: X; meta: Record<string, string>; menu?: string }[] = [];
  const typeCounts: Record<string, number> = {};
  const termTypes: Record<string, Set<string>> = {};

  for (const it of rawItems) {
    const type = txt(it["wp:post_type"]).trim() || "post";
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    const rawMeta: Record<string, string> = {};
    for (const pm of arr(it["wp:postmeta"])) rawMeta[txt(pm["wp:meta_key"]).trim()] = txt(pm["wp:meta_value"]);
    if (type === "attachment") { attachments.push({ ...it, __meta: rawMeta }); continue; }
    if (type === "nav_menu_item") {
      const menu = arr(it.category).find((c) => (c as X)["@_domain"] === "nav_menu") as X | undefined;
      menuItems.push({ item: it, meta: rawMeta, menu: menu ? decodeEntities(txt(menu).trim()) : undefined });
      continue;
    }
    if (INTERNAL_TYPES.has(type)) continue;

    const terms: Record<string, number[]> = {};
    for (const c of arr(it.category)) {
      const tax = String((c as X)["@_domain"] ?? "category");
      const slug = String((c as X)["@_nicename"] ?? "");
      if (!slug) continue;
      let t = termByKey.get(termKey(tax, slug));
      if (!t) { t = { id: syntheticId(termKey(tax, slug)), taxonomy: tax, slug, name: decodeEntities(txt(c).trim()) }; addTerm(t); }
      (terms[tax] ??= []).push(t.id);
      (termTypes[tax] ??= new Set()).add(type);
    }

    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawMeta)) {
      if (k.startsWith("_") && rawMeta[k.slice(1)] !== undefined && /^field_[a-z0-9]+$/i.test(v)) continue; // ACF field-key reference
      if (["_edit_lock", "_edit_last", "_pingme", "_encloseme", "_wp_old_date"].includes(k)) continue;
      meta[k] = maybeUnserialize(v);
    }
    const yoastTitle = rawMeta._yoast_wpseo_title || rawMeta.rank_math_title;
    const yoastDesc = rawMeta._yoast_wpseo_metadesc || rawMeta.rank_math_description;
    const ogImage = rawMeta["_yoast_wpseo_opengraph-image"] || rawMeta.rank_math_facebook_image;
    const creator = txt(it["dc:creator"]).trim();
    const author = authorByLogin.get(creator);
    const item: WpItem = {
      id: Number(txt(it["wp:post_id"])),
      type,
      status: txt(it["wp:status"]).trim() || "publish",
      title: decodeEntities(txt(it.title).trim()),
      slug: decodeURIComponent(txt(it["wp:post_name"]).trim()),
      link: txt(it.link).trim() || undefined,
      content: txt(it["content:encoded"]),
      contentIsRaw: true,
      excerpt: txt(it["excerpt:encoded"]).trim() || undefined,
      dateGmt: wpDate(txt(it["wp:post_date_gmt"]).trim(), txt(it["wp:post_date"]).trim()),
      modifiedGmt: wpDate(txt(it["wp:post_modified_gmt"]).trim(), txt(it["wp:post_modified"]).trim()),
      authorId: author?.id,
      authorName: author?.name ?? (creator || undefined),
      featuredMediaId: Number(rawMeta._thumbnail_id) || undefined,
      terms,
      meta,
      seo: yoastTitle || yoastDesc || ogImage ? { title: yoastTitle || undefined, description: yoastDesc || undefined, ogImage: ogImage || undefined } : undefined,
      parentId: Number(txt(it["wp:post_parent"])) || undefined,
      menuOrder: Number(txt(it["wp:menu_order"])) || 0,
    };
    snap.items.push(item);
  }

  // ── attachments → media
  for (const a of attachments) {
    const meta = a.__meta as Record<string, string>;
    const url = txt(a["wp:attachment_url"]).trim() || txt(a.guid).trim();
    const variants = new Set<string>([url]);
    const md = maybeUnserialize(meta._wp_attachment_metadata ?? "");
    if (md && typeof md === "object") {
      const m = md as X;
      const dir = url.replace(/[^/]+$/, "");
      if (m.sizes && typeof m.sizes === "object") for (const s of Object.values(m.sizes as X)) if (s && typeof (s as X).file === "string") variants.add(dir + (s as X).file);
      if (typeof m.original_image === "string") variants.add(dir + m.original_image);
    }
    const media: WpMedia = {
      id: Number(txt(a["wp:post_id"])),
      url,
      alt: meta._wp_attachment_image_alt || undefined,
      caption: txt(a["excerpt:encoded"]).trim() || undefined,
      title: decodeEntities(txt(a.title).trim()) || undefined,
      mimeType: undefined,
      variants: [...variants],
      parentId: Number(txt(a["wp:post_parent"])) || undefined,
    };
    snap.media.push(media);
  }

  // ── menus
  const titleById = new Map(snap.items.map((i) => [i.id, i]));
  const menus = new Map<string, WpMenu>();
  for (const { item, meta, menu } of menuItems) {
    const name = menu ?? "Menu";
    if (!menus.has(name)) menus.set(name, { name, items: [] });
    const obj = titleById.get(Number(meta._menu_item_object_id));
    const termObj = meta._menu_item_type === "taxonomy" ? snap.terms.find((t) => t.id === Number(meta._menu_item_object_id)) : undefined;
    menus.get(name)!.items.push({
      id: Number(txt(item["wp:post_id"])),
      title: decodeEntities(txt(item.title).trim()) || obj?.title || termObj?.name || "",
      url: meta._menu_item_url || obj?.link || termObj?.link || "",
      parent: Number(meta._menu_item_menu_item_parent) || undefined,
      order: Number(txt(item["wp:menu_order"])) || 0,
    });
  }
  snap.menus = [...menus.values()];

  // ── types / taxonomies inventory
  for (const [name, count] of Object.entries(typeCounts)) {
    snap.types.push({ name, label: name, count });
    snap.totals[name] = count;
  }
  const taxNames = new Set(snap.terms.map((t) => t.taxonomy));
  for (const name of taxNames) {
    snap.taxonomies.push({ name, label: name, types: [...(termTypes[name] ?? [])] });
    snap.totals[`term:${name}`] = snap.terms.filter((t) => t.taxonomy === name).length;
  }
  const comments = rawItems.reduce((n, it) => n + arr(it["wp:comment"]).length, 0);
  if (comments) snap.totals.comment = comments;
  return snap;
}

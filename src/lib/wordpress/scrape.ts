/**
 * Best-effort reader for public WordPress HTML pages. Only used for post types
 * that are listed in the sitemap but hidden from the REST API. Content is
 * copied verbatim from the theme's `.entry-content` container.
 */
import { decodeEntities, htmlToText } from "./html";
import type { WpItem } from "./types";

function attr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : undefined;
}

function meta(html: string, key: string) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0];
    if (attr(t, "property") === key || attr(t, "name") === key) return attr(t, "content");
  }
  return undefined;
}

/** Inner HTML of the first element whose class list contains `cls` (balanced on the same tag name). */
export function innerHtmlByClass(html: string, cls: string): string | null {
  const re = new RegExp(`<([a-z0-9]+)\\b[^>]*class\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = start;
  let depth = 1;
  let t: RegExpExecArray | null;
  while ((t = tagRe.exec(html))) {
    if (t[0].endsWith("/>")) continue;
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, t.index).trim();
  }
  return null;
}

export function scrapePublicPage(html: string, url: string, type: string): WpItem | null {
  const shortlink = html.match(/<link[^>]*rel=["']shortlink["'][^>]*>/i)?.[0];
  const idStr = (shortlink && attr(shortlink, "href")?.match(/[?&]p=(\d+)/)?.[1])
    ?? html.match(/<body[^>]*class=["'][^"']*\b(?:postid|page-id)-(\d+)/i)?.[1]
    ?? html.match(/<article[^>]*\bid=["']post-(\d+)["']/i)?.[1];
  if (!idStr) return null;
  const h1 = html.match(/<h1[^>]*class=["'][^"']*\b(?:entry-title|page-title|post-title)\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = htmlToText(h1) || meta(html, "og:title") || htmlToText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  const content = innerHtmlByClass(html, "entry-content") ?? innerHtmlByClass(html, "post-content") ?? innerHtmlByClass(html, "elementor-widget-theme-post-content") ?? "";
  const articleTag = html.match(/<article\b[^>]*>/i)?.[0];
  const classes = (articleTag && attr(articleTag, "class")) || attr(html.match(/<body\b[^>]*>/i)?.[0] ?? "", "class") || "";
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  const pageTitle = htmlToText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  return {
    id: Number(idStr),
    type,
    status: "publish",
    title,
    slug,
    link: url,
    content,
    dateGmt: meta(html, "article:published_time"),
    modifiedGmt: meta(html, "article:modified_time"),
    featuredImageUrl: meta(html, "og:image"),
    terms: {},
    meta: { __scraped: true, __classes: classes.split(/\s+/).filter(Boolean) },
    seo: { title: pageTitle || undefined, description: meta(html, "description") ?? meta(html, "og:description"), ogImage: meta(html, "og:image") },
  };
}

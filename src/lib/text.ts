import { decodeEntities } from "./wordpress/html";

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/i;

/** True when a plain-text value still contains HTML entities such as "&amp;" or "&#8217;". */
export function hasHtmlEntities(s: string | null | undefined) {
  return !!s && ENTITY.test(s);
}

/**
 * Decode HTML entities in a PLAIN-TEXT value (names, titles), including
 * double-encoded ones ("&amp;amp;" → "&"). The result is plain text: render it
 * as React text (which escapes it) — never with dangerouslySetInnerHTML.
 */
export function decodePlainText(s: string | null | undefined): string {
  let out = s ?? "";
  for (let i = 0; i < 3 && ENTITY.test(out); i++) {
    const next = decodeEntities(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Escape a plain-text value for interpolation into HTML (emails, raw markup). */
export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Single-line plain text for email subjects/headers (no CR/LF). */
export function oneLine(s: string | null | undefined, max = 150): string {
  return (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
}

/**
 * Collapse double-encoded entities in an HTML string ("&amp;amp;" → "&amp;",
 * "&amp;#8217;" → "&#8217;"). Only rewrites "&amp;" directly followed by a
 * complete entity reference, so the result is still escaped HTML — it can
 * never create tags or attributes. Always run the result through the
 * sanitizer before rendering it as HTML.
 */
export function collapseDoubleEncoded(html: string | null | undefined): string {
  let out = html ?? "";
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/&amp;(#x[0-9a-f]+;|#\d+;|[a-z][a-z0-9]*;)/gi, "&$1");
    if (next === out) break;
    out = next;
  }
  return out;
}

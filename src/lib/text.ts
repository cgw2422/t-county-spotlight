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

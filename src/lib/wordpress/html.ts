/**
 * HTML helpers for WordPress content. Nothing here rewrites wording: these
 * functions only decode entities in plain-text fields, rewrite URLs, and
 * reproduce WordPress's own display filters (wpautop, [caption], [gallery])
 * for raw WXR content.
 */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™",
  laquo: "«", raquo: "»", bull: "•", middot: "·", eacute: "é", egrave: "è", aacute: "á", ntilde: "ñ",
  uuml: "ü", ouml: "ö", auml: "ä", deg: "°", frac12: "½", times: "×", prime: "′", Prime: "″",
};

/** Decode HTML entities for plain-text fields (titles, term names). */
export function decodeEntities(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return m;
      try { return String.fromCodePoint(n); } catch { return m; }
    }
    return NAMED[code] ?? NAMED[code.toLowerCase()] ?? m;
  });
}

/** Plain text from a short HTML fragment (titles, captions). */
export function htmlToText(s: string | null | undefined): string {
  if (!s) return "";
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Port of WordPress's wpautop() — only used for raw classic-editor content from WXR. */
export function wpautop(text: string): string {
  if (!text.trim()) return "";
  if (/<!--\s*wp:/.test(text)) return text; // block editor content already has markup
  let pee = text + "\n";
  const pre: string[] = [];
  pee = pee.replace(/<pre[\s\S]*?<\/pre>/gi, (m) => { pre.push(m); return `<pre wp-pre-tag-${pre.length - 1}></pre>`; });
  pee = pee.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, "\n\n");
  const blocks = "(?:table|thead|tfoot|caption|col|colgroup|tbody|tr|td|th|div|dl|dd|dt|ul|ol|li|pre|form|map|area|blockquote|address|math|style|p|h[1-6]|hr|fieldset|legend|section|article|aside|hgroup|header|footer|nav|figure|figcaption|details|menu|summary|iframe|video|audio|picture|source)";
  pee = pee.replace(new RegExp(`(<${blocks}[\\s/>])`, "gi"), "\n\n$1");
  pee = pee.replace(new RegExp(`(</${blocks}>)`, "gi"), "$1\n\n");
  pee = pee.replace(/\r\n|\r/g, "\n");
  pee = pee.replace(/\n\n+/g, "\n\n");
  const parts = pee.split(/\n\s*\n/).filter((p) => p.trim() !== "");
  pee = parts.map((p) => `<p>${p.replace(/^\n*|\n*$/g, "")}</p>\n`).join("");
  pee = pee.replace(/<p>\s*<\/p>/g, "");
  pee = pee.replace(new RegExp(`<p>\\s*(</?${blocks}[^>]*>)\\s*</p>`, "gi"), "$1");
  pee = pee.replace(new RegExp(`<p>\\s*(</?${blocks}[^>]*>)`, "gi"), "$1");
  pee = pee.replace(new RegExp(`(</?${blocks}[^>]*>)\\s*</p>`, "gi"), "$1");
  pee = pee.replace(/<p>([^<]+)<\/(div|address|form)>/gi, "<p>$1</p></$2>");
  pee = pee.replace(/(?<!<br \/>)[ \t]*\n/g, "<br />\n");
  pee = pee.replace(new RegExp(`(</?${blocks}[^>]*>)\\s*<br />`, "gi"), "$1");
  pee = pee.replace(/<br \/>(\s*<\/?(?:p|li|div|dl|dd|dt|th|pre|td|ul|ol)[^>]*>)/gi, "$1");
  pee = pee.replace(/\n<\/p>$/g, "</p>");
  pee = pee.replace(/<pre wp-pre-tag-(\d+)><\/pre>/g, (_m, i) => pre[Number(i)]);
  return pee.trim();
}

function shortcodeAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of s.matchAll(/([a-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

/**
 * Expand the core [caption] and [gallery] shortcodes the way WordPress renders
 * them. Any other shortcode is left untouched and listed so the report can
 * flag it.
 */
export function expandCoreShortcodes(html: string, mediaById: (id: number) => { url: string; alt?: string; caption?: string } | undefined) {
  let out = html.replace(/\[caption([^\]]*)\]([\s\S]*?)\[\/caption\]/gi, (_m, attrs: string, inner: string) => {
    const a = shortcodeAttrs(attrs);
    const imgMatch = inner.match(/^\s*((?:<a [^>]+>\s*)?<img[^>]+>(?:\s*<\/a>)?)([\s\S]*)$/i);
    const media = imgMatch ? imgMatch[1] : inner;
    const caption = (a.caption ?? (imgMatch ? imgMatch[2] : "")).trim();
    const cls = ["wp-caption", a.align].filter(Boolean).join(" ");
    const style = a.width ? ` style="width: ${a.width}px"` : "";
    return `<figure${a.id ? ` id="${a.id}"` : ""}${style} class="${cls}">${media.trim()}${caption ? `<figcaption class="wp-caption-text">${caption}</figcaption>` : ""}</figure>`;
  });
  out = out.replace(/\[gallery([^\]]*)\]/gi, (m, attrs: string) => {
    const a = shortcodeAttrs(attrs);
    if (!a.ids) return m;
    const imgs = a.ids.split(",").map((x) => mediaById(Number(x.trim()))).filter(Boolean) as { url: string; alt?: string; caption?: string }[];
    if (!imgs.length) return m;
    const cols = Number(a.columns) || 3;
    return `<figure class="wp-block-gallery gallery columns-${cols}">${imgs
      .map((i) => `<figure class="gallery-item"><img src="${i.url}" alt="${(i.alt ?? "").replace(/"/g, "&quot;")}" />${i.caption ? `<figcaption>${i.caption}</figcaption>` : ""}</figure>`)
      .join("")}</figure>`;
  });
  return out;
}

/** Names of shortcodes still present in content (outside of code/pre). */
export function findShortcodes(html: string): string[] {
  const names = new Set<string>();
  const stripped = html.replace(/<(pre|code)[\s\S]*?<\/\1>/gi, "");
  for (const m of stripped.matchAll(/\[([a-z][a-z0-9_-]{1,40})(?=[\s\]\/])[^\]]*\]/gi)) {
    const n = m[1].toLowerCase();
    // skip common false positives like [1], [sic], [edit]
    if (["sic", "edit", "note", "update", "x", "i"].includes(n)) continue;
    names.add(n);
  }
  return [...names];
}

/** Every href value in an HTML string. */
export function extractHrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)) out.push(decodeEntities(m[2] ?? m[3] ?? ""));
  return out;
}

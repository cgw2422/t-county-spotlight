/**
 * Newsletter designer — email renderer (pure TS: used by the live preview in the browser, the saved preview,
 * "Copy HTML" and the beehiiv draft). Email-safe: table layout, inline styles only (beehiiv strips <style> and
 * <link>), fluid widths with no media queries, web fonts with system fallbacks.
 */
import { LEGACY_TOC_LABELS, tocDefaults, tocPendingHint, type DesignContent, type EventItem, type Section, type SpotlightBusiness, type StoryItem } from "./types";

export type RenderContext = {
  /** "https://tcountyconnect.com" — relative image/link URLs are made absolute against it */
  siteUrl: string;
  /** Absolute URL of the colour logo for the masthead / footer */
  logoUrl: string | null;
  /** Current forecast card (preview, Copy HTML, snapshot mode). In the beehiiv draft the weather is an RSS block. */
  weather: { imageUrl: string; alt: string; linkUrl: string } | null;
  socials: { label: string; url: string }[];
  /** Admin preview: show the parts beehiiv adds (sponsor ad, beehiiv footer) as notes. */
  preview?: boolean;
};

export type DesignMeta = { title: string; previewText?: string | null; issueNumber?: number | null; issueDate: string; content: DesignContent };

export type Segment =
  | { kind: "html"; html: string }
  /** "Having trouble viewing this email? Read it online" — beehiiv fills {{live_url}} with this issue's web version. */
  | { kind: "readOnline" }
  | { kind: "weather"; headingHtml: string; snapshotHtml: string | null }
  | { kind: "sponsor" }
  /** A native beehiiv poll (inserted as a real poll block in the draft; never part of exported HTML). */
  | { kind: "poll"; headingHtml: string; pollId: string; previewHtml: string };

/** beehiiv merge tag for the published web version of the issue being sent. */
export const LIVE_URL_TAG = "{{live_url}}";
export const READ_ONLINE_TEXT = "Having trouble viewing this email?";
export const READ_ONLINE_LINK = "Read it online";

export const C = { navy: "#0B2340", green: "#387D14", orange: "#FF8508", offWhite: "#F7F8F5", text: "#1F2937", muted: "#5B6577", line: "#E3E6EA" } as const;
// Long words and URLs wrap instead of widening the email (no horizontal scrolling on phones).
const WRAP = "overflow-wrap:break-word;word-wrap:break-word;word-break:break-word;";
const HEAD = `font-family:Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;${WRAP}`;
const BODY = `font-family:'Open Sans','Segoe UI',Helvetica,Arial,sans-serif;${WRAP}`;
const TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"';

// ───────────── escaping & URLs ─────────────

export const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Plain text with line breaks kept. */
const text = (s: string | null | undefined) => esc(s).replace(/\r?\n/g, "<br>");

/** Turns bare web addresses in already-escaped text into links (trailing punctuation stays outside the link). */
export function linkify(escaped: string): string {
  return escaped.replace(/\bhttps?:\/\/[^\s<>"]+/g, (m) => {
    const trail = /[.,;:!?)\]'’”]+$/.exec(m)?.[0] ?? "";
    const url = trail ? m.slice(0, -trail.length) : m;
    return `<a href="${url}">${url}</a>${trail}`;
  });
}

/** Links bare URLs in sanitized HTML, leaving existing links and tags alone. */
const linkifyHtml = (html: string) => html.split(/(<a\b[\s\S]*?<\/a>|<[^>]+>)/).map((part) => (part.startsWith("<") ? part : linkify(part))).join("");

const BULLET = /^\s*(?:[*•\-–]|\d+[.)])\s+/;

/**
 * Plain text → editor HTML: each line becomes a paragraph, lines starting with "*", "-", "•" (or "1.") become
 * a bulleted (or numbered) list, and web addresses become links. Used for pasting and for older plain drafts.
 */
export function plainToHtml(input: string): string {
  const lines = String(input ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`); list = null; };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const b = BULLET.exec(line);
    if (b) {
      const tag = /\d/.test(b[0]) ? "ol" : "ul";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(linkify(esc(line.slice(b[0].length))));
      continue;
    }
    flush();
    out.push(`<p>${linkify(esc(line))}</p>`);
  }
  flush();
  return out.join("");
}

/** http(s) or mailto only; site-relative paths become absolute. Anything else → "". */
export function safeUrl(u: string | null | undefined, siteUrl: string): string {
  const v = String(u ?? "").trim();
  if (!v) return "";
  if (v.startsWith("/") && !v.startsWith("//")) return siteUrl.replace(/\/$/, "") + v;
  if (/^mailto:[^\s<>"]+$/i.test(v)) return v;
  try {
    const x = new URL(v);
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : "";
  } catch {
    return "";
  }
}

// ───────────── rich text (personal introduction) ─────────────

const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "a", "u", "ul", "ol", "li"]);
const HEADINGS = /^h[1-6]$/;

/**
 * Allowlist sanitizer for rich text: <p>, <br>, bold, italic, underline, lists and http(s)/mailto links (headings
 * become bold paragraphs).
 * Scripts, styles, comments, attributes and every other tag are removed; stray "<"/">" in text are escaped.
 */
export function sanitizeIntroHtml(html: string | null | undefined, siteUrl = "https://tcountyconnect.com"): string {
  let s = String(html ?? "").slice(0, 200_000);
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|iframe|object|embed|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, "");
  const out: string[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const textPart = (t: string) => t.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  while ((m = re.exec(s))) {
    out.push(textPart(s.slice(last, m.index)));
    last = re.lastIndex;
    const closing = m[1] === "/";
    let tag = m[2].toLowerCase();
    if (tag === "div") tag = "p";
    if (tag === "b") tag = "strong";
    if (tag === "i") tag = "em";
    if (HEADINGS.test(tag)) { out.push(closing ? "</strong></p>" : "<p><strong>"); continue; }
    if (!ALLOWED.has(tag)) continue;
    if (tag === "br") { if (!closing) out.push("<br>"); continue; }
    if (closing) { out.push(`</${tag}>`); continue; }
    if (tag === "a") {
      const h = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const raw = (h?.[1] ?? h?.[2] ?? h?.[3] ?? "").replace(/&amp;/g, "&");
      const href = safeUrl(raw, siteUrl);
      out.push(href ? `<a href="${esc(href)}">` : "<a>");
      continue;
    }
    out.push(`<${tag}>`);
  }
  out.push(textPart(s.slice(last)));
  return out.join("")
    .replace(/<p>\s*(<br>)?\s*<\/p>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** True when a stored text field holds editor formatting (HTML) rather than plain text. */
export const isRich = (s: string | null | undefined) => /<(p|br|strong|em|u|a|ul|ol|li)\b/i.test(String(s ?? ""));

/** Plain text → editor HTML (blank lines become paragraphs, single newlines <br>), so old values open nicely. */
export function toEditorHtml(s: string | null | undefined): string {
  const v = String(s ?? "");
  if (!v.trim() || isRich(v)) return v;
  return plainToHtml(v);
}

const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/**
 * Article cards never show full articles: a clean excerpt of up to 3 sentences (about 360 characters), cut at a
 * word boundary with an ellipsis if a single sentence runs long. Formatting is removed.
 */
export function excerpt(s: string | null | undefined, maxSentences = 3, maxChars = 360): string {
  const plain = decode(String(s ?? "").replace(/<(script|style|iframe|noscript|h[1-6]|figcaption)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<\/(p|li|h[1-6])>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
  if (!plain) return "";
  const sentences = plain.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*/g) ?? [plain];
  let out = "";
  for (const sent of sentences.slice(0, maxSentences)) {
    if (out && (out + sent).trim().length > maxChars) break;
    out += sent;
  }
  out = out.trim();
  if (out.length > maxChars) out = `${out.slice(0, maxChars).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "")}…`;
  return out;
}

type Tone = { size: number; color: string; link: string; gap?: number };

/** Adds email-safe inline styles to sanitized rich HTML. */
function styleRich(html: string, t: Tone) {
  const gap = t.gap ?? 14;
  const body = /^\s*<(p|ul|ol)>/.test(html) ? html : `<p>${html}</p>`;
  const p = `margin:0 0 ${gap}px;${BODY}font-size:${t.size}px;line-height:1.65;color:${t.color};`;
  return body
    .replace(/<p>/g, `<p style="${p}">`)
    .replace(/<(ul|ol)>/g, `<$1 style="margin:0 0 ${gap}px;padding:0 0 0 22px;${BODY}font-size:${t.size}px;line-height:1.65;color:${t.color};">`)
    .replace(/<li>/g, '<li style="margin:0 0 6px;">')
    .replace(/<a href=/g, `<a style="color:${t.link};text-decoration:underline;font-weight:600;" href=`)
    .replace(/<strong>/g, '<strong style="font-weight:700;">');
}

/** A text field as email HTML: rich (sanitized + styled) or plain (escaped, line breaks kept). */
function body(s: string | null | undefined, t: Tone, siteUrl: string, margin = "10px 0 0") {
  const v = String(s ?? "");
  if (!v.trim()) return "";
  if (isRich(v)) {
    const clean = sanitizeIntroHtml(v, siteUrl);
    return clean ? `<div style="margin:${margin};">${styleRich(linkifyHtml(clean), { ...t, gap: t.gap ?? 12 })}</div>` : "";
  }
  return `<p style="margin:${margin};${BODY}font-size:${t.size}px;line-height:1.6;color:${t.color};">${linkify(text(v))}</p>`;
}
const styleIntro = (html: string) => styleRich(html, { size: 16, color: C.text, link: C.green });

// ───────────── building blocks ─────────────

const wrap = (inner: string, pad = "0") => `<table ${TABLE}><tr><td style="padding:${pad};">${inner}</td></tr></table>`;

function sectionLabel(label: string) {
  if (!label.trim()) return "";
  return `<table ${TABLE}><tr><td style="padding:30px 0 14px;">` +
    `<div style="${HEAD}font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${C.green};">${esc(label)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:6px;"><tr><td style="width:44px;height:3px;background:${C.orange};font-size:0;line-height:0;">&nbsp;</td></tr></table>` +
    `</td></tr></table>`;
}

function button(label: string, href: string) {
  if (!href) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:16px;"><tr>` +
    `<td style="background:${C.orange};border-radius:6px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;${HEAD}font-size:15px;line-height:18px;color:${C.navy};text-decoration:none;">${esc(label || "Read More")} &rarr;</a></td>` +
    `</tr></table>`;
}

function img(src: string, alt: string, href: string, width: number, radius = 8) {
  if (!src) return "";
  const tag = `<img src="${esc(src)}" alt="${esc(alt)}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${radius}px;">`;
  return href ? `<a href="${esc(href)}" style="text-decoration:none;">${tag}</a>` : tag;
}

const headline = (t: string, href: string, size: number) => {
  const inner = esc(t);
  const style = `${HEAD}font-size:${size}px;line-height:1.25;color:${C.navy};text-decoration:none;`;
  return href ? `<a href="${esc(href)}" style="${style}">${inner}</a>` : `<span style="${style}">${inner}</span>`;
};

const formatIssueDate = (d: string) => {
  const x = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(x.getTime()) ? "" : new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(x);
};

function eventDateParts(d: string) {
  const x = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : null;
  if (!x || Number.isNaN(x.getTime())) return null;
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(x);
  return { month: f({ month: "short" }).toUpperCase(), day: f({ day: "numeric" }), weekday: f({ weekday: "short" }), long: f({ weekday: "short", month: "short", day: "numeric" }) };
}

// ───────────── sections ─────────────

function masthead(m: DesignMeta, ctx: RenderContext) {
  const parts = [m.issueNumber ? `Issue #${String(m.issueNumber).padStart(3, "0")}` : "", formatIssueDate(m.issueDate), "Tuscarawas County, Ohio"].filter(Boolean);
  const logo = ctx.logoUrl
    ? `<a href="${esc(ctx.siteUrl)}/" style="text-decoration:none;"><img src="${esc(ctx.logoUrl)}" alt="T County Connect" width="230" style="display:block;margin:0 auto;width:230px;max-width:72%;height:auto;border:0;"></a>`
    : `<span style="${HEAD}font-size:30px;color:${C.navy};">T County Connect</span>`;
  return `<table ${TABLE}>` +
    `<tr><td align="center" style="padding:22px 0 16px;">${logo}</td></tr>` +
    `<tr><td align="center" style="border-top:3px solid ${C.navy};border-bottom:1px solid ${C.navy};padding:9px 0;">` +
    `<span style="${HEAD}font-size:11px;line-height:16px;letter-spacing:1.5px;text-transform:uppercase;color:${C.navy};">${parts.map(esc).join(" &nbsp;&middot;&nbsp; ")}</span>` +
    `</td></tr></table>`;
}

function introHtml(s: Extract<Section, { type: "intro" }>, ctx: RenderContext) {
  const body = sanitizeIntroHtml(s.html, ctx.siteUrl);
  if (!body && !s.heading.trim()) return "";
  const head = s.heading.trim() ? `<div style="${HEAD}font-size:22px;line-height:1.3;color:${C.navy};margin:0 0 12px;">${esc(s.heading)}</div>` : "";
  const sig = s.signature.trim() ? `<p style="margin:4px 0 0;${BODY}font-size:16px;line-height:1.5;font-style:italic;color:${C.navy};">&mdash; ${esc(s.signature)}</p>` : "";
  return wrap(`${head}${body ? styleIntro(body) : ""}${sig}`, "26px 0 4px");
}

function featuredHtml(s: Extract<Section, { type: "featured" }>, ctx: RenderContext) {
  const st = s.story;
  if (!st || !st.title.trim()) return "";
  const href = safeUrl(st.url, ctx.siteUrl);
  const image = img(safeUrl(st.imageUrl, ctx.siteUrl), st.title, href, 600);
  return sectionLabel(s.heading) + wrap(
    (image ? `<div style="margin:0 0 16px;">${image}</div>` : "") +
    `<div>${headline(st.title, href, 26)}</div>` +
    excerptHtml(st.description, 16, C.text, ctx.siteUrl) +
    button(s.ctaLabel, href),
  );
}

/** Formatted text from older drafts → plain text with paragraph breaks kept. */
export function toPlainText(s: string | null | undefined): string {
  const v = String(s ?? "");
  if (!/<[a-z!/]/i.test(v)) return v.replace(/\r\n/g, "\n");
  return decode(v.replace(/<(script|style|iframe|noscript)\b[\s\S]*?<\/\1\s*>/gi, "").replace(/<\/(p|li|h[1-6]|div)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * A story's text in the email: exactly what you wrote, in full, with your paragraph breaks (blank line = new
 * paragraph). Picking an article fills this in with a 2–3 sentence excerpt that you can keep, edit or extend.
 */
const excerptHtml = (d: string, size: number, color: string, siteUrl = "https://tcountyconnect.com") => {
  if (isRich(d)) return body(d, { size, color, link: C.green, gap: 12 }, siteUrl, "10px 0 0");
  const paras = toPlainText(d).trim().split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p, i) => `<p style="margin:${i === 0 ? "10px" : "12px"} 0 0;${BODY}font-size:${size}px;line-height:1.6;color:${color};">${linkify(text(p))}</p>`).join("");
};

/** One story: full-width image, headline, short excerpt, Read more — a single column that reads well on phones. */
function storyRow(st: StoryItem, ctx: RenderContext, first: boolean) {
  const href = safeUrl(st.url, ctx.siteUrl);
  const src = safeUrl(st.imageUrl, ctx.siteUrl);
  return `<table ${TABLE}><tr><td style="padding:${first ? "0" : "22px"} 0 22px;${first ? "" : `border-top:1px solid ${C.line};`}">` +
    (src ? `<div style="margin:0 0 14px;">${img(src, st.title, href, 600, 8)}</div>` : "") +
    `<div>${headline(st.title, href, 19)}</div>` +
    excerptHtml(st.description, 15, C.text, ctx.siteUrl) +
    (href ? `<p style="margin:10px 0 0;${BODY}font-size:15px;line-height:1.4;"><a href="${esc(href)}" style="color:${C.green};font-weight:700;text-decoration:none;">Read more &rarr;</a></p>` : "") +
    `</td></tr></table>`;
}

function articlesHtml(s: Extract<Section, { type: "articles" }>, ctx: RenderContext) {
  const items = s.items.filter((i) => i.title.trim());
  if (!items.length) return "";
  return sectionLabel(s.heading) + items.map((it, i) => storyRow(it, ctx, i === 0)).join("");
}

function eventRow(e: EventItem, ctx: RenderContext, first: boolean) {
  const href = safeUrl(e.url, ctx.siteUrl);
  const d = eventDateParts(e.date);
  const badge = `<td width="62" valign="top" style="width:62px;padding:0 16px 0 0;">` +
    `<table role="presentation" width="62" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr><td align="center" style="background:${C.navy};border-radius:8px;padding:8px 0 9px;">` +
    `<div style="${HEAD}font-size:11px;line-height:13px;letter-spacing:1px;color:${C.orange};">${esc(d ? d.month : "DATE")}</div>` +
    `<div style="${HEAD}font-size:24px;line-height:28px;color:#FFFFFF;">${esc(d ? d.day : "—")}</div>` +
    `</td></tr></table></td>`;
  const meta = [d ? d.long : e.date.trim(), e.time.trim(), e.location.trim()].filter(Boolean).map(esc).join(" &nbsp;&middot;&nbsp; ");
  const src = safeUrl(e.imageUrl, ctx.siteUrl);
  return `<table ${TABLE}><tr><td style="padding:${first ? "0" : "16px"} 0 16px;${first ? "" : `border-top:1px solid ${C.line};`}">` +
    `<table ${TABLE}><tr>${badge}<td valign="top">` +
    `<div>${headline(e.title, href, 17)}</div>` +
    (meta ? `<p style="margin:5px 0 0;${BODY}font-size:13px;line-height:1.5;color:${C.muted};font-weight:600;">${meta}</p>` : "") +
    body(e.description, { size: 14, color: C.text, link: C.green, gap: 8 }, ctx.siteUrl, "8px 0 0") +
    (href ? `<p style="margin:8px 0 0;${BODY}font-size:14px;line-height:1.4;"><a href="${esc(href)}" style="color:${C.green};font-weight:700;text-decoration:none;">More info &rarr;</a></p>` : "") +
    `</td></tr></table>` +
    (src ? `<div style="margin:12px 0 0;">${img(src, e.title, href, 600, 8)}</div>` : "") +
    `</td></tr></table>`;
}

function eventsHtml(s: Extract<Section, { type: "events" }>, ctx: RenderContext) {
  const items = s.items.filter((i) => i.title.trim());
  if (!items.length) return "";
  return sectionLabel(s.heading) + items.map((e, i) => eventRow(e, ctx, i === 0)).join("");
}

function spotlightHtml(s: Extract<Section, { type: "spotlight" }>, ctx: RenderContext) {
  const b: SpotlightBusiness | null = s.business;
  if (!b || !b.name.trim()) return "";
  const href = safeUrl(b.url, ctx.siteUrl);
  const src = safeUrl(b.imageUrl, ctx.siteUrl);
  return sectionLabel(s.heading) + `<table ${TABLE}><tr><td style="background:${C.offWhite};border-radius:10px;padding:20px;">` +
    (src ? `<div style="margin:0 0 14px;">${img(src, b.name, href, 560, 8)}</div>` : "") +
    `<div>${headline(b.name, href, 21)}</div>` +
    body(b.text, { size: 15, color: C.text, link: C.green }, ctx.siteUrl, "8px 0 0") +
    (href ? `<p style="margin:12px 0 0;${BODY}font-size:15px;line-height:1.4;"><a href="${esc(href)}" style="color:${C.green};font-weight:700;text-decoration:none;">Visit ${esc(b.name)} &rarr;</a></p>` : "") +
    `</td></tr></table>`;
}

function promoHtml(s: Extract<Section, { type: "promo" }>, ctx: RenderContext) {
  if (!s.heading.trim() && !s.text.trim()) return "";
  const href = safeUrl(s.ctaUrl, ctx.siteUrl);
  return `<table ${TABLE}><tr><td style="padding:30px 0 0;"><table ${TABLE}><tr><td align="center" style="background:${C.navy};border-radius:10px;padding:28px 24px;">` +
    (s.heading.trim() ? `<div style="${HEAD}font-size:22px;line-height:1.3;color:#FFFFFF;">${esc(s.heading)}</div>` : "") +
    body(s.text, { size: 15, color: "#D5DCE6", link: "#FFFFFF" }, ctx.siteUrl) +
    (href ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:18px auto 0;"><tr><td style="background:${C.orange};border-radius:6px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;${HEAD}font-size:15px;line-height:18px;color:${C.navy};text-decoration:none;">${esc(s.ctaLabel || "Visit TCountyConnect.com")}</a></td></tr></table>` : "") +
    `</td></tr></table></td></tr></table>`;
}

function customHtml(s: Extract<Section, { type: "custom" }>, ctx: RenderContext) {
  const src = safeUrl(s.imageUrl, ctx.siteUrl);
  const imgHref = safeUrl(s.imageLink, ctx.siteUrl);
  const cta = safeUrl(s.ctaUrl, ctx.siteUrl);
  const inner =
    (src ? `<div style="margin:0 0 16px;">${img(src, s.title || s.heading, imgHref, 600)}</div>` : "") +
    (s.title.trim() ? `<div>${headline(s.title, imgHref || cta, 22)}</div>` : "") +
    body(s.html, { size: 16, color: C.text, link: C.green }, ctx.siteUrl, s.title.trim() ? "10px 0 0" : "0") +
    (cta ? button(s.ctaLabel || "Learn more", cta) : "");
  if (!inner) return "";
  return sectionLabel(s.heading) + wrap(inner, s.heading.trim() ? "0" : "26px 0 0");
}

// ───────────── overview, joke, poll ─────────────

/** Is this section actually in the email (enabled and with content)? Used by the overview. */
export function sectionPresent(s: Section, ctx: RenderContext): boolean {
  if (!s.enabled) return false;
  switch (s.type) {
    case "featured": return !!s.story?.title.trim();
    case "articles": case "events": return s.items.some((i) => i.title.trim());
    case "spotlight": return !!s.business?.name.trim();
    case "weather": return true;
    case "joke": return !!(s.setup.trim() && s.punchline.trim());
    case "poll": return !!s.poll?.id;
    case "custom": return !!customHtml(s, ctx);
    case "promo": return !!(s.heading.trim() || s.text.trim());
    default: return false;
  }
}

export type TocLine = { sectionId: string; label: string; defaultLabel: string };
export type TocOutlineItem = ({ kind: "line" } & TocLine) | { kind: "pending"; sectionId: string; hint: string };

/**
 * The overview in the newsletter's own order: every included section (stories one line each), built from the
 * issue's content (see tocDefaults). Move a section and its line moves too. Lines you reworded keep your wording;
 * the rest follow the content. Switched-on sections that are still empty come back as "pending" (editor only —
 * they're not in the email). `editing` keeps your text exactly as typed; the email trims it.
 */
export function tocOutline(content: DesignContent, ctx: RenderContext, toc?: Extract<Section, { type: "toc" }>, opts: { editing?: boolean } = {}): TocOutlineItem[] {
  const own = new Map((toc?.entries ?? []).map((e) => [e.sectionId, e.label === null || LEGACY_TOC_LABELS.has(e.label) ? null : e.label]));
  const out: TocOutlineItem[] = [];
  for (const x of content.sections) {
    if (x.type === "toc" || !x.enabled) continue;
    const items = sectionPresent(x, ctx) ? tocDefaults(x) : [];
    if (!items.length) {
      const hint = tocPendingHint(x);
      if (hint) out.push({ kind: "pending", sectionId: x.id, hint });
      continue;
    }
    for (const i of items) {
      const mine = own.get(i.key) ?? null;
      out.push({ kind: "line", sectionId: i.key, defaultLabel: i.label, label: mine === null ? i.label : opts.editing ? mine : mine.trim() || i.label });
    }
  }
  return out;
}

/** Overview lines that go in the email, in newsletter order. */
export function tocLines(content: DesignContent, ctx: RenderContext, toc?: Extract<Section, { type: "toc" }>, opts: { editing?: boolean } = {}): TocLine[] {
  return tocOutline(content, ctx, toc, opts).flatMap((i) => (i.kind === "line" ? [{ sectionId: i.sectionId, label: i.label, defaultLabel: i.defaultLabel }] : []));
}

function tocHtml(s: Extract<Section, { type: "toc" }>, content: DesignContent, ctx: RenderContext) {
  const lines = tocLines(content, ctx, s);
  if (lines.length < 2) return ""; // an overview of one thing isn't useful
  // Two columns where there's room, one on phones (inline-block wraps; no media queries needed).
  const items = lines.map((l) => `<div style="display:inline-block;vertical-align:top;width:100%;max-width:250px;padding:4px 0;${BODY}font-size:15px;line-height:1.45;color:${C.navy};">${esc(l.label)}</div>`).join("");
  return `<table ${TABLE}><tr><td style="padding:24px 0 0;"><table ${TABLE}><tr><td style="background:${C.offWhite};border-radius:10px;padding:16px 18px 14px;">` +
    `<div style="${HEAD}font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:${C.green};margin:0 0 8px;">${esc(s.heading || "In This T County Connect Issue")}</div>` +
    `<div style="font-size:0;line-height:0;">${items}</div>` +
    `</td></tr></table></td></tr></table>`;
}

function jokeHtml(s: Extract<Section, { type: "joke" }>) {
  if (!s.setup.trim() || !s.punchline.trim()) return "";
  return `<table ${TABLE}><tr><td style="padding:30px 0 0;"><table ${TABLE}><tr><td style="background:#FFF6EA;border-radius:12px;padding:22px 22px 20px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>` +
    `<td valign="middle" style="width:36px;padding:0 10px 0 0;"><div style="width:36px;height:36px;line-height:36px;border-radius:18px;background:#FFE3C2;text-align:center;font-size:20px;">&#128516;</div></td>` +
    `<td valign="middle"><div style="${HEAD}font-size:12px;line-height:16px;letter-spacing:2px;text-transform:uppercase;color:#C45E00;">${esc(s.heading || "Daily Dad Joke")}</div></td>` +
    `</tr></table>` +
    (s.intro.trim() ? `<p style="margin:12px 0 0;${BODY}font-size:14px;line-height:1.5;font-style:italic;color:${C.muted};">${esc(s.intro)}</p>` : "") +
    `<p style="margin:12px 0 0;${HEAD}font-size:19px;line-height:1.4;color:${C.navy};">${text(s.setup)}</p>` +
    `<table ${TABLE}><tr><td style="padding:14px 0 0;"><div style="border-top:2px dashed #F5C892;font-size:0;line-height:0;">&nbsp;</div></td></tr></table>` +
    `<p style="margin:12px 0 0;${BODY}font-size:17px;line-height:1.5;font-weight:700;color:${C.green};">${text(s.punchline)}</p>` +
    `</td></tr></table></td></tr></table>`;
}

function pollPreview(s: Extract<Section, { type: "poll" }>) {
  const p = s.poll!;
  const choices = p.choices.slice(0, 8).map((c) => `<div style="margin:6px auto 0;max-width:360px;border:1px solid #C5CCD6;border-radius:8px;padding:8px 12px;${BODY}font-size:14px;color:${C.navy};">${esc(c)}</div>`).join("");
  return `<table ${TABLE}><tr><td style="padding:4px 0 0;"><table ${TABLE}><tr><td align="center" style="border:2px dashed #C5CCD6;border-radius:10px;padding:16px;">` +
    `<div style="${HEAD}font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.muted};">Preview only · native beehiiv poll</div>` +
    `<div style="margin:8px 0 0;${HEAD}font-size:17px;line-height:1.35;color:${C.navy};">${esc(p.question || p.name)}</div>${choices}` +
    `<div style="margin:10px 0 0;${BODY}font-size:12px;line-height:1.5;color:${C.muted};">The real poll (voting and results) is added to the beehiiv draft. This box never appears in the email.</div>` +
    `</td></tr></table></td></tr></table>`;
}

function weatherSnapshot(ctx: RenderContext) {
  if (!ctx.weather) return null;
  return wrap(`<a href="${esc(ctx.weather.linkUrl)}" style="text-decoration:none;"><img src="${esc(ctx.weather.imageUrl)}" alt="${esc(ctx.weather.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:8px;"></a>`);
}

function footerHtml(ctx: RenderContext) {
  const socials = ctx.socials.map((s) => `<a href="${esc(s.url)}" style="color:${C.navy};font-weight:700;text-decoration:none;">${esc(s.label)}</a>`).join(" &nbsp;&middot;&nbsp; ");
  const logo = ctx.logoUrl ? `<img src="${esc(ctx.logoUrl)}" alt="T County Connect" width="150" style="display:block;margin:0 auto 12px;width:150px;max-width:50%;height:auto;border:0;">` : "";
  return `<table ${TABLE}><tr><td align="center" style="padding:34px 0 10px;border-top:1px solid ${C.line};margin-top:30px;">` +
    `<div style="height:30px;line-height:30px;font-size:0;">&nbsp;</div>${logo}` +
    `<p style="margin:0;${BODY}font-size:13px;line-height:1.6;color:${C.muted};">Bringing local people, businesses, and community information together across Tuscarawas County, Ohio.</p>` +
    `<p style="margin:10px 0 0;${BODY}font-size:13px;line-height:1.6;"><a href="${esc(ctx.siteUrl)}/" style="color:${C.green};font-weight:700;text-decoration:none;">TCountyConnect.com</a>${socials ? ` &nbsp;&middot;&nbsp; ${socials}` : ""}</p>` +
    `</td></tr></table>`;
}

// ───────────── public API ─────────────

/**
 * The issue as beehiiv-ready pieces, in order: HTML runs, the weather (an RSS block in beehiiv) and the sponsor
 * slot (where you add your Ad Network ad in beehiiv). Disabled and empty sections are skipped.
 */
export function renderSegments(m: DesignMeta, ctx: RenderContext): Segment[] {
  const segs: Segment[] = [{ kind: "readOnline" }];
  let buf = masthead(m, ctx);
  const flush = () => { if (buf) segs.push({ kind: "html", html: buf }); buf = ""; };
  for (const s of m.content.sections) {
    if (!s.enabled) continue;
    switch (s.type) {
      case "intro": buf += introHtml(s, ctx); break;
      case "featured": buf += featuredHtml(s, ctx); break;
      case "articles": buf += articlesHtml(s, ctx); break;
      case "events": buf += eventsHtml(s, ctx); break;
      case "spotlight": buf += spotlightHtml(s, ctx); break;
      case "promo": buf += promoHtml(s, ctx); break;
      case "custom": buf += customHtml(s, ctx); break;
      case "toc": buf += tocHtml(s, m.content, ctx); break;
      case "joke": buf += jokeHtml(s); break;
      case "poll":
        if (!s.poll?.id) break;
        flush();
        segs.push({
          kind: "poll", pollId: s.poll.id, previewHtml: pollPreview(s),
          headingHtml: sectionLabel(s.heading) + (s.intro.trim() ? wrap(`<p style="margin:0 0 8px;${BODY}font-size:15px;line-height:1.55;color:${C.text};">${text(s.intro)}</p>`) : ""),
        });
        break;
      case "sponsor": flush(); segs.push({ kind: "sponsor" }); break;
      case "weather": flush(); segs.push({ kind: "weather", headingHtml: sectionLabel(s.heading), snapshotHtml: weatherSnapshot(ctx) }); break;
    }
  }
  buf += footerHtml(ctx);
  flush();
  return segs;
}

const previewNote = (title: string, body: string) =>
  `<table ${TABLE}><tr><td style="padding:22px 0 0;"><table ${TABLE}><tr><td align="center" style="border:2px dashed #C5CCD6;border-radius:10px;padding:18px;${BODY}font-size:13px;line-height:1.5;color:${C.muted};">` +
  `<div style="${HEAD}font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${C.navy};">${esc(title)}</div>${esc(body)}</td></tr></table></td></tr></table>`;

/** The small centered line above the logo. In the preview the link is inert; exported HTML keeps {{live_url}}. */
export function readOnlineHtml(ctx: RenderContext) {
  const href = ctx.preview ? "#" : LIVE_URL_TAG;
  return `<p style="margin:0;padding:12px 0 0;text-align:center;${BODY}font-size:12px;line-height:1.5;color:${C.muted};">${esc(READ_ONLINE_TEXT)} ` +
    `<a href="${href}" style="color:${C.green};font-weight:700;text-decoration:underline;">${esc(READ_ONLINE_LINK)}</a></p>`;
}

/** Full HTML document (600px wide) for the preview, "Copy HTML" and snapshot exports. */
export function renderEmailDocument(m: DesignMeta, ctx: RenderContext): string {
  const parts = renderSegments(m, ctx).map((s) => {
    if (s.kind === "html") return s.html;
    if (s.kind === "readOnline") return readOnlineHtml(ctx);
    if (s.kind === "poll") return ctx.preview ? s.headingHtml + s.previewHtml : ""; // a native poll can't be exported as HTML
    if (s.kind === "sponsor") return ctx.preview ? previewNote("Sponsor", "Your beehiiv Ad Network ad goes here. Add it in beehiiv before sending.") : "";
    return s.headingHtml + (s.snapshotHtml ?? (ctx.preview ? previewNote("Weather", "The forecast isn't available right now. In beehiiv it comes from the weather RSS feed.") : ""));
  });
  if (ctx.preview) parts.push(previewNote("beehiiv footer", "beehiiv adds its required footer when it sends: unsubscribe, manage preferences and mailing address."));
  const pre = m.previewText?.trim() ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(m.previewText)}</div>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.offWhite};">${pre}` +
    `<table ${TABLE}><tr><td align="center" style="padding:16px 8px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;">` +
    `<tr><td style="padding:0 24px 24px;">${parts.join("")}</td></tr></table></td></tr></table></body></html>`;
}

/** Things to check before sending (shown in the editor). */
/** Gmail shows "[Message clipped]" for emails over ~102 KB; beehiiv's own template adds some markup too. */
export const GMAIL_CLIP_WARN_BYTES = 85_000;

export function designWarnings(m: DesignMeta, ctx: RenderContext): string[] {
  const w: string[] = [];
  const bytes = new TextEncoder().encode(renderEmailDocument(m, { ...ctx, preview: false })).length;
  if (bytes > GMAIL_CLIP_WARN_BYTES) w.push(`This issue is about ${Math.round(bytes / 1024)} KB. Gmail clips emails over about 102 KB (readers then tap “View entire message”). Nothing is cut here — consider linking long stories to the website.`);
  if (!m.title.trim()) w.push("Add an email subject (the beehiiv title).");
  for (const s of m.content.sections) {
    if (!s.enabled) continue;
    if (s.type === "featured" && !s.story?.title.trim()) w.push("Featured article is on but empty — it won't appear.");
    if (s.type === "articles" && !s.items.some((i) => i.title.trim())) w.push("More stories is on but has no articles — it won't appear.");
    if (s.type === "events" && !s.items.some((i) => i.title.trim())) w.push("Upcoming events is on but has no events — it won't appear.");
    if (s.type === "spotlight" && !s.business?.name.trim()) w.push("Business Spotlight is on but empty — it won't appear.");
    if (s.type === "poll" && !s.poll?.id) w.push("Community Poll is on but no beehiiv poll is chosen — it will be left out.");
    if (s.type === "joke" && (!s.setup.trim() || !s.punchline.trim())) w.push("Daily Dad Joke needs a setup and a punchline — it won't appear until both are filled in.");
    if (s.type === "weather" && !ctx.weather) w.push("The weather forecast isn't available right now (it still comes from the weather feed in beehiiv).");
    if (s.type === "events") s.items.forEach((e, i) => { if (e.title.trim() && !e.date.trim()) w.push(`Event ${i + 1} (“${e.title}”) has no date.`); });
    if (s.type === "articles" || s.type === "featured") {
      const items = s.type === "articles" ? s.items : s.story ? [s.story] : [];
      items.forEach((it) => { if (it.title.trim() && !safeUrl(it.url, ctx.siteUrl)) w.push(`“${it.title}” has no link.`); });
    }
  }
  return w;
}

// ───────────── website version ─────────────

export type WebArticleOptions = {
  /** This article's own path (e.g. "/articles/my-issue/"): "Read more" links pointing back to it are left out. */
  selfPath?: string | null;
  /** The article's featured image: the featured story's picture (or any identical image) isn't repeated in the body. */
  featuredImageUrl?: string | null;
  /** Where the weather section points on the web (a past issue's forecast is out of date). */
  forecastUrl?: string | null;
};

/**
 * The issue as a web article for T County Connect (used when a designer issue comes back from beehiiv as a post).
 * Email layout (600px tables, inline styles) doesn't survive the site's sanitizer, so the website version uses
 * semantic HTML with `nl-*` classes, styled like the newsletter by the site's stylesheet (globals.css): green
 * section labels, event date badges, the joke card, the Explore box. Same content, same order. Email-only parts
 * (masthead, "Read it online", the sponsor slot, the beehiiv poll, the footer) are left out; the overview links
 * to the sections on the page. Only tags and attributes the site's sanitizer keeps (sanitizeRichText) are used.
 */
export function renderWebArticle(m: DesignMeta, ctx: RenderContext, opts: WebArticleOptions = {}): string {
  const site = ctx.siteUrl.replace(/\/$/, "");
  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  const self = opts.selfPath ? norm(site + opts.selfPath) : null;
  const featured = opts.featuredImageUrl ? norm(opts.featuredImageUrl) : null;
  const pageTitle = m.title.trim().toLowerCase();
  const link = (u: string) => { const h = safeUrl(u, site); return h && (!self || norm(h) !== self) ? h : ""; };
  const anchor = (key: string) => `nl-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const rich = (v: string | null | undefined) => {
    const s = String(v ?? "");
    if (!s.trim()) return "";
    return `<div class="nl-text">${linkifyHtml(isRich(s) ? sanitizeIntroHtml(s, site) : plainToHtml(s))}</div>`;
  };
  const label = (t: string) => (t.trim() ? `<h2 class="nl-label">${esc(t.trim())}</h2>` : "");
  const title = (t: string, href: string, cls = "nl-title") => `<h3 class="${cls}">${href ? `<a href="${esc(href)}">${esc(t.trim())}</a>` : esc(t.trim())}</h3>`;
  const figure = (src: string, alt: string, href = "") => {
    const s = safeUrl(src, site);
    if (!s || (featured && norm(s) === featured)) return "";
    const im = `<img src="${esc(s)}" alt="${esc(alt.trim())}">`;
    return `<figure class="nl-figure">${href ? `<a href="${esc(href)}">${im}</a>` : im}</figure>`;
  };
  const more = (t: string, href: string) => (href ? `<p class="nl-more"><a href="${esc(href)}">${esc(t)} &rarr;</a></p>` : "");
  const btn = (t: string, href: string) => (href ? `<p class="nl-btn-row"><a class="nl-btn" href="${esc(href)}">${esc(t)}</a></p>` : "");
  const section = (key: string, cls: string, inner: string) => `<section id="${anchor(key)}" class="nl-section ${cls}">${inner}</section>`;

  const out: string[] = [];
  const present = new Set<string>();
  let tocAt = -1;
  let tocSection: Extract<Section, { type: "toc" }> | undefined;
  for (const s of m.content.sections) {
    if (!s.enabled) continue;
    switch (s.type) {
      case "intro": {
        const b = rich(s.html);
        if (!b && !s.heading.trim()) break;
        out.push(`<section class="nl-intro">${s.heading.trim() ? `<h2 class="nl-intro-head">${esc(s.heading.trim())}</h2>` : ""}${b}${s.signature.trim() ? `<p class="nl-sig">&mdash; ${esc(s.signature.trim())}</p>` : ""}</section>`);
        break;
      }
      case "toc":
        if (tocAt < 0) { tocAt = out.length; tocSection = s; out.push(""); }
        break;
      case "featured": {
        const st = s.story;
        if (!st?.title.trim()) break;
        const href = link(st.url);
        // The page's hero image and title already lead the article: don't repeat them.
        const img = opts.featuredImageUrl ? "" : figure(st.imageUrl, st.title, href);
        const head = st.title.trim().toLowerCase() === pageTitle ? "" : title(st.title, href, "nl-title nl-title-lg");
        present.add(s.id);
        out.push(section(s.id, "nl-featured", label(s.heading) + img + head + rich(st.description) + btn(s.ctaLabel || "Read More", href)));
        break;
      }
      case "articles": {
        const items = s.items.filter((i) => i.title.trim());
        if (!items.length) break;
        out.push(`<div class="nl-section nl-stories">${label(s.heading)}${items.map((st) => {
          const href = link(st.url);
          const key = `${s.id}:${st.id}`;
          present.add(key);
          const head = st.title.trim().toLowerCase() === pageTitle ? "" : title(st.title, href);
          return `<div id="${anchor(key)}" class="nl-story">${figure(st.imageUrl, st.title, href)}${head}${rich(st.description)}${more("Read more", href)}</div>`;
        }).join("")}</div>`);
        break;
      }
      case "events": {
        const items = s.items.filter((i) => i.title.trim());
        if (!items.length) break;
        present.add(s.id);
        out.push(section(s.id, "nl-events", label(s.heading) + items.map((e) => {
          const href = link(e.url);
          const d = eventDateParts(e.date);
          const meta = [d ? d.long : e.date.trim(), e.time.trim(), e.location.trim()].filter(Boolean).map(esc).join(" &middot; ");
          const badge = `<div class="nl-date" aria-hidden="true"><span class="nl-date-mon">${esc(d ? d.month : "DATE")}</span><span class="nl-date-day">${esc(d ? d.day : "—")}</span></div>`;
          return `<div class="nl-event">${badge}<div class="nl-event-body">${title(e.title, href)}${meta ? `<p class="nl-meta">${meta}</p>` : ""}${rich(e.description)}${more("More info", href)}${figure(e.imageUrl, e.title, href)}</div></div>`;
        }).join("")));
        break;
      }
      case "spotlight": {
        const b = s.business;
        if (!b?.name.trim()) break;
        const href = link(b.url);
        present.add(s.id);
        out.push(section(s.id, "nl-spotlight", label(s.heading) + `<div class="nl-card">${figure(b.imageUrl, b.name, href)}${title(b.name, href)}${rich(b.text)}${more(`Visit ${b.name.trim()}`, href)}</div>`));
        break;
      }
      case "weather": {
        const href = opts.forecastUrl ? safeUrl(opts.forecastUrl, site) : "";
        if (!href) break;
        present.add(s.id);
        out.push(section(s.id, "nl-weather", label(s.heading || "Weather") + `<div class="nl-card nl-weather-card"><span class="nl-weather-icon" aria-hidden="true">&#9728;&#65039;</span><p>The forecast in this issue has passed. <a href="${esc(href)}">See the current forecast &rarr;</a></p></div>`));
        break;
      }
      case "joke":
        if (!s.setup.trim() || !s.punchline.trim()) break;
        present.add(s.id);
        out.push(section(s.id, "nl-joke", `<div class="nl-joke-head"><span class="nl-joke-icon" aria-hidden="true">&#128516;</span><h2 class="nl-joke-label">${esc(s.heading.trim() || "Daily Dad Joke")}</h2></div>` +
          (s.intro.trim() ? `<p class="nl-joke-intro">${text(s.intro.trim())}</p>` : "") +
          `<p class="nl-joke-setup">${text(s.setup.trim())}</p><p class="nl-joke-punch">${text(s.punchline.trim())}</p>`));
        break;
      case "promo": {
        if (!s.heading.trim() && !s.text.trim()) break;
        const href = link(s.ctaUrl);
        present.add(s.id);
        out.push(section(s.id, "nl-promo", (s.heading.trim() ? `<h2 class="nl-promo-head">${esc(s.heading.trim())}</h2>` : "") + rich(s.text) + btn(s.ctaLabel || "Visit TCountyConnect.com", href)));
        break;
      }
      case "custom": {
        const cta = link(s.ctaUrl);
        const imgHref = link(s.imageLink);
        const inner = figure(s.imageUrl, s.title || s.heading, imgHref) + (s.title.trim() ? title(s.title, imgHref || cta, "nl-title nl-title-lg") : "") + rich(s.html) + (cta ? btn(s.ctaLabel || "Learn more", cta) : "");
        if (!inner) break;
        present.add(s.id);
        out.push(section(s.id, "nl-custom", label(s.heading) + inner));
        break;
      }
      // sponsor (a beehiiv ad) and poll (a native beehiiv poll): email only.
      default: break;
    }
  }
  if (tocAt >= 0) {
    const lines = tocLines(m.content, ctx, tocSection).filter((l) => present.has(l.sectionId));
    out[tocAt] = lines.length >= 2
      ? `<div class="nl-toc" role="navigation" aria-label="In this issue"><p class="nl-toc-head">${esc(tocSection?.heading.trim() || "In This T County Connect Issue")}</p><ul>${lines.map((l) => `<li><a href="#${anchor(l.sectionId)}">${esc(l.label)}</a></li>`).join("")}</ul></div>`
      : "";
  }
  const body = out.filter(Boolean).join("\n");
  return body ? `<div class="nl-web not-prose">\n${body}\n</div>` : "";
}

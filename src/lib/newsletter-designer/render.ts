/**
 * Newsletter designer — email renderer (pure TS: used by the live preview in the browser, the saved preview,
 * "Copy HTML" and the beehiiv draft). Email-safe: table layout, inline styles only (beehiiv strips <style> and
 * <link>), fluid widths with no media queries, web fonts with system fallbacks.
 */
import type { DesignContent, EventItem, Section, SpotlightBusiness, StoryItem } from "./types";

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
  | { kind: "weather"; headingHtml: string; snapshotHtml: string | null }
  | { kind: "sponsor" };

export const C = { navy: "#0B2340", green: "#387D14", orange: "#FF8508", offWhite: "#F7F8F5", text: "#1F2937", muted: "#5B6577", line: "#E3E6EA" } as const;
const HEAD = "font-family:Montserrat,'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:700;";
const BODY = "font-family:'Open Sans','Segoe UI',Helvetica,Arial,sans-serif;";
const TABLE = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"';

// ───────────── escaping & URLs ─────────────

export const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Plain text with line breaks kept. */
const text = (s: string | null | undefined) => esc(s).replace(/\r?\n/g, "<br>");

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

const ALLOWED = new Set(["p", "br", "strong", "b", "em", "i", "a", "u"]);

/**
 * Allowlist sanitizer for the introduction editor: <p>, <br>, bold, italic, underline and http(s)/mailto links.
 * Scripts, styles, comments, attributes and every other tag are removed; stray "<"/">" in text are escaped.
 */
export function sanitizeIntroHtml(html: string | null | undefined, siteUrl = "https://tcountyconnect.com"): string {
  let s = String(html ?? "").slice(0, 20000);
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

/** Adds email-safe inline styles to sanitized intro HTML. */
function styleIntro(html: string) {
  const body = html.trim().startsWith("<p>") ? html : `<p>${html}</p>`;
  return body
    .replace(/<p>/g, `<p style="margin:0 0 14px;${BODY}font-size:16px;line-height:1.65;color:${C.text};">`)
    .replace(/<a href=/g, `<a style="color:${C.green};text-decoration:underline;font-weight:600;" href=`)
    .replace(/<strong>/g, '<strong style="font-weight:700;">');
}

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
    (st.description.trim() ? `<p style="margin:10px 0 0;${BODY}font-size:16px;line-height:1.6;color:${C.text};">${text(st.description)}</p>` : "") +
    button(s.ctaLabel, href),
  );
}

function storyRow(st: StoryItem, ctx: RenderContext, first: boolean) {
  const href = safeUrl(st.url, ctx.siteUrl);
  const src = safeUrl(st.imageUrl, ctx.siteUrl);
  const thumb = src ? `<td width="120" valign="top" style="width:120px;padding:0 16px 0 0;">${img(src, st.title, href, 120, 6)}</td>` : "";
  return `<table ${TABLE}><tr><td style="padding:${first ? "0" : "16px"} 0 16px;${first ? "" : `border-top:1px solid ${C.line};`}">` +
    `<table ${TABLE}><tr>${thumb}<td valign="top">` +
    `<div>${headline(st.title, href, 17)}</div>` +
    (st.description.trim() ? `<p style="margin:6px 0 0;${BODY}font-size:14px;line-height:1.55;color:${C.muted};">${text(st.description)}</p>` : "") +
    (href ? `<p style="margin:8px 0 0;${BODY}font-size:14px;line-height:1.4;"><a href="${esc(href)}" style="color:${C.green};font-weight:700;text-decoration:none;">Read more &rarr;</a></p>` : "") +
    `</td></tr></table></td></tr></table>`;
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
    (src ? `<div style="margin:10px 0 0;">${img(src, e.title, href, 420, 6)}</div>` : "") +
    (e.description.trim() ? `<p style="margin:8px 0 0;${BODY}font-size:14px;line-height:1.55;color:${C.text};">${text(e.description)}</p>` : "") +
    (href ? `<p style="margin:8px 0 0;${BODY}font-size:14px;line-height:1.4;"><a href="${esc(href)}" style="color:${C.green};font-weight:700;text-decoration:none;">More info &rarr;</a></p>` : "") +
    `</td></tr></table></td></tr></table>`;
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
    (b.text.trim() ? `<p style="margin:8px 0 0;${BODY}font-size:15px;line-height:1.6;color:${C.text};">${text(b.text)}</p>` : "") +
    (href ? `<p style="margin:12px 0 0;${BODY}font-size:15px;line-height:1.4;"><a href="${esc(href)}" style="color:${C.green};font-weight:700;text-decoration:none;">Visit ${esc(b.name)} &rarr;</a></p>` : "") +
    `</td></tr></table>`;
}

function promoHtml(s: Extract<Section, { type: "promo" }>, ctx: RenderContext) {
  if (!s.heading.trim() && !s.text.trim()) return "";
  const href = safeUrl(s.ctaUrl, ctx.siteUrl);
  return `<table ${TABLE}><tr><td style="padding:30px 0 0;"><table ${TABLE}><tr><td align="center" style="background:${C.navy};border-radius:10px;padding:28px 24px;">` +
    (s.heading.trim() ? `<div style="${HEAD}font-size:22px;line-height:1.3;color:#FFFFFF;">${esc(s.heading)}</div>` : "") +
    (s.text.trim() ? `<p style="margin:10px 0 0;${BODY}font-size:15px;line-height:1.6;color:#D5DCE6;">${text(s.text)}</p>` : "") +
    (href ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:18px auto 0;"><tr><td style="background:${C.orange};border-radius:6px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;${HEAD}font-size:15px;line-height:18px;color:${C.navy};text-decoration:none;">${esc(s.ctaLabel || "Visit TCountyConnect.com")}</a></td></tr></table>` : "") +
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
  const segs: Segment[] = [];
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

/** Full HTML document (600px wide) for the preview, "Copy HTML" and snapshot exports. */
export function renderEmailDocument(m: DesignMeta, ctx: RenderContext): string {
  const parts = renderSegments(m, ctx).map((s) => {
    if (s.kind === "html") return s.html;
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
export function designWarnings(m: DesignMeta, ctx: RenderContext): string[] {
  const w: string[] = [];
  if (!m.title.trim()) w.push("Add an email subject (the beehiiv title).");
  for (const s of m.content.sections) {
    if (!s.enabled) continue;
    if (s.type === "featured" && !s.story?.title.trim()) w.push("Featured article is on but empty — it won't appear.");
    if (s.type === "articles" && !s.items.some((i) => i.title.trim())) w.push("More stories is on but has no articles — it won't appear.");
    if (s.type === "events" && !s.items.some((i) => i.title.trim())) w.push("Upcoming events is on but has no events — it won't appear.");
    if (s.type === "spotlight" && !s.business?.name.trim()) w.push("Business Spotlight is on but empty — it won't appear.");
    if (s.type === "weather" && !ctx.weather) w.push("The weather forecast isn't available right now (it still comes from the weather feed in beehiiv).");
    if (s.type === "events") s.items.forEach((e, i) => { if (e.title.trim() && !e.date.trim()) w.push(`Event ${i + 1} (“${e.title}”) has no date.`); });
    if (s.type === "articles" || s.type === "featured") {
      const items = s.type === "articles" ? s.items : s.story ? [s.story] : [];
      items.forEach((it) => { if (it.title.trim() && !safeUrl(it.url, ctx.siteUrl)) w.push(`“${it.title}” has no link.`); });
    }
  }
  return w;
}

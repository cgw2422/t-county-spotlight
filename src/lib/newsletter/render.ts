import "server-only";
import sanitizeHtml from "sanitize-html";
import { absoluteUrl, stripHtml } from "@/lib/utils";
import { NEWSLETTER_NAME } from "./copy";
import type { NewsletterContent, NLItem } from "./content";

/** Replaced per recipient at send time. */
export const UNSUBSCRIBE_PLACEHOLDER = "%%UNSUBSCRIBE_URL%%";
export const PREFERENCES_PLACEHOLDER = "%%PREFERENCES_URL%%";

export function recipientLinks(unsubscribeToken: string) {
  const t = encodeURIComponent(unsubscribeToken);
  return {
    unsubscribeUrl: absoluteUrl(`/newsletter/unsubscribe/?token=${t}`),
    preferencesUrl: absoluteUrl(`/newsletter/preferences/?token=${t}`),
    oneClickUrl: absoluteUrl(`/api/newsletter/unsubscribe/?token=${t}`),
  };
}

/** RFC 2369 / RFC 8058 headers so mail apps can show a one-click "Unsubscribe". */
export function listUnsubscribeHeaders(unsubscribeToken: string, mailto?: string) {
  const { oneClickUrl } = recipientLinks(unsubscribeToken);
  return {
    "List-Unsubscribe": `<${oneClickUrl}>${mailto ? `, <mailto:${mailto}?subject=unsubscribe>` : ""}`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export function personalize(s: string, links: { unsubscribeUrl: string; preferencesUrl: string }) {
  return s.split(UNSUBSCRIBE_PLACEHOLDER).join(links.unsubscribeUrl).split(PREFERENCES_PLACEHOLDER).join(links.preferencesUrl);
}

export function esc(s: string | null | undefined) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function abs(url: string | null | undefined) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return absoluteUrl(url);
  return "";
}

// ── Palette (matches the site: navy / brand / sunset) ──
const C = { navy: "#10264a", brand: "#1d66db", sunset: "#d9711a", text: "#1e293b", muted: "#64748b", line: "#e2e8f0", bg: "#f1f5f9", card: "#ffffff", cream: "#faf7f2" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/** Email-safe rich text: small tag allowlist, inline styles, absolute links/images. */
export function emailRichText(html: string) {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "img", "hr"],
    allowedAttributes: { a: ["href"], img: ["src", "alt", "width", "height"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false,
    transformTags: {
      p: () => ({ tagName: "p", attribs: { style: `margin:0 0 14px;font-size:16px;line-height:1.6;color:${C.text}` } }),
      h2: () => ({ tagName: "h2", attribs: { style: `margin:20px 0 8px;font-family:${SERIF};font-size:22px;line-height:1.25;color:${C.navy}` } }),
      h3: () => ({ tagName: "h3", attribs: { style: `margin:18px 0 6px;font-size:18px;line-height:1.3;color:${C.navy}` } }),
      h4: () => ({ tagName: "h4", attribs: { style: `margin:16px 0 6px;font-size:16px;color:${C.navy}` } }),
      ul: () => ({ tagName: "ul", attribs: { style: `margin:0 0 14px;padding-left:22px;color:${C.text}` } }),
      ol: () => ({ tagName: "ol", attribs: { style: `margin:0 0 14px;padding-left:22px;color:${C.text}` } }),
      li: () => ({ tagName: "li", attribs: { style: "margin:0 0 6px;font-size:16px;line-height:1.5" } }),
      blockquote: () => ({ tagName: "blockquote", attribs: { style: `margin:0 0 14px;padding:4px 0 4px 14px;border-left:3px solid ${C.sunset};color:${C.text}` } }),
      hr: () => ({ tagName: "hr", attribs: { style: `border:0;border-top:1px solid ${C.line};margin:20px 0` } }),
      a: (_t, a) => ({ tagName: "a", attribs: { href: abs(a.href) || (a.href?.startsWith("mailto:") || a.href?.startsWith("tel:") ? a.href : "#"), style: `color:${C.brand};text-decoration:underline` } }),
      img: (_t, a) => ({ tagName: "img", attribs: { src: abs(a.src), alt: a.alt ?? "", width: "536", style: "display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px;margin:0 0 14px" } }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && !frame.attribs.src,
  });
}

function button(label: string, url: string, color = C.brand) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px"><tr><td style="border-radius:8px;background:${color}" bgcolor="${color}"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${esc(label)}</a></td></tr></table>`;
}

function itemBlock(i: NLItem, sponsoredLabel: string) {
  const url = abs(i.url);
  const img = abs(i.imageUrl);
  const title = url ? `<a href="${esc(url)}" style="color:${C.navy};text-decoration:none">${esc(i.title)}</a>` : esc(i.title);
  return `<tr><td style="padding:0 0 18px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${img ? `<td class="nl-thumb" width="120" valign="top" style="width:120px;padding:0 14px 0 0">${url ? `<a href="${esc(url)}">` : ""}<img src="${esc(img)}" alt="${esc(i.imageAlt || i.title)}" width="120" height="90" style="display:block;width:120px;height:90px;object-fit:cover;border:0;border-radius:8px;background:${C.bg}">${url ? "</a>" : ""}</td>` : ""}
<td valign="top" style="font-family:${FONT}">
${i.sponsored ? `<div style="margin:0 0 4px"><span style="display:inline-block;padding:1px 8px;border-radius:999px;background:#fef3c7;color:#78350f;font-size:11px;font-weight:700;letter-spacing:.02em">${esc(sponsoredLabel)}</span></div>` : ""}
${i.meta ? `<div style="margin:0 0 2px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${C.sunset}">${esc(i.meta)}</div>` : ""}
<div style="font-size:17px;font-weight:700;line-height:1.3;color:${C.navy}">${title}</div>
${i.text ? `<div style="margin:4px 0 0;font-size:14px;line-height:1.5;color:${C.muted}">${esc(i.text)}</div>` : ""}
${url ? `<div style="margin:6px 0 0;font-size:14px"><a href="${esc(url)}" style="color:${C.brand};font-weight:700;text-decoration:none">Read more &rarr;</a></div>` : ""}
</td></tr></table></td></tr>`;
}

export type RenderContext = {
  siteName: string;
  logoUrl?: string | null;
  postalAddress: string;
  sponsoredLabel?: string;
};

/**
 * Renders a campaign to email-safe HTML (tables, inline styles, 600px) and
 * plain text. Unsubscribe/preferences links are placeholders — call
 * personalize() per recipient.
 */
export function renderNewsletter(nl: { subject: string; preheader?: string | null; content: NewsletterContent }, ctx: RenderContext) {
  const site = absoluteUrl("/");
  const logo = abs(ctx.logoUrl);
  const sponsored = ctx.sponsoredLabel || "Sponsored";
  const sections = nl.content.sections.filter((s) => s.enabled && s.items.length);
  const intro = emailRichText(nl.content.intro);
  const outro = emailRichText(nl.content.outro);
  const pre = nl.preheader?.trim() || "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(nl.subject)}</title>
<!--[if mso]><style>table,td,div,p,a{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%}
  img{-ms-interpolation-mode:bicubic}
  @media (max-width:620px){ .nl-pad{padding-left:18px!important;padding-right:18px!important} .nl-thumb{width:88px!important} .nl-thumb img{width:88px!important;height:66px!important} }
  @media (prefers-color-scheme:dark){
    .nl-bg{background:#0b1a33!important} .nl-card{background:#10264a!important}
    .nl-card p,.nl-card li,.nl-card div,.nl-card td{color:#e2e8f0!important}
    .nl-card a{color:#9cc3ff!important} .nl-card h2,.nl-card h3{color:#ffffff!important}
  }
</style>
</head>
<body class="nl-bg" style="margin:0;padding:0;background:${C.bg}">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};opacity:0">${esc(pre)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>` : ""}
<table role="presentation" class="nl-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}" bgcolor="${C.bg}">
<tr><td align="center" style="padding:24px 8px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="nl-card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${C.card};border-radius:14px;overflow:hidden" bgcolor="${C.card}">
<tr><td style="background:${C.navy};padding:22px 28px" bgcolor="${C.navy}" class="nl-pad">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td style="font-family:${FONT}">${logo ? `<a href="${esc(site)}"><img src="${esc(logo)}" alt="${esc(ctx.siteName)}" height="40" style="display:block;height:40px;width:auto;border:0"></a>` : `<a href="${esc(site)}" style="font-family:${SERIF};font-size:22px;font-weight:700;color:#ffffff;text-decoration:none">${esc(ctx.siteName)}</a>`}</td>
  <td align="right" style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#f7a24b">${esc(NEWSLETTER_NAME)}</td>
  </tr></table>
</td></tr>
<tr><td class="nl-pad" style="padding:28px 32px 8px;font-family:${FONT}">
  <h1 style="margin:0 0 14px;font-family:${SERIF};font-size:28px;line-height:1.2;color:${C.navy}">${esc(nl.subject)}</h1>
  ${intro}
</td></tr>
${sections.map((s) => `<tr><td class="nl-pad" style="padding:8px 32px 6px;font-family:${FONT}">
  <h2 style="margin:12px 0 14px;padding:0 0 8px;border-bottom:2px solid ${C.sunset};font-family:${SERIF};font-size:22px;color:${C.navy}">${esc(s.title)}</h2>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${s.items.map((i) => itemBlock(i, sponsored)).join("\n")}</table>
</td></tr>`).join("\n")}
${outro ? `<tr><td class="nl-pad" style="padding:8px 32px 8px;font-family:${FONT}">${outro}</td></tr>` : ""}
<tr><td class="nl-pad" style="padding:8px 32px 28px;font-family:${FONT}">${button(`Explore ${ctx.siteName}`, site)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td class="nl-pad" style="padding:20px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
  <p style="margin:0 0 8px;color:${C.muted}">You're receiving the ${esc(NEWSLETTER_NAME)} because you subscribed at ${esc(ctx.siteName)} and confirmed your email address.</p>
  <p style="margin:0 0 8px"><a href="${PREFERENCES_PLACEHOLDER}" style="color:${C.muted};text-decoration:underline">Email preferences</a> &nbsp;&middot;&nbsp; <a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a> &nbsp;&middot;&nbsp; <a href="${esc(absoluteUrl("/newsletter/#privacy"))}" style="color:${C.muted};text-decoration:underline">Privacy</a></p>
  <p style="margin:0;color:${C.muted}">${esc(ctx.siteName)} &middot; ${esc(ctx.postalAddress).replace(/\n/g, ", ")}</p>
  <p style="margin:6px 0 0;color:${C.muted}">Items marked &ldquo;${esc(sponsored)}&rdquo; are paid placements from local businesses.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  const lines: string[] = [];
  lines.push(`${NEWSLETTER_NAME} — ${ctx.siteName}`, "", nl.subject.toUpperCase(), "");
  if (pre) lines.push(pre, "");
  const introText = htmlToText(nl.content.intro);
  if (introText) lines.push(introText, "");
  for (const s of sections) {
    lines.push(s.title.toUpperCase(), "-".repeat(Math.min(40, s.title.length)));
    for (const i of s.items) {
      lines.push(`* ${i.sponsored ? `[${sponsored}] ` : ""}${i.meta ? `${i.meta} — ` : ""}${i.title}`);
      if (i.text) lines.push(`  ${i.text}`);
      if (abs(i.url)) lines.push(`  ${abs(i.url)}`);
    }
    lines.push("");
  }
  const outroText = htmlToText(nl.content.outro);
  if (outroText) lines.push(outroText, "");
  lines.push(`Explore ${ctx.siteName}: ${site}`, "", "—",
    `You're receiving the ${NEWSLETTER_NAME} because you subscribed at ${ctx.siteName} and confirmed your email address.`,
    `Email preferences: ${PREFERENCES_PLACEHOLDER}`,
    `Unsubscribe: ${UNSUBSCRIBE_PLACEHOLDER}`,
    `${ctx.siteName} · ${ctx.postalAddress.replace(/\n/g, ", ")}`);
  return { html, text: lines.join("\n") };
}

export function htmlToText(html: string) {
  if (!html) return "";
  const withLinks = html
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label} (${abs(href) || href})`)
    .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "* ");
  return withLinks.split("\n").map((l) => stripHtml(l)).filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trim();
}

/** Small branded layout for transactional mail (confirmation, welcome). */
export function renderSimpleEmail(o: { siteName: string; logoUrl?: string | null; title: string; paragraphs: string[]; button?: { label: string; url: string }; after?: string[]; footer: string[] }) {
  const logo = abs(o.logoUrl);
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${C.text}">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}" bgcolor="${C.bg}"><tr><td align="center" style="padding:24px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px" bgcolor="#ffffff">
<tr><td style="background:${C.navy};padding:18px 28px;border-radius:14px 14px 0 0" bgcolor="${C.navy}">${logo ? `<img src="${esc(logo)}" alt="${esc(o.siteName)}" height="36" style="display:block;height:36px;width:auto;border:0">` : `<span style="font-family:${SERIF};font-size:20px;font-weight:700;color:#ffffff">${esc(o.siteName)}</span>`}</td></tr>
<tr><td style="padding:28px;font-family:${FONT}">
<h1 style="margin:0 0 14px;font-family:${SERIF};font-size:24px;line-height:1.25;color:${C.navy}">${esc(o.title)}</h1>
${o.paragraphs.map(p).join("")}
${o.button ? button(o.button.label, o.button.url) : ""}
${(o.after ?? []).map((t) => `<p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:${C.muted}">${t}</p>`).join("")}
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px"><tr><td style="padding:16px 28px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center">${o.footer.map((f) => `<p style="margin:0 0 6px">${f}</p>`).join("")}</td></tr></table>
</td></tr></table></body></html>`;
  return html;
}

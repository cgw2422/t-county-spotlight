/**
 * "Things to Do" newsletter section — email-safe HTML (pure: no DB, no env reads).
 *
 * Rules: table-based layout, inline styles only, max-width 600px, no <style>/<link>,
 * no class names, no iframes, no images. Every text value is escaped; every link is
 * absolute. Missing fields are left out (never guessed).
 */
import { escapeHtml } from "./text";
import { stripHtml, truncate } from "./utils";
import { eventHref } from "./links";
import { admissionLabel } from "./events";
import type { DraftBlock } from "./beehiiv/posts-api";

export const NAVY = "#0B2340";
export const GREEN = "#387D14";
export const ORANGE = "#FF8508";
export const OFF_WHITE = "#F7F8F5";
export const BORDER = "#E5E7E0";
const TEXT = "#334155";
const MUTED = "#475569";
const FONT = "Arial, Helvetica, sans-serif";
const TZ = "America/New_York";

export const SECTION_HEADING = "Things to Do";
export const DEFAULT_INTRO = "Here's what's happening around Tuscarawas County this week.";
export const CALENDAR_BUTTON_TEXT = "View Full Calendar";
export const DESCRIPTION_MAX = 160;

/** The event fields the newsletter uses (one occurrence of an event). */
export type NewsletterOccurrence = {
  key: string;
  id: string;
  slug: string;
  title: string;
  description: string | null;
  locationName: string | null;
  city: string | null;
  isFree: boolean | null;
  price: string | null;
  allDay: boolean;
  recurring: boolean;
  occurrenceStart: Date;
  occurrenceEnd: Date | null;
};

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o }).format(d);
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayLabel = (d: Date) => fmt(d, { weekday: "short", month: "short", day: "numeric" }); // "Sat, Nov 21"
const timeLabel = (d: Date) => fmt(d, { hour: "numeric", minute: "2-digit" }); // "12:00 PM"

/** "Sat, Nov 21 · 12:00 PM – 6:00 PM" (all America/New_York). */
export function whenLabel(o: Pick<NewsletterOccurrence, "occurrenceStart" | "occurrenceEnd" | "allDay">): string {
  const s = o.occurrenceStart;
  const e = o.occurrenceEnd && o.occurrenceEnd > s ? o.occurrenceEnd : null;
  const sameDay = !e || dayKey(e) === dayKey(s);
  if (o.allDay) return sameDay ? `${dayLabel(s)} · All day` : `${dayLabel(s)} – ${dayLabel(e!)}`;
  if (!e) return `${dayLabel(s)} · ${timeLabel(s)}`;
  if (sameDay) return `${dayLabel(s)} · ${timeLabel(s)} – ${timeLabel(e)}`;
  return `${dayLabel(s)}, ${timeLabel(s)} – ${dayLabel(e)}, ${timeLabel(e)}`;
}

/** "Tuscora Park, New Philadelphia" — venue and town, without repeating the town. */
export function placeLabel(o: Pick<NewsletterOccurrence, "locationName" | "city">): string | null {
  const venue = o.locationName?.trim() || "";
  const city = o.city?.trim() || "";
  if (venue && city && venue.toLowerCase().endsWith(city.toLowerCase())) return venue;
  return [venue, city].filter(Boolean).join(", ") || null;
}

export function shortDescription(html: string | null | undefined): string | null {
  const t = stripHtml(html);
  return t ? truncate(t, DESCRIPTION_MAX) : null;
}

/** Absolute event URL (canonical /events/<slug>/ — the site has no per-occurrence URL). */
export function eventUrl(base: string, e: { slug: string }) {
  return `${base.replace(/\/+$/, "")}${eventHref(e)}`;
}
export function calendarUrl(base: string) {
  return `${base.replace(/\/+$/, "")}/events/`;
}

function dateBadge(d: Date) {
  const month = escapeHtml(fmt(d, { month: "short" }).toUpperCase());
  const day = escapeHtml(fmt(d, { day: "numeric" }));
  return `<table role="presentation" width="56" cellpadding="0" cellspacing="0" border="0" style="width:56px;border-collapse:separate;border:1px solid ${NAVY};border-radius:8px;background-color:#FFFFFF;">`
    + `<tr><td align="center" style="padding:6px 0 0 0;font-family:${FONT};font-size:11px;line-height:14px;font-weight:700;letter-spacing:1px;color:${ORANGE};">${month}</td></tr>`
    + `<tr><td align="center" style="padding:0 0 6px 0;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:${NAVY};">${day}</td></tr>`
    + `</table>`;
}

function details(o: NewsletterOccurrence, base: string, featured: boolean) {
  const url = escapeHtml(eventUrl(base, o));
  const lines: string[] = [];
  if (featured) lines.push(`<p style="margin:0 0 4px 0;font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;color:${GREEN};">FEATURED EVENT</p>`);
  lines.push(`<p style="margin:0 0 4px 0;font-family:${FONT};font-size:${featured ? 20 : 16}px;line-height:${featured ? 26 : 22}px;font-weight:700;"><a href="${url}" target="_blank" style="color:${NAVY};text-decoration:none;">${escapeHtml(o.title)}</a></p>`);
  lines.push(`<p style="margin:0 0 2px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${TEXT};">${escapeHtml(whenLabel(o))}</p>`);
  const place = placeLabel(o);
  if (place) lines.push(`<p style="margin:0 0 2px 0;font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">${escapeHtml(place)}</p>`);
  const price = admissionLabel(o);
  if (price) lines.push(`<p style="margin:0 0 2px 0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:${TEXT};">${escapeHtml(price)}</p>`);
  const desc = shortDescription(o.description);
  if (desc) lines.push(`<p style="margin:6px 0 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:${TEXT};">${escapeHtml(desc)}</p>`);
  lines.push(`<p style="margin:8px 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;"><a href="${url}" target="_blank" style="color:${GREEN};text-decoration:underline;">View Event &rarr;</a></p>`);
  return lines.join("");
}

function card(o: NewsletterOccurrence, base: string, featured: boolean) {
  const row = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr>`
    + `<td width="56" valign="top" style="width:56px;padding:0;vertical-align:top;">${dateBadge(o.occurrenceStart)}</td>`
    + `<td valign="top" style="padding:0 0 0 14px;vertical-align:top;">${details(o, base, featured)}</td>`
    + `</tr></table>`;
  if (featured) {
    return `<tr><td style="padding:0 0 16px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-featured="1" style="width:100%;border-collapse:separate;background-color:${OFF_WHITE};border:1px solid ${BORDER};border-radius:12px;"><tr><td style="padding:16px;">${row}</td></tr></table></td></tr>`;
  }
  return `<tr><td style="padding:14px 0;border-bottom:1px solid ${BORDER};">${row}</td></tr>`;
}

/** The event cards (featured first, then the rest in date order). This is the `html` block. */
export function buildEventCardsHtml(opts: { featured: NewsletterOccurrence | null; items: NewsletterOccurrence[]; baseUrl: string }): string {
  const rest = opts.featured ? opts.items.filter((o) => o.key !== opts.featured!.key) : opts.items;
  const rows = [opts.featured ? card(opts.featured, opts.baseUrl, true) : "", ...rest.map((o) => card(o, opts.baseUrl, false))].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;border-collapse:collapse;">${rows}</table>`;
}

/** Native beehiiv blocks for the section: heading · optional intro · event cards (html) · calendar button. */
export function buildSectionBlocks(opts: { featured: NewsletterOccurrence | null; items: NewsletterOccurrence[]; baseUrl: string; intro?: string | null }): DraftBlock[] {
  const intro = (opts.intro ?? "").replace(/\s+/g, " ").trim();
  return [
    { type: "heading", level: "2", text: SECTION_HEADING, anchorHeader: false, anchorIncludeInToc: false },
    ...(intro ? [{ type: "paragraph" as const, plaintext: intro }] : []),
    { type: "html", html: buildEventCardsHtml(opts) },
    { type: "button", href: calendarUrl(opts.baseUrl), text: CALENDAR_BUTTON_TEXT, alignment: "center", size: "normal", target: "_blank" },
  ];
}

/**
 * Admin preview: the blocks rendered as one HTML document. The `html` block is
 * inserted byte-for-byte; heading/paragraph/button are approximations of how a
 * beehiiv template styles its native blocks.
 */
export function renderPreviewDocument(blocks: DraftBlock[], opts: { title: string; subtitle?: string | null }): string {
  const parts = blocks.map((b) => {
    if (b.type === "heading") return `<h2 style="margin:24px 0 8px 0;font-family:${FONT};font-size:24px;line-height:30px;color:${NAVY};">${escapeHtml(b.text)}</h2>`;
    if (b.type === "paragraph") return `<p style="margin:0 0 12px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${TEXT};">${escapeHtml(b.plaintext ?? b.formattedText?.map((t) => t.text).join("") ?? "")}</p>`;
    if (b.type === "html") return b.html;
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:20px auto 8px auto;"><tr><td style="background-color:${NAVY};border-radius:8px;"><a href="${escapeHtml(b.href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;">${escapeHtml(b.text)}</a></td></tr></table>`;
  });
  const sub = opts.subtitle?.trim() ? `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:16px;color:${MUTED};">${escapeHtml(opts.subtitle)}</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"></head>`
    + `<body style="margin:0;padding:0;background-color:#FFFFFF;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td align="center" style="padding:16px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;"><tr><td align="left">`
    + `<h1 style="margin:0 0 6px 0;font-family:${FONT};font-size:28px;line-height:34px;color:${NAVY};">${escapeHtml(opts.title || "Untitled issue")}</h1>${sub}`
    + parts.join("")
    + `</td></tr></table></td></tr></table></body></html>`;
}


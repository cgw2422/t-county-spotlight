/** Helpers for the owner-facing plain-text editors (no HTML knowledge required). */

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#039;": "'", "&nbsp;": " ", "&#8217;": "’", "&rsquo;": "’", "&#8220;": "“", "&#8221;": "”", "&#8211;": "–", "&#8212;": "—", "&hellip;": "…", "&#8230;": "…" };

/** HTML → editable plain text, keeping paragraph breaks. */
export function htmlToText(html: string | null | undefined) {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&[#a-z0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → safe paragraph HTML. */
export function textToHtml(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/** Normalize a user-typed website to an https URL, or null if it isn't one. */
export function normalizeUrl(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withProto);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const DAY_NAMES: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
export type HoursRow = { day: string; open: string; close: string; closed: boolean };

export function readHours(raw: unknown): HoursRow[] {
  const arr = Array.isArray(raw) ? (raw as Partial<HoursRow>[]) : [];
  return DAYS.map((day) => {
    const r = arr.find((x) => x?.day === day);
    return { day, open: r?.open ?? "", close: r?.close ?? "", closed: !!r?.closed };
  });
}

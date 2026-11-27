/**
 * Finding document links on a government page (pure: no network). Used by the daily check.
 */
import type { DocType, FileType } from "./shared";

export type DocLink = { url: string; text: string; fileType: FileType | null; docType: DocType; score: number };

const DOC_EXT: Record<string, FileType> = { pdf: "pdf", docx: "docx", doc: "doc", htm: "html", html: "html", jpg: "image", jpeg: "image", png: "image", tif: "image", tiff: "image", txt: "text", rtf: "text" };
const MEETING_WORDS = /\b(minutes|agenda|agendas|packet|meeting|council|trustees?|board|commission(?:ers)?|ordinance|resolution|legislation|hearing|notice|budget|appropriation|special session|regular session|work session)\b/i;
const SKIP = /\.(css|js|ico|svg|woff2?|ttf|zip|mp4|mp3|xml|json)(\?|$)|^(mailto|tel|javascript|data):|#$|facebook\.com|twitter\.com|x\.com\/|instagram\.com|youtube\.com|google\.com\/maps|linkedin\.com/i;

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/** Document type from link text / URL. */
export function guessDocType(text: string): DocType {
  const t = text.toLowerCase();
  if (/minute/.test(t)) return "minutes";
  if (/agenda/.test(t)) return "agenda";
  if (/packet/.test(t)) return "packet";
  if (/ordinance/.test(t)) return "ordinance";
  if (/resolution/.test(t)) return "resolution";
  if (/budget|appropriation|financial|audit/.test(t)) return "budget";
  if (/notice|hearing|legal ad/.test(t)) return "notice";
  return "other";
}

export function fileTypeFromUrl(u: string): FileType | null {
  try {
    const p = new URL(u).pathname.toLowerCase();
    const m = /\.([a-z0-9]+)$/.exec(p);
    if (m && DOC_EXT[m[1]]) return DOC_EXT[m[1]];
    // Google Docs/Drive exports and common file-cabinet patterns
    if (/\/export\b|format=pdf|\/download\b|\/downloads?\//.test(u.toLowerCase())) return null;
  } catch {}
  return null;
}

/**
 * Links on `html` that look like meeting documents (files, or pages about minutes/agendas). Same-site links and
 * direct document files on any host are kept; navigation, social and asset links are dropped. Highest-scoring
 * (most document-like) first, deduplicated.
 */
export function discoverDocumentLinks(html: string, baseUrl: string): DocLink[] {
  const out = new Map<string, DocLink>();
  const base = new URL(baseUrl);
  const re = /<a\b([^>]*?)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = decode((m[2] ?? m[3] ?? m[4] ?? "").trim());
    if (!raw || SKIP.test(raw)) continue;
    let abs: URL;
    try { abs = new URL(raw, base); } catch { continue; }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;
    abs.hash = "";
    const url = abs.toString();
    const attrs = `${m[1]} ${m[5]}`;
    const title = /\btitle\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
    const text = decode(m[6].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || decode(title) || decodeURIComponent(abs.pathname.split("/").pop() ?? "");
    const fileType = fileTypeFromUrl(url);
    const label = `${text} ${decodeURIComponent(abs.pathname)}`;
    const meetingish = MEETING_WORDS.test(label);
    const sameSite = abs.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "");
    const isFile = !!fileType && fileType !== "html";
    if (!meetingish && !isFile) continue;
    if (!isFile && !sameSite) continue; // other sites' pages aren't followed
    if (!isFile && !/minute|agenda|packet|ordinance|resolution|notice|legislation|document|archive|meeting/i.test(label)) continue;
    let score = 0;
    if (isFile) score += 3;
    if (fileType === "pdf") score += 1;
    if (/minute|agenda/i.test(label)) score += 3;
    if (meetingish) score += 1;
    if (/20\d\d/.test(label)) score += 1;
    const prev = out.get(url);
    if (!prev || prev.score < score) out.set(url, { url, text: text.slice(0, 300), fileType, docType: guessDocType(label), score });
  }
  return [...out.values()].sort((a, b) => b.score - a.score);
}

/** A meeting date mentioned in a link or title ("March 4, 2026", "3/4/2026", "2026-03-04", "03-04-26"). */
export function dateFromText(text: string): Date | null {
  const t = text.replace(/_/g, " ");
  const months = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
  const mk = (y: number, mo: number, d: number) => {
    if (y < 100) y += 2000;
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const x = new Date(Date.UTC(y, mo - 1, d, 12));
    return x.getUTCMonth() === mo - 1 ? x : null;
  };
  let m = new RegExp(`\\b(${months})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`, "i").exec(t);
  if (m) {
    const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return mk(Number(m[3]), mo, Number(m[2]));
  }
  m = /\b(20\d\d)[-./](\d{1,2})[-./](\d{1,2})\b/.exec(t);
  if (m) return mk(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /\b(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})\b/.exec(t);
  if (m) return mk(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

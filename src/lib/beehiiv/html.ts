import sanitizeHtml from "sanitize-html";
import { sanitizeRichText } from "@/lib/sanitize";
import { stripHtml } from "@/lib/utils";

/** Keep only the <body> of a full HTML document, and drop head/style/title text. */
function bodyOnly(html: string) {
  const m = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return (m ? m[1] : html)
    .replace(/<head\b[\s\S]*?<\/head>/gi, "")
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "");
}

const FOOTER_TEXT = /\bunsubscribe\b|update your (email )?preferences|manage (your )?(subscription|preferences)|powered by beehiiv|view (this )?((email|post|issue) )?(online|in (your |a )?browser)|read online|you('| a)re receiving this|was this email forwarded/i;
const FOOTER_HREF = /unsubscribe|\/preferences|manage_subscription|\{\{|%%/i;
// frame.text is the element's own text, so links ("View online") are checked too.
const BLOCKS = new Set(["table", "tbody", "tr", "td", "div", "p", "section", "footer", "center", "span", "small", "a"]);

function isTrackingPixel(attribs: Record<string, string>) {
  const w = String(attribs.width ?? ""), h = String(attribs.height ?? "");
  if ((w === "1" || w === "0") && (h === "1" || h === "0")) return true;
  const style = String(attribs.style ?? "").replace(/\s+/g, "");
  if (/(^|;)(width:[01]px|height:[01]px|display:none)/i.test(style)) return true;
  return /\/(open|track|pixel|o\.gif)|open\.gif|tracking|\/e\/o\//i.test(String(attribs.src ?? ""));
}

/**
 * Cleans beehiiv's email HTML for the web: removes tracking pixels, the
 * unsubscribe/preferences footer, "view online" bars and template placeholders
 * where they can be identified (short blocks only — long content blocks stay).
 */
export function cleanEmailHtml(html: string) {
  return sanitizeHtml(bodyOnly(html), {
    // Pre-pass only: everything is kept here except what the filter drops. bodyOnly() already
    // removed <script>/<style>, and the result always goes through sanitizeRichText().
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    exclusiveFilter: (frame) => {
      if (frame.tag === "img" && isTrackingPixel(frame.attribs)) return true;
      if (frame.tag === "a" && FOOTER_HREF.test(String(frame.attribs.href ?? ""))) return true;
      if (BLOCKS.has(frame.tag)) {
        const text = (frame.text ?? "").replace(/\s+/g, " ").trim();
        if (text && text.length <= 400 && FOOTER_TEXT.test(text)) return true;
      }
      return false;
    },
  });
}

/** Plain-text emptiness test (images count as content). */
export function hasContent(html: string) {
  return stripHtml(html).trim().length > 0 || /<img\b/i.test(html);
}

export type PreparedContent = { html: string; source: "web" | "email" } | null;

/**
 * Prefers the post's web content; falls back to its email content (cleaned and
 * flagged "email"). Output always goes through sanitizeRichText: no scripts,
 * event handlers or unknown iframes; images keep their beehiiv URLs.
 */
export function prepareBeehiivContent(web: string | null | undefined, email: string | null | undefined): PreparedContent {
  if (web && hasContent(web)) {
    const html = sanitizeRichText(bodyOnly(web)).trim();
    if (hasContent(html)) return { html, source: "web" };
  }
  if (email && hasContent(email)) {
    const html = sanitizeRichText(cleanEmailHtml(email)).trim();
    if (hasContent(html)) return { html, source: "email" };
  }
  return null;
}

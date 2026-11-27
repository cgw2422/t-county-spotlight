import "server-only";
import sanitizeHtml from "sanitize-html";
import type { FileType } from "./shared";

/**
 * Text extraction, done locally (free) before anything is sent to AI:
 * - PDF: text per page (pdf.js via unpdf), marked "[Page N]" so findings can cite pages.
 * - Word: .docx (mammoth) and legacy .doc (word-extractor).
 * - HTML: visible text.
 * Scanned PDFs (no text layer) and images come back with `scanned: true`; the AI analysis then reads the
 * original file directly (Claude reads PDF pages and images), so scans are supported without separate OCR.
 */
export type Extracted = { text: string | null; pageCount: number | null; scanned: boolean; method: "text" | "none" };

/** Fewer letters than this per page on average → treat the PDF as a scan. */
const MIN_CHARS_PER_PAGE = 60;

export function sniffFileType(buf: Buffer, hint: { mime?: string | null; url?: string | null; filename?: string | null } = {}): FileType | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    // ZIP container: .docx has word/document.xml
    if (buf.includes(Buffer.from("word/"))) return "docx";
    return null;
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "doc"; // OLE2 (Word 97-2003)
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image";
  if (buf.subarray(0, 4).toString("latin1") === "II*\0" || buf.subarray(0, 4).toString("latin1") === "MM\0*") return "image";
  const head = buf.subarray(0, 2048).toString("utf8").toLowerCase();
  if (/<!doctype html|<html|<body|<div|<p[\s>]/.test(head) || /text\/html/.test(hint.mime ?? "")) return "html";
  if (/^text\/plain/.test(hint.mime ?? "") || /\.txt$/i.test(hint.filename ?? hint.url ?? "")) return "text";
  return null;
}

export const MIME: Record<FileType, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
  html: "text/html", image: "image/jpeg", text: "text/plain",
};

export function imageMime(buf: Buffer) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "II*\0" || buf.subarray(0, 4).toString("latin1") === "MM\0*") return "image/tiff";
  return "image/jpeg";
}

/** Visible text of an HTML page (scripts, styles and navigation chrome removed). */
export function htmlToText(html: string) {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const cleaned = body.replace(/<(script|style|noscript|nav|header|footer|svg|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|table)>|<br\s*\/?>/gi, "\n");
  return sanitizeHtml(cleaned, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

export async function extractText(buf: Buffer, fileType: FileType): Promise<Extracted> {
  switch (fileType) {
    case "pdf": {
      const { getDocumentProxy, extractText: pdfText } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { totalPages, text } = await pdfText(pdf, { mergePages: false });
      const pages = (text as string[]).map((t) => t.replace(/[ \t]+/g, " ").trim());
      const letters = pages.join("").replace(/[^A-Za-z]/g, "").length;
      if (letters < MIN_CHARS_PER_PAGE * Math.max(1, totalPages)) return { text: null, pageCount: totalPages, scanned: true, method: "none" };
      return { text: pages.map((p, i) => `[Page ${i + 1}]\n${p}`).join("\n\n"), pageCount: totalPages, scanned: false, method: "text" };
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: buf });
      return { text: r.value.trim() || null, pageCount: null, scanned: false, method: "text" };
    }
    case "doc": {
      const { default: WordExtractor } = await import("word-extractor");
      const d = await new WordExtractor().extract(buf);
      return { text: d.getBody().trim() || null, pageCount: null, scanned: false, method: "text" };
    }
    case "html": return { text: htmlToText(buf.toString("utf8")) || null, pageCount: null, scanned: false, method: "text" };
    case "text": return { text: buf.toString("utf8").trim() || null, pageCount: null, scanned: false, method: "text" };
    case "image": return { text: null, pageCount: 1, scanned: true, method: "none" };
  }
}

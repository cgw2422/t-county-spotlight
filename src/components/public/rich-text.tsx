import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";

/** Renders stored text that may be HTML (sanitized) or plain text (line breaks preserved). */
export function RichOrPlain({ text, className = "" }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return <div className={`${PROSE_CLASSES} text-slate-800 ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }} />;
  }
  return <p className={`whitespace-pre-line text-lg leading-relaxed text-slate-800 ${className}`}>{text}</p>;
}

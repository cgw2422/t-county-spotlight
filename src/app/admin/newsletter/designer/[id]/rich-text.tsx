"use client";
import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, Link2Off, List, ListOrdered } from "lucide-react";
import { plainToHtml, sanitizeIntroHtml, toEditorHtml } from "@/lib/newsletter-designer/render";

/**
 * Minimal rich-text editor for the personal introduction: paragraphs, bold, italic and links. Pasted content is
 * inserted as plain text; the saved HTML is sanitized again on the server (allowlist) before it's used.
 */
export function RichText({ value, onChange, label, minHeight = "min-h-40", testId = "rich-editor", compact = false }: { value: string; onChange: (html: string) => void; label: string; minHeight?: string; testId?: string; /** captions: bold, italic and links only */ compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  useEffect(() => {
    // Only reset the DOM when the value changes from outside (e.g. reopening a draft), never while typing.
    // Plain text from older drafts or pickers opens as paragraphs.
    if (ref.current && value !== last.current) { ref.current.innerHTML = toEditorHtml(value); last.current = value; }
  }, [value]);
  // Remember the browser-normalized markup so merely focusing the editor never counts as an edit.
  useEffect(() => { if (ref.current) { ref.current.innerHTML = toEditorHtml(value); last.current = ref.current.innerHTML; } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = () => {
    const html = ref.current?.innerHTML ?? "";
    if (html === last.current) return; // focus/blur without edits isn't a change
    last.current = html;
    onChange(html);
  };
  const cmd = (name: string, arg?: string) => { ref.current?.focus(); document.execCommand(name, false, arg); emit(); };
  const link = () => {
    const url = window.prompt("Link address (https://…)", "https://");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) { window.alert("Links must start with https:// or mailto:"); return; }
    cmd("createLink", url.trim());
  };
  const tool = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100";
  return (
    <div className="rounded-xl border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
      <div className="flex gap-1 border-b border-slate-200 p-1" role="toolbar" aria-label="Formatting">
        <button type="button" className={tool} onMouseDown={(e) => { e.preventDefault(); cmd("bold"); }} aria-label="Bold" title="Bold"><Bold className="h-4 w-4" /></button>
        <button type="button" className={tool} onMouseDown={(e) => { e.preventDefault(); cmd("italic"); }} aria-label="Italic" title="Italic"><Italic className="h-4 w-4" /></button>
        <button type="button" className={tool} onMouseDown={(e) => { e.preventDefault(); link(); }} aria-label="Add link" title="Add link"><Link2 className="h-4 w-4" /></button>
        <button type="button" className={tool} onMouseDown={(e) => { e.preventDefault(); cmd("unlink"); }} aria-label="Remove link" title="Remove link"><Link2Off className="h-4 w-4" /></button>
        {!compact && <button type="button" className={tool} onMouseDown={(e) => { e.preventDefault(); cmd("insertUnorderedList"); }} aria-label="Bulleted list" title="Bulleted list"><List className="h-4 w-4" /></button>}
        {!compact && <button type="button" className={tool} onMouseDown={(e) => { e.preventDefault(); cmd("insertOrderedList"); }} aria-label="Numbered list" title="Numbered list"><ListOrdered className="h-4 w-4" /></button>}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        data-testid={testId}
        className={`${minHeight} px-4 py-3 ${compact ? "text-sm" : "text-[15px]"} leading-relaxed text-slate-800 outline-none [&_a]:text-brand-700 [&_a]:underline [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6`}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Keep links, bold, italic and lists from pasted web content (cleaned to the same allowlist); plain text
          // becomes paragraphs, "* " lines become a list and web addresses become links.
          e.preventDefault();
          const html = e.clipboardData.getData("text/html");
          const cleaned = html ? sanitizeIntroHtml(html) : "";
          document.execCommand("insertHTML", false, cleaned.replace(/<[^>]+>/g, "").trim() ? cleaned : plainToHtml(e.clipboardData.getData("text/plain")));
          emit();
        }}
      />
    </div>
  );
}

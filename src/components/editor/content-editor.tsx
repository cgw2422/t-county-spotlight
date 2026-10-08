"use client";
import { useEffect, useRef, useState } from "react";
import { Code2, Eye, PenLine, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { previewHtml } from "@/app/admin/_actions/common";
import { PROSE_CLASSES } from "@/lib/prose";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "./rich-text-editor";

/**
 * Content field with two modes:
 *  - "visual": Tiptap rich-text editor
 *  - "html": preserve original HTML (source textarea + sanitized live preview).
 * Imported WordPress content defaults to "html" so block markup, galleries and
 * embeds are never silently stripped; switching to visual is an explicit opt-in.
 */
export function ContentEditor({ name, defaultValue, defaultMode = "visual", modeName = "editorMode", onChange, label = "Content", imported, stickyClass }: {
  name: string; defaultValue?: string | null; defaultMode?: "visual" | "html"; modeName?: string; onChange?: (html: string) => void; label?: string; imported?: boolean; stickyClass?: string;
}) {
  const [mode, setMode] = useState<"visual" | "html">(defaultMode);
  const [html, setHtml] = useState(defaultValue ?? "");
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState<"split" | "source" | "preview">("split");
  const [preview, setPreview] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshPreview(src = html) {
    setLoadingPreview(true);
    try { setPreview(await previewHtml(src)); } finally { setLoadingPreview(false); }
  }

  useEffect(() => {
    if (mode !== "html" || view === "source") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => refreshPreview(), 600);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [html, mode, view]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm" role="group" aria-label="Editor mode">
          <button type="button" aria-pressed={mode === "visual"} onClick={() => (mode === "visual" ? null : setConfirming(true))} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 font-medium", mode === "visual" ? "bg-white text-brand-700 shadow-sm" : "text-slate-600")}>
            <PenLine className="h-4 w-4" /> Visual
          </button>
          <button type="button" aria-pressed={mode === "html"} onClick={() => { setMode("html"); setView("split"); }} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 font-medium", mode === "html" ? "bg-white text-brand-700 shadow-sm" : "text-slate-600")}>
            <Code2 className="h-4 w-4" /> HTML
          </button>
        </div>
      </div>
      <input type="hidden" name={modeName} value={mode} />

      {confirming && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alertdialog" aria-labelledby="ce-warn">
          <p id="ce-warn" className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Switch to the visual editor?</p>
          <p className="mt-1">
            The visual editor supports paragraphs, headings, lists, quotes, links, images with captions and YouTube/Vimeo embeds.
            {imported ? " This content was imported from WordPress; " : " "}
            Other formatting (block layouts, galleries, columns, buttons, custom classes) may be simplified or removed when you save. The original is kept in revisions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={() => { setMode("visual"); setEditorKey((k) => k + 1); setConfirming(false); }}>Switch to visual</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirming(false)}>Keep HTML mode</button>
          </div>
        </div>
      )}

      {mode === "visual" ? (
        <RichTextEditor key={editorKey} stickyClass={stickyClass} name={name} defaultValue={html} onChange={(v) => { setHtml(v); onChange?.(v); }} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
            <div className="inline-flex gap-0.5 text-sm" role="group" aria-label="HTML view">
              {(["source", "split", "preview"] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("min-h-9 rounded-md px-3 font-medium capitalize", view === v ? "bg-white text-brand-700 shadow-sm" : "text-slate-600 hover:bg-white/60")}>
                  {v === "preview" ? <span className="inline-flex items-center gap-1"><Eye className="h-4 w-4" /> Preview</span> : v}
                </button>
              ))}
            </div>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              {imported && <span className="badge-blue">Preserving original HTML</span>}
              {view !== "source" && (
                <button type="button" onClick={() => refreshPreview()} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 hover:bg-white" aria-label="Refresh preview">
                  {loadingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </button>
              )}
            </span>
          </div>
          <div className={cn("grid", view === "split" && "lg:grid-cols-2")}>
            <textarea
              name={name}
              value={html}
              onChange={(e) => { setHtml(e.target.value); onChange?.(e.target.value); }}
              spellCheck={false}
              aria-label="HTML source"
              className={cn("block min-h-[480px] w-full resize-y border-0 bg-slate-950 p-4 font-mono text-[13px] leading-relaxed text-slate-100 focus:outline-none focus:ring-0", view === "preview" && "hidden", view === "split" && "lg:border-r lg:border-slate-200")}
            />
            {view !== "source" && (
              <div className="max-h-[720px] min-h-[480px] overflow-y-auto p-4 sm:p-6">
                {preview === null ? (
                  <p className="text-sm text-slate-400">Loading preview…</p>
                ) : (
                  <div className={PROSE_CLASSES} dangerouslySetInnerHTML={{ __html: preview }} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {mode === "html" && <p className="help">Preview shows exactly what visitors will see (scripts and unsafe markup are removed on display).</p>}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Loader2, Search, Upload, X, Check, Link2 } from "lucide-react";
import { listMedia, type MediaListItem } from "@/app/admin/_actions/common";
import { cn } from "@/lib/utils";

export async function uploadFile(file: File, alt?: string): Promise<MediaListItem> {
  const fd = new FormData();
  fd.append("file", file);
  if (alt) fd.append("alt", alt);
  const res = await fetch("/api/upload/", { method: "POST", body: fd });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Upload failed");
  return { id: json.id, url: json.url, filename: file.name, alt: json.alt ?? null, caption: null, width: json.width ?? null, height: json.height ?? null, mimeType: file.type };
}

/** Modal that browses the Media table, uploads new images, or accepts a URL. */
export function MediaLibraryDialog(props: { open: boolean; onClose: () => void; onSelect: (m: MediaListItem) => void; title?: string }) {
  // Remount per open so selection/search state starts fresh.
  if (!props.open) return null;
  return <MediaLibraryDialogInner {...props} />;
}

function MediaLibraryDialogInner({ open, onClose, onSelect, title = "Choose an image" }: {
  open: boolean; onClose: () => void; onSelect: (m: MediaListItem) => void; title?: string;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaListItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaListItem | null>(null);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  const load = useCallback(async (query: string, p: number) => {
    setLoading(true); setError(null);
    try {
      const r = await listMedia(query, p);
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items]));
      setHasMore(r.hasMore); setPage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listMedia("", 1)
      .then((r) => { if (!cancelled) { setItems(r.items); setHasMore(r.hasMore); setPage(1); } })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => { cancelled = true; window.removeEventListener("keydown", onKey); };
  }, [open]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setError(null);
    try {
      let last: MediaListItem | null = null;
      for (const f of Array.from(files)) last = await uploadFile(f);
      await load(q, 1);
      if (last) setSelected(last);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  if (!open || typeof document === "undefined") return null;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div onChange={stop} onInput={stop} onSubmit={stop} className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-slate-900/60" aria-label="Close" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[85vh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row">
          <div className="relative flex-1" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" className="input pl-9" placeholder="Search by filename, title or alt text (Enter)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); load(q, 1); } }} aria-label="Search media" />
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary flex-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setUrlMode(!urlMode)}><Link2 className="h-4 w-4" /> URL</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </div>
        {urlMode && (
          <div className="flex gap-2 border-b border-slate-100 p-3">
            <input className="input" placeholder="https://… or /media/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} aria-label="Image URL" />
            <button type="button" className="btn-primary" disabled={!/^(https?:\/\/|\/)/.test(url.trim())} onClick={() => { onSelect({ id: "", url: url.trim(), filename: url.trim(), alt: null, caption: null, width: null, height: null, mimeType: "" }); onClose(); }}>Use URL</button>
          </div>
        )}
        {error && <p role="alert" className="mx-3 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex-1 overflow-y-auto p-3">
          {!items.length && !loading ? (
            <div className="grid h-full place-items-center py-12 text-center text-sm text-slate-500">
              <div>
                <ImagePlus className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-2 font-medium text-slate-700">No images {q ? "match your search" : "in the library yet"}</p>
                <p>Upload one to get started.</p>
              </div>
            </div>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    onDoubleClick={() => { onSelect(m); onClose(); }}
                    className={cn("group relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-slate-100", selected?.id === m.id ? "border-brand-600 ring-2 ring-brand-200" : "border-transparent hover:border-slate-300")}
                    aria-pressed={selected?.id === m.id}
                    aria-label={m.alt || m.filename}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {selected?.id === m.id && <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white"><Check className="h-4 w-4" /></span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <div className="mt-4 text-center">
              <button type="button" className="btn-secondary" disabled={loading} onClick={() => load(q, page + 1)}>{loading && <Loader2 className="h-4 w-4 animate-spin" />} Load more</button>
            </div>
          )}
          {loading && !items.length && <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 pb-safe">
          <p className="min-w-0 truncate text-sm text-slate-600">{selected ? (selected.alt || selected.filename) : "Select an image"}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!selected} onClick={() => { if (selected) { onSelect(selected); onClose(); } }}>Use image</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MediaField({ name, defaultValue, label, help, altName, defaultAlt, aspect = "aspect-video", className }: {
  name: string; defaultValue?: string | null; label?: string; help?: string; altName?: string; defaultAlt?: string | null; aspect?: string; className?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [alt, setAlt] = useState(defaultAlt ?? "");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const changed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastUrl = useRef(url);
  useEffect(() => {
    if (!changed.current || lastUrl.current === url) return;
    lastUrl.current = url;
    // bubble a change so ActionForm marks the form dirty
    inputRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [url]);
  return (
    <div className={className}>
      {label && <span className="label">{label}</span>}
      <input ref={inputRef} type="hidden" name={name} value={url} />
      <div className={cn("relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50", aspect)}>
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className="h-full w-full object-cover" />
            <button type="button" onClick={() => { changed.current = true; setUrl(""); }} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow hover:bg-white" aria-label={`Remove ${label ?? "image"}`}><X className="h-4 w-4" /></button>
          </>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 p-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
            <ImagePlus className="h-6 w-6" /> Choose or upload
          </button>
        )}
      </div>
      {url && <button type="button" onClick={() => setOpen(true)} className="mt-1.5 min-h-9 text-sm font-medium text-brand-700 hover:underline">Replace image</button>}
      {altName && (
        <div className="mt-2">
          <label className="label" htmlFor={`f-${altName}`}>Alt text</label>
          <input id={`f-${altName}`} name={altName} className="input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Describe the image for screen readers" maxLength={300} />
        </div>
      )}
      {help && <p className="help">{help}</p>}
      <MediaLibraryDialog open={open} onClose={close} onSelect={(m) => { changed.current = true; setUrl(m.url); if (altName && !alt && m.alt) setAlt(m.alt); }} />
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

/**
 * Image picker for organization forms. Uploads to /api/gives/upload/ (checks
 * organization membership) and stores the URL in a hidden input named `name`.
 */
export function OrgImageUpload({ name, orgId, defaultValue, label, aspect = "aspect-video", help }: {
  name: string; orgId: string; defaultValue?: string | null; label?: string; aspect?: string; help?: string;
}) {
  const [url, setUrl] = useState(defaultValue || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  function change(v: string) {
    setUrl(v);
    // let surrounding forms notice the change (unsaved-changes indicators)
    queueMicrotask(() => hidden.current?.dispatchEvent(new Event("input", { bubbles: true })));
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("orgId", orgId);
    try {
      const res = await fetch("/api/gives/upload/", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Upload failed");
      change(json.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label && <span className="label">{label}</span>}
      <input ref={hidden} type="hidden" name={name} value={url} />
      <div className={`relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 ${aspect}`}>
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => change("")} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow hover:bg-white" aria-label="Remove image"><X className="h-4 w-4" /></button>
          </>
        ) : (
          <button type="button" onClick={() => input.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-sm text-slate-600 hover:bg-slate-100">
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
            {busy ? "Uploading…" : "Upload image"}
          </button>
        )}
      </div>
      {url && (
        <button type="button" onClick={() => input.current?.click()} className="mt-2 min-h-9 text-sm font-medium text-brand-700 hover:underline" disabled={busy}>
          {busy ? "Uploading…" : "Replace image"}
        </button>
      )}
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      {help && !error && <p className="help">{help}</p>}
      {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

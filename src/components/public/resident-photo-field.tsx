"use client";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Photo picker for resident (no-account) forms. Uploads through the anonymous,
 * rate-limited endpoint and emits one hidden `name` input per photo URL.
 * Used by the garage sale form (purpose "garage_sale") and community
 * suggestions (purpose "suggestion").
 */
export function ResidentPhotoField({ initial, name = "photos", max = 4, purpose = "garage_sale", help }: {
  initial: string[]; name?: string; max?: number; purpose?: "garage_sale" | "suggestion"; help?: React.ReactNode;
}) {
  const [photos, setPhotos] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-key`));
  const input = useRef<HTMLInputElement>(null);
  const full = photos.length >= max;

  async function upload(files: File[]) {
    setError(null);
    let current = photos.length;
    for (const file of files) {
      if (current >= max) { setError(`You can add up to ${max} photos.`); break; }
      if (file.size > MAX_BYTES) { setError(`“${file.name}” is larger than 8 MB.`); continue; }
      setBusy(true);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("formKey", formKey);
      fd.append("count", String(current));
      fd.append("purpose", purpose);
      try {
        const res = await fetch("/api/garage-sales/upload/", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Upload failed");
        current++;
        setPhotos((p) => [...p, json.url]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div>
      <span className="label">Photos (optional, up to {max})</span>
      {photos.map((p) => <input key={p} type="hidden" name={name} value={p} />)}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => setPhotos((all) => all.filter((x) => x !== p))} className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow hover:bg-white" aria-label={`Remove photo ${i + 1}`}><X className="h-4 w-4" /></button>
          </li>
        ))}
        {!full && (
          <li>
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600 hover:bg-slate-100">
              {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <ImagePlus className="h-6 w-6" aria-hidden />}
              {busy ? "Uploading…" : "Add photo"}
            </button>
          </li>
        )}
      </ul>
      <input ref={input} data-testid="photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" tabIndex={-1}
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(f); }} />
      {error ? <p role="alert" className="mt-2 text-sm text-red-600">{error}</p> : <p className="help">{help ?? "JPG, PNG, WebP or GIF, 8 MB max each."}</p>}
    </div>
  );
}

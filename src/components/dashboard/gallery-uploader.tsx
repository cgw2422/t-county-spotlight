"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addGalleryPhotos } from "@/app/dashboard/[businessId]/actions";

const MAX_EDGE = 2400;
const QUALITY = 0.85;
const MAX_BYTES = 25 * 1024 * 1024;

type Status = "queued" | "optimizing" | "uploading" | "uploaded" | "error";
type QueueItem = { id: string; file: File; preview: string; alt: string; status: Status; progress: number; error?: string; url?: string };

/** True for formats we never re-encode (vector, GIF, animated PNG/WebP). */
async function keepAsIs(file: File) {
  if (/svg|gif|icon/i.test(file.type)) return true;
  if (!/png|webp/i.test(file.type)) return false;
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const text = new TextDecoder("latin1").decode(head);
    return text.includes("acTL") || (text.startsWith("RIFF") && text.includes("ANIM"));
  } catch {
    return true;
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, QUALITY));
}

let webpSupport: boolean | null = null;
function supportsWebp() {
  if (webpSupport === null) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webpSupport;
}

/**
 * Client-side optimization: resize to 2400px on the long edge and re-encode as WebP
 * (JPEG fallback) at ~0.85. Keeps the original whenever that fails or isn't smaller.
 */
async function optimize(file: File): Promise<File> {
  if (await keepAsIs(file)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    const webpOk = supportsWebp();
    if (!webpOk) {
      ctx.fillStyle = "#ffffff"; // JPEG has no transparency
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await canvasBlob(canvas, webpOk ? "image/webp" : "image/jpeg");
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${file.name.replace(/\.[a-z0-9]+$/i, "") || "photo"}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

function uploadWithProgress(file: File, businessId: string, alt: string, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("businessId", businessId);
    if (alt) fd.append("alt", alt);
    xhr.open("POST", "/api/upload/");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let json: { url?: string; error?: string } = {};
      try { json = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && json.url) resolve(json.url);
      else reject(new Error(json.error || "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.send(fd);
  });
}

let seq = 0;

/**
 * Multi-photo gallery uploader: pick or drop several images, preview and remove them
 * before uploading, per-file progress, then one server call that adds what fits.
 * Only `remaining` photos can be queued; the server enforces the limit regardless.
 */
export function GalleryUploader({ businessId, remaining, max }: { businessId: string; remaining: number; max: number }) {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const pending = queue.filter((q) => q.status !== "uploaded");
  const slotsLeft = Math.max(0, remaining - pending.length);

  function enqueue(files: FileList | File[]) {
    setResult(null);
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const skippedType = Array.from(files).length - images.length;
    const accepted = images.slice(0, slotsLeft);
    const extra = images.length - accepted.length;
    const msgs: string[] = [];
    if (skippedType) msgs.push(`${skippedType} file${skippedType === 1 ? " isn't an image" : "s aren't images"} and ${skippedType === 1 ? "was" : "were"} skipped.`);
    if (extra) msgs.push(`${extra} photo${extra === 1 ? " wasn't" : "s weren't"} added — your plan includes ${max} gallery photos and you have room for ${slotsLeft} more.`);
    setNotice(msgs.join(" ") || null);
    if (!accepted.length) return;
    const items = accepted.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      return { id: `q${++seq}`, file, preview, alt: "", status: "queued" as Status, progress: 0 };
    });
    setQueue((q) => [...q.filter((x) => x.status !== "uploaded"), ...items]);
  }

  function remove(id: string) {
    setQueue((q) => q.filter((x) => x.id !== id));
    setNotice(null);
  }

  const patch = (id: string, p: Partial<QueueItem>) => setQueue((q) => q.map((x) => (x.id === id ? { ...x, ...p } : x)));

  async function uploadAll() {
    const todo = queue.filter((q) => q.status === "queued" || q.status === "error");
    if (!todo.length) return;
    setBusy(true);
    setResult(null);
    const done: { id: string; url: string; alt: string }[] = [];
    // Two at a time keeps phones responsive while still being quick.
    const workers = Array.from({ length: Math.min(2, todo.length) }, async (_, w) => {
      for (let i = w; i < todo.length; i += 2) {
        const item = todo[i];
        try {
          patch(item.id, { status: "optimizing", progress: 0, error: undefined });
          const file = await optimize(item.file);
          if (file.size > MAX_BYTES) throw new Error("This photo is larger than 25 MB.");
          patch(item.id, { status: "uploading" });
          const url = await uploadWithProgress(file, businessId, item.alt, (pct) => patch(item.id, { progress: pct }));
          patch(item.id, { status: "uploading", progress: 100, url });
          done.push({ id: item.id, url, alt: item.alt });
        } catch (e) {
          patch(item.id, { status: "error", error: (e as Error).message });
        }
      }
    });
    await Promise.all(workers);
    if (done.length) {
      const ordered = todo.map((t) => done.find((d) => d.id === t.id)).filter((d): d is { id: string; url: string; alt: string } => !!d);
      try {
        const r = await addGalleryPhotos(businessId, ordered.map((d) => ({ url: d.url, alt: d.alt })));
        ordered.forEach((d, i) => {
          if (i < r.added) patch(d.id, { status: "uploaded" });
          else patch(d.id, { status: "error", error: "Not added — your gallery is full." });
        });
        setResult({ message: r.message, error: r.error });
        if (r.added) router.refresh();
      } catch {
        setResult({ error: "We couldn't add your photos. Please try again." });
        ordered.forEach((d) => patch(d.id, { status: "error", error: "Not added. Please try again." }));
      }
    }
    setBusy(false);
  }

  const canUpload = !busy && queue.some((q) => q.status === "queued" || q.status === "error");

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); if (!busy && slotsLeft > 0) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy && e.dataTransfer.files.length) enqueue(e.dataTransfer.files); }}
        className={cn("rounded-2xl border-2 border-dashed p-5 text-center transition-colors", drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50")}
        data-testid="gallery-dropzone"
      >
        <UploadCloud className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
        <p className="mt-2 text-sm font-medium text-navy-900">Drag photos here</p>
        <p className="text-xs text-slate-500">or</p>
        <button type="button" onClick={() => input.current?.click()} disabled={busy || slotsLeft === 0} className="btn-secondary btn-sm mt-2 disabled:opacity-50">
          <ImagePlus className="h-4 w-4" aria-hidden /> Choose photos
        </button>
        <p className="mt-2 text-xs text-slate-500">
          {slotsLeft > 0 ? <>You can add {slotsLeft} more photo{slotsLeft === 1 ? "" : "s"}. </> : <>Your queue is full. </>}
          JPG, PNG or WebP. Large photos are resized automatically.
        </p>
        <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Choose photos"
          onChange={(e) => { if (e.target.files?.length) enqueue(e.target.files); e.target.value = ""; }} />
      </div>

      {notice && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}

      {queue.length > 0 && (
        <ul className="space-y-3" aria-label="Photos to upload">
          {queue.map((q) => (
            <li key={q.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-2.5" data-testid="queue-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-navy-900">{q.file.name}</p>
                {q.status === "queued" || q.status === "error" ? (
                  <input value={q.alt} onChange={(e) => patch(q.id, { alt: e.target.value })} maxLength={200} disabled={busy}
                    placeholder="Describe the photo (optional)" aria-label={`Description for ${q.file.name}`} className="input mt-1 !min-h-9 py-1 text-sm" />
                ) : null}
                {(q.status === "optimizing" || q.status === "uploading") && (
                  <div className="mt-2">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={q.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${q.file.name}`}>
                      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${q.progress}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{q.status === "optimizing" ? "Optimizing…" : `${q.progress}%`}</p>
                  </div>
                )}
                {q.status === "uploaded" && <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Added to your gallery</p>}
                {q.status === "error" && q.error && <p role="alert" className="mt-1 text-xs text-red-600">{q.error}</p>}
              </div>
              {(q.status === "queued" || q.status === "error") && !busy && (
                <button type="button" onClick={() => remove(q.id)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={`Remove ${q.file.name} from upload`}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {result?.message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{result.message}</p>}
      {result?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{result.error}</p>}

      {queue.some((q) => q.status !== "uploaded") && (
        <button type="button" onClick={uploadAll} disabled={!canUpload} className="btn-primary w-full">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? "Uploading…" : `Upload ${queue.filter((q) => q.status === "queued" || q.status === "error").length} photo${queue.filter((q) => q.status === "queued" || q.status === "error").length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  );
}

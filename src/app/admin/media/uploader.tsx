"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { uploadFile } from "@/components/admin/media-picker";
import { toast } from "@/components/admin/toast";

/** Multi-file uploader (button + drag & drop) that refreshes the grid when done. */
export function MediaUploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [over, setOver] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy({ done: 0, total: files.length });
    let ok = 0;
    for (const f of files) {
      try { await uploadFile(f); ok++; } catch (e) { toast(`${f.name}: ${(e as Error).message}`, "error"); }
      setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    setBusy(null);
    if (ok) toast(`Uploaded ${ok} file${ok === 1 ? "" : "s"}.`);
    router.refresh();
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"))); }}
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${over ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white"}`}
    >
      <button type="button" className="btn-primary" disabled={!!busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? `Uploading ${busy.done + 1} of ${busy.total}…` : "Upload images"}
      </button>
      <p className="text-sm text-slate-500">or drag and drop · JPG, PNG, WebP, GIF, AVIF, SVG · up to 15 MB each</p>
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-label="Upload images" onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
    </div>
  );
}

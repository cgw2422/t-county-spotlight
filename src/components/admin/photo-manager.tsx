"use client";
import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, ImagePlus, Trash2 } from "lucide-react";
import { MediaLibraryDialog } from "./media-picker";

export type Photo = { url: string; alt: string; caption: string };

/** Gallery editor: add from library/upload, remove, reorder, alt text + caption. */
export function PhotoManager({ name, defaultValue = [] }: { name: string; defaultValue?: Photo[] }) {
  const [photos, setPhotos] = useState<Photo[]>(defaultValue);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const move = (i: number, d: number) => setPhotos((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const set = (i: number, patch: Partial<Photo>) => setPhotos((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(photos)} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {photos.map((ph, i) => (
          <li key={ph.url + i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="relative aspect-[4/3] bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={ph.alt} className="h-full w-full object-cover" />
              <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">{i + 1}</span>
              <div className="absolute right-2 top-2 flex gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow disabled:opacity-40" aria-label="Move earlier"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="grid h-9 w-9 place-items-center rounded-full bg-white/95 shadow disabled:opacity-40" aria-label="Move later"><ChevronRight className="h-4 w-4" /></button>
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-full bg-white/95 text-red-600 shadow" aria-label="Remove photo"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="space-y-2 p-3">
              <input className="input" placeholder="Alt text (describe the photo)" aria-label={`Photo ${i + 1} alt text`} value={ph.alt} onChange={(e) => set(i, { alt: e.target.value })} maxLength={300} />
              <input className="input" placeholder="Caption (optional)" aria-label={`Photo ${i + 1} caption`} value={ph.caption} onChange={(e) => set(i, { caption: e.target.value })} maxLength={500} />
            </div>
          </li>
        ))}
        <li>
          <button type="button" onClick={() => setOpen(true)} className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            <ImagePlus className="h-7 w-7" /> Add photo
          </button>
        </li>
      </ul>
      <MediaLibraryDialog open={open} onClose={close} title="Add gallery photo" onSelect={(m) => setPhotos((p) => [...p, { url: m.url, alt: m.alt ?? "", caption: m.caption ?? "" }])} />
    </div>
  );
}

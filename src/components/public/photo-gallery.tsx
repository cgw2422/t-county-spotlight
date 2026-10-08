"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";

export type GalleryPhoto = { id: string; url: string; alt?: string | null; caption?: string | null };

/** Photo grid with a keyboard-accessible lightbox (Esc closes, ←/→ navigate, focus is trapped and restored). */
export function PhotoGallery({ photos, name }: { photos: GalleryPhoto[]; name: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastIndex = useRef<number>(0);
  const wasOpen = useRef(false);

  const close = useCallback(() => setIndex(null), []);
  const go = useCallback((d: number) => setIndex((i) => (i === null ? i : (i + d + photos.length) % photos.length)), [photos.length]);

  useEffect(() => {
    if (index === null) {
      if (wasOpen.current) triggerRefs.current[lastIndex.current]?.focus({ preventScroll: true });
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
  }, [index]);

  const open = index !== null;
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Tab" && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll<HTMLElement>("button");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close, go]);

  if (!photos.length) return null;
  const current = index !== null ? photos[index] : null;

  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        {photos.map((p, i) => (
          <li key={p.id} className={i === 0 && photos.length >= 3 ? "col-span-2 row-span-2 sm:col-span-2" : ""}>
            <button
              ref={(el) => { triggerRefs.current[i] = el; }}
              type="button"
              onClick={() => { lastIndex.current = i; setIndex(i); }}
              className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-slate-100"
              aria-label={`View photo ${i + 1} of ${photos.length}${p.alt ? `: ${p.alt}` : ""}`}
            >
              <SmartImage src={p.url} alt={p.alt || `${name} photo ${i + 1}`} fill sizes={i === 0 ? "(min-width:1024px) 40vw, 100vw" : "(min-width:1024px) 20vw, 50vw"} className="object-cover transition duration-500 group-hover:scale-105" />
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${name} photos`} className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="flex items-center justify-between p-3 text-white">
            <p className="text-sm" aria-live="polite">{index! + 1} / {photos.length}</p>
            <button ref={closeRef} type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close gallery"><X className="h-6 w-6" /></button>
          </div>
          <div className="relative flex-1" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <SmartImage key={current.id} src={current.url} alt={current.alt || `${name} photo ${index! + 1}`} fill sizes="100vw" className="object-contain" />
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => go(-1)} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Previous photo"><ChevronLeft className="h-7 w-7" /></button>
                <button type="button" onClick={() => go(1)} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70" aria-label="Next photo"><ChevronRight className="h-7 w-7" /></button>
              </>
            )}
          </div>
          {current.caption && <p className="p-4 text-center text-sm text-white/85">{current.caption}</p>}
        </div>
      )}
    </>
  );
}

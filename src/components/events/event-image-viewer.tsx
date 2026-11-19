"use client";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ExternalLink, Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Event image + "View full image": opens the original upload in a native <dialog>
 * (Escape, Close button or a click outside the image closes it; focus returns to the trigger).
 * Without JavaScript (or with a modifier-click) the links simply open the original URL in a new tab.
 */
export function EventImageViewer({ src, title, frameClassName, children }: { src: string; title: string; frameClassName?: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const [actualSize, setActualSize] = useState(false);

  const show = (e: MouseEvent<HTMLAnchorElement>) => {
    const d = dialogRef.current;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !d || typeof d.showModal !== "function") return;
    e.preventDefault();
    setActualSize(false);
    setOpen(true);
    d.showModal();
    closeRef.current?.focus();
  };
  const close = () => dialogRef.current?.close();

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { root.style.overflow = prev; };
  }, [open]);

  const linkProps = { href: src, target: "_blank", rel: "noopener", onClick: show } as const;
  return (
    <>
      <div className={frameClassName}>
        <a {...linkProps} tabIndex={-1} aria-hidden="true" className="block cursor-zoom-in">{children}</a>
      </div>
      <a {...linkProps} ref={triggerRef} aria-haspopup="dialog" className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline" data-testid="view-full-image">
        <Maximize2 className="h-4 w-4" aria-hidden /> View full image
      </a>
      <dialog
        ref={dialogRef}
        aria-label={`${title}: full image`}
        onClose={() => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }); }}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-black/95 p-0 text-white backdrop:bg-black/80"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-end gap-1 p-2 sm:gap-2 sm:p-3">
            <button type="button" onClick={() => setActualSize((v) => !v)} aria-pressed={actualSize} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10">
              {actualSize ? <ZoomOut className="h-4 w-4" aria-hidden /> : <ZoomIn className="h-4 w-4" aria-hidden />} {actualSize ? "Fit to screen" : "Actual size"}
            </button>
            <a href={src} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10">
              <ExternalLink className="h-4 w-4" aria-hidden /> Open original
            </a>
            <button ref={closeRef} type="button" onClick={close} aria-label="Close full image" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10">
              <X className="h-6 w-6" aria-hidden />
            </button>
          </div>
          {/* Scrolls in both directions at actual size; pinch-zoom works as on any page. */}
          <div className="flex min-h-0 flex-1 overflow-auto p-2 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            {open && (
              // The untouched original upload (not an optimized variant), so small print stays readable.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={`${title} (full image)`}
                onClick={() => setActualSize((v) => !v)}
                className={actualSize ? "m-auto max-w-none cursor-zoom-out" : "m-auto h-auto max-h-full w-auto max-w-full cursor-zoom-in object-contain"}
                data-testid="full-image"
              />
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

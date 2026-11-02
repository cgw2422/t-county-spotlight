"use client";
import { useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import { clampFocus, coverPosition } from "@/lib/cover";

/**
 * Focal-point editor for a cover photo. Click or drag on the preview (or use
 * the sliders) to choose the part of the photo that should stay visible when
 * the banner is cropped for different screens. Writes hidden inputs
 * `coverFocusX` / `coverFocusY` (0–100, 50 = center).
 */
export function CoverFocusControls({ imageUrl, defaultX = 50, defaultY = 50 }: { imageUrl: string; defaultX?: number | null; defaultY?: number | null }) {
  const [x, setX] = useState(clampFocus(defaultX ?? 50));
  const [y, setY] = useState(clampFocus(defaultY ?? 50));
  const box = useRef<HTMLDivElement>(null);
  const hiddenX = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  function set(nx: number, ny: number) {
    setX(clampFocus(nx));
    setY(clampFocus(ny));
    // let surrounding forms notice the change (unsaved-changes indicators)
    queueMicrotask(() => hiddenX.current?.dispatchEvent(new Event("input", { bubbles: true })));
  }
  function fromPointer(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    set(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  }
  const pos = coverPosition(x, y);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <input ref={hiddenX} type="hidden" name="coverFocusX" value={x} />
      <input type="hidden" name="coverFocusY" value={y} />
      <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-900"><Crosshair className="h-4 w-4" aria-hidden /> Focal point</p>
      <p className="help mt-0.5">Click or drag on the photo to choose what stays in view when the banner is cropped on phones and wide screens.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-500">Desktop banner</span>
          <div
            ref={box}
            className="relative aspect-[16/5] w-full cursor-crosshair touch-none overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200"
            onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
            onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" draggable={false} className="h-full w-full select-none object-cover" style={{ objectPosition: pos }} />
            <span aria-hidden className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600/70 shadow-[0_0_0_2px_rgba(0,0,0,0.35)]" style={{ left: `${x}%`, top: `${y}%` }} />
          </div>
        </div>
        <div className="w-36 sm:w-32">
          <span className="mb-1 block text-xs font-medium text-slate-500">Phone banner</span>
          <div className="relative aspect-[390/176] w-full overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: pos }} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">
          <span className="flex justify-between"><span>Horizontal</span><span className="tabular-nums text-slate-500">{x < 40 ? "Left" : x > 60 ? "Right" : "Center"} · {x}%</span></span>
          <input type="range" min={0} max={100} value={x} onChange={(e) => set(Number(e.target.value), y)} className="mt-1 w-full accent-brand-600" aria-label="Horizontal focal point" />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="flex justify-between"><span>Vertical</span><span className="tabular-nums text-slate-500">{y < 40 ? "Top" : y > 60 ? "Bottom" : "Middle"} · {y}%</span></span>
          <input type="range" min={0} max={100} value={y} onChange={(e) => set(x, Number(e.target.value))} className="mt-1 w-full accent-brand-600" aria-label="Vertical focal point" />
        </label>
      </div>
      {(x !== 50 || y !== 50) && (
        <button type="button" onClick={() => set(50, 50)} className="mt-2 min-h-9 text-sm font-medium text-brand-700 hover:underline">Reset to center</button>
      )}
    </div>
  );
}

/** Hidden inputs only — keeps the saved focal point when no photo is shown. */
export function CoverFocusHidden({ x, y }: { x?: number | null; y?: number | null }) {
  return (
    <>
      <input type="hidden" name="coverFocusX" value={clampFocus(x ?? 50)} />
      <input type="hidden" name="coverFocusY" value={clampFocus(y ?? 50)} />
    </>
  );
}

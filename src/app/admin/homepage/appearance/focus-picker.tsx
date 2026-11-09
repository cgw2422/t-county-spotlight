"use client";
import { useRef } from "react";
import { Crosshair } from "lucide-react";
import { clampFocus } from "@/lib/cover";

/**
 * Controlled focal-point picker: shows the whole image and lets the admin
 * click/drag (or use the sliders / arrow keys) to mark the part that must stay
 * visible when the hero crops it. Values are 0–100 (50/50 = center).
 */
export function FocusPicker({ id, label, help, imageUrl, x, y, onChange }: {
  id: string; label: string; help?: string; imageUrl: string; x: number; y: number; onChange: (x: number, y: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const set = (nx: number, ny: number) => onChange(clampFocus(nx), clampFocus(ny));
  function fromPointer(e: React.PointerEvent) {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width || !r.height) return;
    set(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  }
  function onKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 10 : 2;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    set(x + d[0], y + d[1]);
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-900"><Crosshair className="h-4 w-4" aria-hidden /> {label}</p>
      {help && <p className="help mt-0.5">{help}</p>}
      <div
        ref={box}
        id={id}
        role="slider"
        tabIndex={0}
        aria-label={`${label} (use arrow keys)`}
        aria-valuetext={`${x}% from left, ${y}% from top`}
        aria-valuenow={x}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={onKey}
        className="relative mt-3 w-full cursor-crosshair touch-none select-none overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
        onPointerMove={(e) => { if (dragging.current) fromPointer(e); }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" draggable={false} className="block max-h-80 w-full object-contain" />
        <span aria-hidden className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sunset-500/70 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]" style={{ left: `${x}%`, top: `${y}%` }} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">
          <span className="flex justify-between"><span>Horizontal</span><span className="tabular-nums text-slate-500">{x < 40 ? "Left" : x > 60 ? "Right" : "Center"} · {x}%</span></span>
          <input type="range" min={0} max={100} value={x} onChange={(e) => set(Number(e.target.value), y)} className="mt-1 w-full accent-brand-600" />
        </label>
        <label className="block text-sm text-slate-700">
          <span className="flex justify-between"><span>Vertical</span><span className="tabular-nums text-slate-500">{y < 40 ? "Top" : y > 60 ? "Bottom" : "Middle"} · {y}%</span></span>
          <input type="range" min={0} max={100} value={y} onChange={(e) => set(x, Number(e.target.value))} className="mt-1 w-full accent-brand-600" />
        </label>
      </div>
      {(x !== 50 || y !== 50) && <button type="button" onClick={() => set(50, 50)} className="mt-1 min-h-9 text-sm font-medium text-brand-700 hover:underline">Reset to center</button>}
    </div>
  );
}

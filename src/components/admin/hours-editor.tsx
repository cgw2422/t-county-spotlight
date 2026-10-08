"use client";
import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";

type Row = { day: string; open: string; close: string; closed: boolean };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

/** Weekly opening hours, stored as JSON in a hidden input. */
export function HoursEditor({ name, defaultValue }: { name: string; defaultValue?: Row[] | null }) {
  const [rows, setRows] = useState<Row[]>(() => DAYS.map((day) => defaultValue?.find((r) => r.day === day) ?? { day, open: "", close: "", closed: false }));
  const hidden = useRef<HTMLInputElement>(null);
  const last = useRef(JSON.stringify(rows));
  useEffect(() => {
    const v = JSON.stringify(rows);
    if (v === last.current) return;
    last.current = v;
    hidden.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [rows]);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <input ref={hidden} type="hidden" name={name} value={JSON.stringify(rows)} />
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.map((r, i) => (
          <li key={r.day} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_auto] sm:gap-x-3">
            <span className="text-sm font-semibold text-slate-800"><span className="sm:hidden">{r.day}</span><span className="hidden sm:inline">{FULL[r.day]}</span></span>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
              <input type="time" aria-label={`${FULL[r.day]} opens`} className="input w-full min-w-0 px-1.5 sm:px-2" value={r.open} disabled={r.closed} onChange={(e) => { e.stopPropagation(); set(i, { open: e.target.value }); }} onInput={(e) => e.stopPropagation()} />
              <span className="text-slate-400">–</span>
              <input type="time" aria-label={`${FULL[r.day]} closes`} className="input w-full min-w-0 px-1.5 sm:px-2" value={r.close} disabled={r.closed} onChange={(e) => { e.stopPropagation(); set(i, { close: e.target.value }); }} onInput={(e) => e.stopPropagation()} />
            </div>
            <div className="col-start-2 flex items-center gap-3 sm:col-start-auto">
              <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={r.closed} onChange={(e) => { e.stopPropagation(); set(i, { closed: e.target.checked }); }} /> Closed
              </label>
              {i === 0 && (
                <button type="button" className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => setRows((rs) => rs.map((x) => ({ ...x, open: rs[0].open, close: rs[0].close, closed: rs[0].closed })))}>
                  <Copy className="h-3.5 w-3.5" /> Copy to all
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="help">Leave a day blank if hours vary or are unknown.</p>
    </div>
  );
}

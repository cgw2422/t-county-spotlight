"use client";
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

/**
 * Filters: always visible on large screens, collapsible panel on phones.
 * Children should be plain server-rendered links/forms.
 */
export function FilterPanel({ children, activeCount = 0, label = "Filters" }: { children: React.ReactNode; activeCount?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="btn-secondary w-full justify-between lg:hidden"
        aria-expanded={open}
        aria-controls="filter-panel"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" aria-hidden /> {label}{activeCount > 0 && <span className="badge-blue">{activeCount}</span>}</span>
        {open ? <X className="h-4 w-4" aria-hidden /> : <span className="text-xs text-slate-500">Show</span>}
      </button>
      <div id="filter-panel" className={`${open ? "mt-3 block" : "hidden"} rounded-2xl border border-slate-200 bg-white p-4 lg:mt-0 lg:block lg:border-0 lg:bg-transparent lg:p-0`}>
        {children}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** In-page tabs; all panels stay mounted (forms keep their values when switching). */
export function ClientTabs({ tabs, initial }: { tabs: { id: string; label: string; content: React.ReactNode; badge?: string | number }[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  return (
    <div>
      <div className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <div role="tablist" className="flex min-w-max gap-1 border-b border-slate-200">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={cn(
                "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold",
                active === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
              {t.badge !== undefined && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] leading-none text-slate-600">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id}>
          {t.content}
        </div>
      ))}
    </div>
  );
}

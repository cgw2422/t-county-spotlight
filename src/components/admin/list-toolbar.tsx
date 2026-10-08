"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X, Loader2 } from "lucide-react";

export type ToolbarFilter = { name: string; label: string; options: { value: string; label: string }[] };

/** Search box + select filters that update the URL search params (page resets to 1). */
export function ListToolbar({ placeholder = "Search…", filters = [], searchName = "q" }: { placeholder?: string; filters?: ToolbarFilter[]; searchName?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get(searchName) ?? "");
  const [pending, start] = useTransition();

  function push(changes: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const active = filters.some((f) => sp.get(f.name)) || !!sp.get(searchName);

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
      <form
        role="search"
        className="relative min-w-0 flex-1 sm:min-w-[220px]"
        onSubmit={(e) => { e.preventDefault(); push({ [searchName]: q.trim() }); }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="input pl-9" />
      </form>
      {filters.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {filters.map((f) => (
            <select key={f.name} aria-label={f.label} className="input sm:w-auto sm:min-w-[150px]" value={sp.get(f.name) ?? ""} onChange={(e) => push({ [f.name]: e.target.value })}>
              <option value="">{f.label}: All</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading" />}
        {active && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setQ(""); push(Object.fromEntries([[searchName, ""], ...filters.map((f) => [f.name, ""])])); }}>
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

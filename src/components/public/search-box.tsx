import { Search } from "lucide-react";

/** Plain GET search form (works without JS). Extra hidden fields keep current filters. */
export function SearchBox({ action, defaultValue, placeholder = "Search…", label = "Search", hidden = {}, id = "q", size = "md" }: {
  action: string; defaultValue?: string; placeholder?: string; label?: string; hidden?: Record<string, string | undefined>; id?: string; size?: "md" | "lg";
}) {
  return (
    <form action={action} role="search" className={`flex w-full items-center gap-2 rounded-xl border border-slate-300 bg-white p-1 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 ${size === "lg" ? "sm:p-1.5" : ""}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search className="ml-2.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      <input id={id} name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} className="min-h-11 w-full min-w-0 bg-transparent px-1 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none" />
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <button className="btn-primary shrink-0">Search</button>
    </form>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { lookupRecords, type LookupItem, type LookupType } from "@/app/admin/_actions/common";

/**
 * Typeahead record picker. Emits one hidden input per selected id (`name`).
 * `ordered` adds up/down controls (used for homepage featured picks).
 */
export function SearchSelect({ name, type, initial = [], multiple = true, placeholder, publishedOnly, ordered, label, help, onChange }: {
  name: string; type: LookupType; initial?: LookupItem[]; multiple?: boolean; placeholder?: string; publishedOnly?: boolean; ordered?: boolean;
  label?: string; help?: string; onChange?: (items: LookupItem[]) => void;
}) {
  const [selected, setSelected] = useState<LookupItem[]>(initial);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const first = useRef(initial.map((s) => s.id).join(","));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await lookupRecords(type, q, { publishedOnly });
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open, type, publishedOnly]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const v = selected.map((s) => s.id).join(",");
    if (first.current === v) return;
    first.current = v;
    onChange?.(selected);
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(item: LookupItem) {
    setSelected((s) => (multiple ? (s.some((x) => x.id === item.id) ? s : [...s, item]) : [item]));
    setQ("");
    if (!multiple) setOpen(false);
  }
  function move(i: number, d: -1 | 1) {
    setSelected((s) => {
      const n = [...s];
      const j = i + d;
      if (j < 0 || j >= n.length) return s;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  return (
    <div ref={boxRef} className="relative">
      {label && <span className="label">{label}</span>}
      <input ref={hiddenRef} type="hidden" name={`${name}__present`} value="1" />
      {selected.map((s) => <input key={s.id} type="hidden" name={name} value={s.id} />)}
      {selected.length > 0 && (
        <ul className={ordered ? "mb-2 space-y-1.5" : "mb-2 flex flex-wrap gap-1.5"}>
          {selected.map((s, i) => (
            <li key={s.id} className={ordered ? "flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm" : "inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-sm text-brand-800 ring-1 ring-brand-100"}>
              {ordered && <span className="w-5 text-center text-xs font-semibold text-slate-400">{i + 1}</span>}
              <span className="min-w-0 flex-1 truncate">{s.label}{ordered && s.sub ? <span className="ml-1.5 text-xs text-slate-500">{s.sub}</span> : null}</span>
              {ordered && (
                <>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.label} up`}><ChevronUp className="h-4 w-4" /></button>
                  <button type="button" className="grid h-8 w-8 place-items-center rounded hover:bg-white disabled:opacity-30" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.label} down`}><ChevronDown className="h-4 w-4" /></button>
                </>
              )}
              <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white" onClick={() => setSelected((x) => x.filter((y) => y.id !== s.id))} aria-label={`Remove ${s.label}`}><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {(multiple || !selected.length) && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder={placeholder ?? "Search…"}
            value={q}
            onChange={(e) => { e.stopPropagation(); setQ(e.target.value); setOpen(true); }}
            onInput={(e) => e.stopPropagation()}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const r = results.find((x) => !selected.some((s) => s.id === x.id)); if (r) add(r); } if (e.key === "Escape") setOpen(false); }}
            aria-label={label ?? placeholder ?? "Search"}
            aria-expanded={open}
            role="combobox"
            aria-autocomplete="list"
          />
          {open && (
            <ul role="listbox" className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {loading && !results.length && <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</li>}
              {!loading && !results.length && <li className="px-3 py-2.5 text-sm text-slate-500">No matches</li>}
              {results.map((r) => {
                const isSel = selected.some((s) => s.id === r.id);
                return (
                  <li key={r.id} role="option" aria-selected={isSel}>
                    <button type="button" disabled={isSel} onClick={() => add(r)} className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
                      <span className="font-medium text-slate-800">{r.label}</span>
                      {r.sub && <span className="text-xs text-slate-500">{r.sub}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {help && <p className="help">{help}</p>}
    </div>
  );
}

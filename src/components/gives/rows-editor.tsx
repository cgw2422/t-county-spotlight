"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

type FieldDef =
  | { key: string; label: string; type?: "text" | "time"; placeholder?: string; maxLength?: number }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] };

/**
 * Small repeatable-rows editor (e.g. service times, leadership). Stores a
 * JSON array in a hidden input named `name` so it works with plain forms.
 */
export function RowsEditor({ name, fields, defaultValue = [], addLabel = "Add a row", emptyText, max = 30 }: {
  name: string; fields: FieldDef[]; defaultValue?: Record<string, string>[]; addLabel?: string; emptyText?: string; max?: number;
}) {
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.type === "select" ? f.options[0]?.value ?? "" : ""]));
  const [rows, setRows] = useState<Record<string, string>[]>(defaultValue);
  const hidden = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    hidden.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [rows]);
  const set = (i: number, k: string, v: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  return (
    <div>
      <input ref={hidden} type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length === 0 && emptyText && <p className="mb-3 text-sm text-slate-500">{emptyText}</p>}
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))_auto] sm:items-end">
              {fields.map((f) => {
                const id = `${name}-${i}-${f.key}`;
                return (
                  <div key={f.key} className="min-w-0">
                    <label htmlFor={id} className="label">{f.label}</label>
                    {f.type === "select" ? (
                      <select id={id} className="input" value={row[f.key] ?? ""} onChange={(e) => set(i, f.key, e.target.value)}>
                        {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input id={id} type={f.type ?? "text"} className="input" value={row[f.key] ?? ""} placeholder={f.placeholder} maxLength={f.maxLength ?? 120} onChange={(e) => set(i, f.key, e.target.value)} />
                    )}
                  </div>
                );
              })}
              <button type="button" className="btn-ghost text-slate-500 hover:text-red-600" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`}>
                <Trash2 className="h-4 w-4" /> <span className="sm:sr-only">Remove</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length < max && (
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setRows((r) => [...r, blank()])}>
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** Free-text tokens (tags, features…). Stores a JSON array in a hidden input. */
export function TokenInput({ name, defaultValue = [], placeholder = "Type and press Enter", label, help, suggestions = [] }: {
  name: string; defaultValue?: string[]; placeholder?: string; label?: string; help?: string; suggestions?: string[];
}) {
  const [tokens, setTokens] = useState<string[]>(defaultValue);
  const [text, setText] = useState("");
  const hidden = useRef<HTMLInputElement>(null);
  const last = useRef(JSON.stringify(tokens));
  useEffect(() => {
    const v = JSON.stringify(tokens);
    if (last.current === v) return;
    last.current = v;
    hidden.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [tokens]);
  function add(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setTokens((t) => [...t, ...parts.filter((p) => !t.some((x) => x.toLowerCase() === p.toLowerCase()))]);
    setText("");
  }
  const listId = `${name}-suggestions`;
  return (
    <div>
      {label && <label className="label" htmlFor={`tok-${name}`}>{label}</label>}
      <input ref={hidden} type="hidden" name={name} value={JSON.stringify(tokens)} />
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
        {tokens.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-sm text-slate-800">
            {t}
            <button type="button" className="grid h-6 w-6 place-items-center rounded-full hover:bg-slate-200" aria-label={`Remove ${t}`} onClick={() => setTokens((x) => x.filter((y) => y !== t))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          id={`tok-${name}`}
          list={suggestions.length ? listId : undefined}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-1 text-base outline-none focus:ring-0 sm:text-sm"
          value={text}
          placeholder={tokens.length ? "" : placeholder}
          onChange={(e) => { e.stopPropagation(); const v = e.target.value; if (v.endsWith(",")) add(v); else setText(v); }}
          onInput={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            if (e.key === "Backspace" && !text && tokens.length) setTokens((t) => t.slice(0, -1));
          }}
          onBlur={() => text.trim() && add(text)}
        />
        {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </div>
      {help && <p className="help">{help}</p>}
    </div>
  );
}

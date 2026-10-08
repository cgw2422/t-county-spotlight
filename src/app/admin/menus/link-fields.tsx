"use client";
import { useState } from "react";

/** Custom URL or published-page picker for menu items. */
export function LinkFields({ pages, defaultHref = "", defaultPageId = "" }: { pages: { id: string; title: string; href: string }[]; defaultHref?: string; defaultPageId?: string }) {
  const [type, setType] = useState<"custom" | "page">(defaultPageId ? "page" : "custom");
  return (
    <div className="space-y-3">
      <input type="hidden" name="linkType" value={type} />
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm" role="group" aria-label="Link type">
        <button type="button" aria-pressed={type === "custom"} onClick={() => setType("custom")} className={`min-h-9 rounded-md px-3 font-medium ${type === "custom" ? "bg-white text-brand-700 shadow-sm" : "text-slate-600"}`}>Custom link</button>
        <button type="button" aria-pressed={type === "page"} onClick={() => setType("page")} className={`min-h-9 rounded-md px-3 font-medium ${type === "page" ? "bg-white text-brand-700 shadow-sm" : "text-slate-600"}`}>Page</button>
      </div>
      {type === "custom" ? (
        <div>
          <label className="label" htmlFor="ml-href">URL</label>
          <input id="ml-href" name="href" className="input" defaultValue={defaultHref} placeholder="/events/ or https://…" required />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="ml-page">Published page</label>
          <select id="ml-page" name="pageId" className="input" defaultValue={defaultPageId} required>
            <option value="">Choose a page…</option>
            {pages.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.href})</option>)}
          </select>
          {!pages.length && <p className="help">No published pages yet.</p>}
        </div>
      )}
    </div>
  );
}

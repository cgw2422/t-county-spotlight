"use client";
import { useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, CalendarCheck, ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { MediaField } from "@/components/admin/media-picker";
import { SearchSelect } from "@/components/admin/search-select";
import type { LookupItem } from "@/app/admin/_actions/common";
import { cn, toDateInput } from "@/lib/utils";
import { savePulseResults } from "./actions";

export type ResultRowInput = {
  id: string;
  name: string;
  mentions: number | null;
  description: string;
  imageUrl: string;
  websiteUrl: string;
  business: LookupItem | null;
  organization: LookupItem | null;
};

type Row = {
  key: string;
  id: string | null;
  name: string;
  mentions: string;
  description: string;
  imageUrl: string;
  websiteUrl: string;
  linkType: "none" | "business" | "organization";
  business: LookupItem | null;
  organization: LookupItem | null;
  open: boolean;
};


function toRow(r: ResultRowInput): Row {
  return {
    key: r.id, id: r.id, name: r.name, mentions: r.mentions == null ? "" : String(r.mentions), description: r.description, imageUrl: r.imageUrl, websiteUrl: r.websiteUrl,
    linkType: r.business ? "business" : r.organization ? "organization" : "none", business: r.business, organization: r.organization, open: false,
  };
}
const blank = (key: string): Row => ({ key, id: null, name: "", mentions: "", description: "", imageUrl: "", websiteUrl: "", linkType: "none", business: null, organization: null, open: true });

export function ResultsEditor({ pulseId, displayMode, initial, resultsUpdatedAt }: { pulseId: string; displayMode: string; initial: ResultRowInput[]; resultsUpdatedAt: string }) {
  const [rows, setRows] = useState<Row[]>(() => (initial.length ? initial.map(toRow) : [blank("new-0")]));
  const seq = useRef(1); // deterministic keys keep server and client markup identical
  const [updated, setUpdated] = useState(resultsUpdatedAt);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const editorial = displayMode === "EDITORIAL_LIST";

  const payload = useMemo(() => JSON.stringify(rows.map((r) => ({
    id: r.id, name: r.name, mentions: r.mentions === "" ? null : Number(r.mentions), description: r.description || null,
    imageUrl: r.imageUrl || null, websiteUrl: r.websiteUrl || null,
    businessId: r.linkType === "business" ? r.business?.id ?? null : null,
    organizationId: r.linkType === "organization" ? r.organization?.id ?? null : null,
  }))), [rows]);

  /** State changes don't fire DOM input events — nudge ActionForm's dirty tracking. */
  function touch() {
    queueMicrotask(() => hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true })));
  }
  function update(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    touch();
  }
  function move(i: number, d: -1 | 1) {
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const n = [...rs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    touch();
  }
  function sortByMentions() {
    setRows((rs) => [...rs].sort((a, b) => (b.mentions === "" ? -1 : Number(b.mentions)) - (a.mentions === "" ? -1 : Number(a.mentions))));
    touch();
  }
  const max = Math.max(1, ...rows.map((r) => Number(r.mentions) || 0));

  return (
    <ActionForm action={savePulseResults} warnUnsaved className="space-y-4">
      <input type="hidden" name="id" value={pulseId} />
      <input ref={hiddenRef} type="hidden" name="results" value={payload} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="f-resultsUpdatedAt" className="label">Results last updated (public)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input id="f-resultsUpdatedAt" name="resultsUpdatedAt" type="date" value={updated} onChange={(e) => setUpdated(e.target.value)} className="input w-auto" />
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setUpdated(toDateInput(new Date()).slice(0, 10)); touch(); }}><CalendarCheck className="h-4 w-4" /> Set to today</button>
          </div>
          <p className="help">Left empty, today’s date is used when you save results.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editorial && <button type="button" className="btn-secondary btn-sm" onClick={sortByMentions}><ArrowDownWideNarrow className="h-4 w-4" /> Sort by mentions</button>}
        </div>
      </div>

      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <span className="mt-2.5 w-6 shrink-0 text-center text-sm font-bold text-slate-400" aria-hidden>{i + 1}</span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <div>
                  <label className="sr-only" htmlFor={`r-${r.key}-name`}>Result {i + 1} name</label>
                  <input id={`r-${r.key}-name`} value={r.name} maxLength={200} required onChange={(e) => update(r.key, { name: e.target.value })} className="input font-medium" placeholder="Name (required)" />
                </div>
                <div>
                  <label className="sr-only" htmlFor={`r-${r.key}-mentions`}>Result {i + 1} mentions</label>
                  <input
                    id={`r-${r.key}-mentions`} type="number" inputMode="numeric" min={0} max={1000000} step={1} value={r.mentions} required={!editorial}
                    onChange={(e) => update(r.key, { mentions: e.target.value.replace(/[^\d]/g, "") })} className="input" placeholder={editorial ? "Mentions (optional)" : "Mentions"}
                  />
                </div>
                {!editorial && r.mentions !== "" && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-2" aria-hidden>
                    <div className={cn("h-full rounded-full", i === 0 ? "bg-sunset-500" : "bg-hillside-600")} style={{ width: `${Math.max(2, (Number(r.mentions) / max) * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                <button type="button" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${r.name || `row ${i + 1}`} up`}><ChevronUp className="h-5 w-5" /></button>
                <button type="button" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${r.name || `row ${i + 1}`} down`}><ChevronDown className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-8 sm:pl-9">
              <button type="button" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-700 hover:underline" aria-expanded={r.open} onClick={() => update(r.key, { open: !r.open })}>
                <ChevronDown className={cn("h-4 w-4 transition", r.open && "rotate-180")} /> Details
                {(r.business || r.organization) && r.linkType !== "none" && <span className="badge-green ml-1">Linked</span>}
                {r.description && <span className="badge-gray ml-1">Description</span>}
                {r.imageUrl && <span className="badge-gray ml-1">Image</span>}
              </button>
              <button type="button" className="btn-ghost btn-sm text-red-700 hover:bg-red-50" onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); touch(); }} aria-label={`Remove ${r.name || `row ${i + 1}`}`}><Trash2 className="h-4 w-4" /> Remove</button>
            </div>
            {r.open && (
              <div className="mt-3 grid gap-4 border-t border-slate-100 pt-3 sm:pl-9 lg:grid-cols-[minmax(0,1fr)_200px]">
                <div className="space-y-3">
                  <div>
                    <label className="label" htmlFor={`r-${r.key}-link`}>Link to a directory listing</label>
                    <select id={`r-${r.key}-link`} value={r.linkType} onChange={(e) => update(r.key, { linkType: e.target.value as Row["linkType"] })} className="input">
                      <option value="none">No listing</option>
                      <option value="business">Business</option>
                      <option value="organization">Nonprofit / church / organization</option>
                    </select>
                  </div>
                  {r.linkType === "business" && (
                    <SearchSelect
                      key={`${r.key}-biz`} name={`r-${r.key}-biz`} type="business" multiple={false} initial={r.business ? [r.business] : []} placeholder="Search existing businesses…"
                      help="Searches the existing directory only — no listings are created."
                      onChange={(items) => { const b = items[0] ?? null; update(r.key, { business: b, ...(b && !r.name.trim() ? { name: b.label } : {}) }); }}
                    />
                  )}
                  {r.linkType === "organization" && (
                    <SearchSelect
                      key={`${r.key}-org`} name={`r-${r.key}-org`} type="organization" multiple={false} initial={r.organization ? [r.organization] : []} placeholder="Search existing organizations…"
                      help="Searches the existing directory only — no listings are created."
                      onChange={(items) => { const o = items[0] ?? null; update(r.key, { organization: o, ...(o && !r.name.trim() ? { name: o.label } : {}) }); }}
                    />
                  )}
                  <div>
                    <label className="label" htmlFor={`r-${r.key}-web`}>Website (optional)</label>
                    <input id={`r-${r.key}-web`} type="url" inputMode="url" value={r.websiteUrl} maxLength={2000} onChange={(e) => update(r.key, { websiteUrl: e.target.value })} className="input" placeholder="https://" />
                    <p className="help">Used only when no public listing is linked.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor={`r-${r.key}-desc`}>Description (optional)</label>
                    <textarea id={`r-${r.key}-desc`} rows={2} value={r.description} maxLength={1000} onChange={(e) => update(r.key, { description: e.target.value })} className="input" />
                  </div>
                </div>
                <MediaField name={`r-${r.key}-img`} label="Image (optional)" defaultValue={r.imageUrl} aspect="aspect-[4/3]" onChange={(url) => update(r.key, { imageUrl: url })} />
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <button type="button" className="btn-secondary" onClick={() => { const key = `new-${seq.current++}`; setRows((rs) => [...rs, blank(key)]); touch(); }}><Plus className="h-4 w-4" /> Add result</button>
        <div className="flex items-center gap-3">
          <DirtyIndicator />
          <Submit className="btn-primary" pendingText="Saving results…"><Save className="h-4 w-4" /> Save results</Submit>
        </div>
      </div>
      <p className="text-xs text-slate-500">{rows.length} result{rows.length === 1 ? "" : "s"}. Saving results doesn’t change the other fields above. {editorial ? "Editorial list mode: counts are optional and never shown." : "Order on the public page follows the entry’s “Sort results by” setting."}</p>
    </ActionForm>
  );
}

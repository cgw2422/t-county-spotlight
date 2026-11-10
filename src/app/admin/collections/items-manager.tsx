"use client";
import { useEffect, useState } from "react";
import { Loader2, MapPin, Plus, Search, ShieldCheck } from "lucide-react";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { MediaField } from "@/components/admin/media-picker";
import { SelectField, TextArea, TextField } from "@/components/admin/form-field";
import type { LookupItem } from "@/app/admin/_actions/common";
import { TUSCARAWAS_CITIES, cn } from "@/lib/utils";
import { addLinkedItem, addPlaceItem, searchCollectionTargets, updateItem } from "./actions";

type LinkedType = "BUSINESS" | "ARTICLE" | "EVENT" | "ORGANIZATION" | "PULSE";
const TABS: { key: LinkedType | "PLACE"; label: string }[] = [
  { key: "PLACE", label: "Place" },
  { key: "BUSINESS", label: "Business" },
  { key: "EVENT", label: "Event" },
  { key: "ARTICLE", label: "Article" },
  { key: "ORGANIZATION", label: "Nonprofit / church" },
  { key: "PULSE", label: "Community Pulse" },
];

export const AUTHENTIC_REMINDER = "Use authentic photos and verified location details.";

function LinkedSearch({ collectionId, type, existing }: { collectionId: string; type: LinkedType; existing: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchCollectionTargets(type, q);
        if (!cancelled) setResults(r);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, type]);
  return (
    <div>
      <label htmlFor="ci-search" className="label">Search published {TABS.find((t) => t.key === type)?.label.toLowerCase()} records</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input id="ci-search" type="search" className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name…" autoComplete="off" />
      </div>
      <p className="help">Only public records are listed (events must be upcoming). Unpublished or past items are hidden from the public page automatically.</p>
      <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="ci-results">
        {loading && !results.length && <li className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</li>}
        {!loading && !results.length && <li className="px-3 py-3 text-sm text-slate-500">No matches</li>}
        {results.map((r) => {
          const added = existing.includes(`${type}:${r.id}`);
          return (
            <li key={r.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{r.label}</span>
                {r.sub && <span className="block truncate text-xs text-slate-500">{r.sub}</span>}
              </span>
              {added ? (
                <span className="text-xs font-semibold text-slate-500">Added</span>
              ) : (
                <ActionButton action={addLinkedItem} fields={{ collectionId, itemType: type, targetId: r.id }} className="btn-secondary btn-sm">
                  <Plus className="h-4 w-4" aria-hidden /> Add<span className="sr-only"> {r.label}</span>
                </ActionButton>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export type PlaceValues = { title?: string | null; description?: string | null; imageUrl?: string | null; address?: string | null; city?: string | null; websiteUrl?: string | null; note?: string | null };

/** PLACE fields (shared by "add" and "edit"). */
export function PlaceFields({ v = {}, idPrefix }: { v?: PlaceValues; idPrefix: string }) {
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-lg bg-hillside-50 px-3 py-2 text-sm font-medium text-hillside-800" data-testid="authentic-reminder">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {AUTHENTIC_REMINDER}
      </p>
      <TextField id={`${idPrefix}-title`} name="title" label="Name" required maxLength={160} defaultValue={v.title ?? ""} placeholder="e.g. a park, trail, museum or historic site" />
      <TextArea id={`${idPrefix}-description`} name="description" label="Description" maxLength={1000} rows={3} defaultValue={v.description ?? ""} />
      <MediaField name="imageUrl" label="Photo (optional)" defaultValue={v.imageUrl} aspect="aspect-[4/3]" className="max-w-sm" help="Upload or pick a photo you have the right to use." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id={`${idPrefix}-address`} name="address" label="Street address" maxLength={200} defaultValue={v.address ?? ""} help="Leave blank if there is no verified street address." />
        <SelectField id={`${idPrefix}-city`} name="city" label="Community" required defaultValue={v.city ?? ""} placeholder="Choose a community…" options={TUSCARAWAS_CITIES} />
      </div>
      <TextField id={`${idPrefix}-website`} name="websiteUrl" type="url" label="Website (optional)" maxLength={2000} defaultValue={v.websiteUrl ?? ""} placeholder="https://" />
      <TextField id={`${idPrefix}-note`} name="note" label="Good to know (optional, shown publicly)" maxLength={300} defaultValue={v.note ?? ""} placeholder="e.g. Free parking at the north lot" />
    </div>
  );
}

export function AddItemPanel({ collectionId, existing }: { collectionId: string; existing: string[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("PLACE");
  return (
    <div>
      <div role="tablist" aria-label="Item type" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={cn("min-h-10 rounded-full px-3 text-sm font-semibold ring-1", tab === t.key ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")}>
            {t.key === "PLACE" && <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden />}{t.label}
          </button>
        ))}
      </div>
      {tab === "PLACE" ? (
        <ActionForm action={addPlaceItem} resetOnSuccess className="space-y-4">
          <input type="hidden" name="collectionId" value={collectionId} />
          <PlaceFields idPrefix="new-place" />
          <Submit className="btn-primary" pendingText="Adding…"><Plus className="h-4 w-4" /> Add place</Submit>
        </ActionForm>
      ) : (
        <LinkedSearch key={tab} collectionId={collectionId} type={tab} existing={existing} />
      )}
    </div>
  );
}

/** Edit form for one item: full PLACE fields, or optional overrides + note for linked records. */
export function ItemEditForm({ id, itemType, v }: { id: string; itemType: string; v: PlaceValues }) {
  return (
    <ActionForm action={updateItem} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {itemType === "PLACE" ? (
        <PlaceFields v={v} idPrefix={`edit-${id}`} />
      ) : (
        <>
          <p className="text-sm text-slate-600">Optional overrides — leave blank to use the listing&rsquo;s own name, description and photo.</p>
          <TextField id={`o-${id}-title`} name="title" label="Display title" maxLength={160} defaultValue={v.title ?? ""} />
          <TextArea id={`o-${id}-description`} name="description" label="Display description" maxLength={1000} rows={2} defaultValue={v.description ?? ""} />
          <MediaField name="imageUrl" label="Display photo" defaultValue={v.imageUrl} aspect="aspect-[4/3]" className="max-w-xs" />
          <TextField id={`o-${id}-note`} name="note" label="Good to know (optional, shown publicly)" maxLength={300} defaultValue={v.note ?? ""} />
        </>
      )}
      <Submit className="btn-primary btn-sm" pendingText="Saving…">Save item</Submit>
    </ActionForm>
  );
}

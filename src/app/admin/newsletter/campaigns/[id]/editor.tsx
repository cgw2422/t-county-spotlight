"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { MediaLibraryDialog } from "@/components/admin/media-picker";
import { toast } from "@/components/admin/toast";
import { cn } from "@/lib/utils";
import { SECTION_DEFAULTS, type NewsletterContent, type NLItem, type NLSection } from "@/lib/newsletter/content";
import { autoPopulateAction, saveCampaignAction, searchItemsAction } from "../../actions";

type Props = { id: string; subject: string; preheader: string; content: NewsletterContent; status: string };

export function CampaignEditor({ id, subject: s0, preheader: p0, content: c0, status }: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(s0);
  const [preheader, setPreheader] = useState(p0);
  const [content, setContent] = useState<NewsletterContent>(c0);
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [filling, startFill] = useTransition();
  const approved = status === "APPROVED" || status === "SCHEDULED";

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const touch = () => setDirty(true);
  const setSection = (key: string, fn: (s: NLSection) => NLSection) => { setContent((c) => ({ ...c, sections: c.sections.map((s) => (s.key === key ? fn(s) : s)) })); touch(); };

  function save() {
    if (approved && !confirm("This campaign is approved. Saving changes sends it back to Draft and it will need approval again. Continue?")) return;
    startSave(async () => {
      const r = await saveCampaignAction(id, { subject, preheader, content });
      if (r?.error) toast(r.error, "error");
      else { toast(r?.message ?? "Saved"); setDirty(false); router.refresh(); }
    });
  }

  function fill() {
    const hasItems = content.sections.some((s) => s.items.length);
    if (dirty && !confirm("You have unsaved changes. Auto-populate saves the campaign with fresh site content in every section (your subject and introduction stay). Continue?")) return;
    if (!dirty && hasItems && !confirm("Replace the items in every section with current site content? Your subject and introduction stay.")) return;
    startFill(async () => {
      if (dirty) {
        const r = await saveCampaignAction(id, { subject, preheader, content });
        if (r?.error) { toast(r.error, "error"); return; }
      }
      const r = await autoPopulateAction(id);
      if (r?.error) { toast(r.error, "error"); return; }
      if (r?.content) setContent(r.content);
      setDirty(false);
      toast(r?.message ?? "Filled");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Content</h2>
            <p className="text-sm text-slate-500">Everything is editable. Header, footer, postal address and unsubscribe links are added automatically.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
            <button type="button" className="btn-secondary" onClick={fill} disabled={filling || saving}>{filling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Auto-populate from site content</button>
            <button type="button" className="btn-primary" onClick={save} disabled={saving || filling}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nl-subject" className="label">Subject <span className="text-red-600" aria-hidden>*</span></label>
            <input id="nl-subject" className="input" value={subject} maxLength={150} onChange={(e) => { setSubject(e.target.value); touch(); }} />
          </div>
          <div>
            <label htmlFor="nl-pre" className="label">Preheader</label>
            <input id="nl-pre" className="input" value={preheader} maxLength={200} placeholder="Preview text shown after the subject in the inbox" onChange={(e) => { setPreheader(e.target.value); touch(); }} />
          </div>
        </div>
        <div className="mt-5">
          <RichTextEditor name="intro" label="Introduction" compact minHeight="min-h-[140px]" defaultValue={content.intro} onChange={(html) => { setContent((c) => ({ ...c, intro: html })); touch(); }} stickyClass="top-0" />
        </div>
      </div>

      {content.sections.map((s, si) => (
        <SectionEditor key={s.key} section={s} index={si} onChange={(fn) => setSection(s.key, fn)} />
      ))}

      <div className="card p-4 sm:p-5">
        <RichTextEditor name="outro" label="Closing note (outro)" compact minHeight="min-h-[120px]" defaultValue={content.outro} onChange={(html) => { setContent((c) => ({ ...c, outro: html })); touch(); }} stickyClass="top-0" />
        <p className="help">The footer (why you got this email, preferences and unsubscribe links, postal address) is added automatically.</p>
      </div>

      <div className="sticky bottom-3 z-20 flex justify-end">
        <button type="button" className={cn("btn-primary shadow-lg", !dirty && "opacity-0 pointer-events-none")} onClick={save} disabled={saving} aria-hidden={!dirty} tabIndex={dirty ? 0 : -1}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
        </button>
      </div>
    </div>
  );
}

function SectionEditor({ section: s, onChange }: { section: NLSection; index: number; onChange: (fn: (s: NLSection) => NLSection) => void }) {
  const [adding, setAdding] = useState(false);
  const def = SECTION_DEFAULTS[s.key];
  const move = (i: number, d: -1 | 1) => onChange((x) => {
    const items = [...x.items]; const j = i + d;
    if (j < 0 || j >= items.length) return x;
    [items[i], items[j]] = [items[j], items[i]];
    return { ...x, items };
  });
  const add = (item: NLItem) => onChange((x) => (x.items.some((i) => i.id === item.id) ? x : { ...x, items: [...x.items, item] }));
  return (
    <section className={cn("card", !s.enabled && "opacity-70")} aria-label={s.title}>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={s.enabled} onChange={(e) => onChange((x) => ({ ...x, enabled: e.target.checked }))} /> Include
        </label>
        <input aria-label="Section title" className="input max-w-xs flex-1 font-semibold" value={s.title} maxLength={120} onChange={(e) => onChange((x) => ({ ...x, title: e.target.value }))} />
        <span className="text-xs text-slate-500">{def.help}</span>
      </div>
      <div className="p-4 sm:p-5">
        {s.items.length ? (
          <ol className="space-y-3">
            {s.items.map((item, i) => (
              <ItemEditor key={item.id} item={item} first={i === 0} last={i === s.items.length - 1}
                onMove={(d) => move(i, d)}
                onRemove={() => onChange((x) => ({ ...x, items: x.items.filter((y) => y.id !== item.id) }))}
                onChange={(patch) => onChange((x) => ({ ...x, items: x.items.map((y) => (y.id === item.id ? { ...y, ...patch } : y)) }))} />
            ))}
          </ol>
        ) : <p className="text-sm text-slate-500">No items. {s.enabled ? "Empty sections are left out of the email." : ""}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding((a) => !a)}><Search className="h-4 w-4" /> Find &amp; add</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => add({ id: `custom-${Date.now()}`, refType: "custom", title: "New item" })}><Plus className="h-4 w-4" /> Custom item</button>
        </div>
        {adding && <ItemSearch sectionKey={s.key} onAdd={add} onClose={() => setAdding(false)} existing={s.items.map((i) => i.id)} />}
      </div>
    </section>
  );
}

function ItemEditor({ item, first, last, onMove, onRemove, onChange }: { item: NLItem; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onRemove: () => void; onChange: (p: Partial<NLItem>) => void }) {
  const [open, setOpen] = useState(item.refType === "custom" && item.title === "New item");
  const [media, setMedia] = useState(false);
  const fid = `it-${item.id}`;
  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 p-2.5">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded-md bg-slate-100 object-cover" />
        ) : <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-400"><ImagePlus className="h-4 w-4" /></span>}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={fid}>
          {item.meta && <span className="block truncate text-[11px] font-bold uppercase tracking-wide text-sunset-600">{item.meta}</span>}
          <span className="block truncate text-sm font-semibold text-slate-900">{item.title || "Untitled"}</span>
          {item.sponsored && <span className="badge-sponsored mt-0.5">Sponsored</span>}
        </button>
        <button type="button" className="grid h-9 w-9 place-items-center rounded hover:bg-slate-100 disabled:opacity-30" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${item.title} up`}><ChevronUp className="h-4 w-4" /></button>
        <button type="button" className="grid h-9 w-9 place-items-center rounded hover:bg-slate-100 disabled:opacity-30" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${item.title} down`}><ChevronDown className="h-4 w-4" /></button>
        <button type="button" className="grid h-9 w-9 place-items-center rounded text-red-600 hover:bg-red-50" onClick={onRemove} aria-label={`Remove ${item.title}`}><Trash2 className="h-4 w-4" /></button>
      </div>
      {open && (
        <div id={fid} className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
          <div><label className="label" htmlFor={`${fid}-t`}>Title</label><input id={`${fid}-t`} className="input" value={item.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} /></div>
          <div><label className="label" htmlFor={`${fid}-m`}>Label above title</label><input id={`${fid}-m`} className="input" value={item.meta ?? ""} maxLength={160} onChange={(e) => onChange({ meta: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor={`${fid}-x`}>Short text</label><textarea id={`${fid}-x`} className="input min-h-20" rows={2} value={item.text ?? ""} maxLength={600} onChange={(e) => onChange({ text: e.target.value })} /></div>
          <div><label className="label" htmlFor={`${fid}-u`}>Link</label><input id={`${fid}-u`} className="input" value={item.url ?? ""} maxLength={2000} placeholder="/events/… or https://…" onChange={(e) => onChange({ url: e.target.value })} /></div>
          <div>
            <label className="label" htmlFor={`${fid}-i`}>Image URL</label>
            <div className="flex gap-2"><input id={`${fid}-i`} className="input" value={item.imageUrl ?? ""} maxLength={2000} onChange={(e) => onChange({ imageUrl: e.target.value })} /><button type="button" className="btn-secondary" onClick={() => setMedia(true)} aria-label="Choose image from library"><ImagePlus className="h-4 w-4" /></button></div>
          </div>
          <div><label className="label" htmlFor={`${fid}-a`}>Image alt text</label><input id={`${fid}-a`} className="input" value={item.imageAlt ?? ""} maxLength={200} onChange={(e) => onChange({ imageAlt: e.target.value })} /></div>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!item.sponsored} onChange={(e) => onChange({ sponsored: e.target.checked })} /> Paid placement (labeled “Sponsored”)</label>
          <MediaLibraryDialog open={media} onClose={() => setMedia(false)} onSelect={(m) => onChange({ imageUrl: m.url, imageAlt: item.imageAlt || m.alt || "" })} />
        </div>
      )}
    </li>
  );
}

function ItemSearch({ sectionKey, onAdd, onClose, existing }: { sectionKey: string; onAdd: (i: NLItem) => void; onClose: () => void; existing: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<NLItem[]>([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try { const r = await searchItemsAction(sectionKey, q); if (n === seq.current) setResults(r); }
      finally { if (n === seq.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, sectionKey]);
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus className="input pl-9" placeholder="Search…" aria-label="Search site content" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close search"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2 max-h-64 overflow-y-auto">
        {loading && !results.length && <li className="flex items-center gap-2 p-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</li>}
        {!loading && !results.length && <li className="p-2 text-sm text-slate-500">Nothing current matches.</li>}
        {results.map((r) => {
          const added = existing.includes(r.id);
          return (
            <li key={r.id}>
              <button type="button" disabled={added} onClick={() => onAdd(r)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white disabled:opacity-50">
                <span className="min-w-0"><span className="block truncate font-medium text-slate-800">{r.title}</span>{r.meta && <span className="block truncate text-xs text-slate-500">{r.meta}</span>}</span>
                <span className="shrink-0 text-xs font-semibold text-brand-700">{added ? "Added" : "Add"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

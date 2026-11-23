"use client";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ClipboardCopy, CloudSun, ExternalLink, Loader2, Monitor, Plus, Search, Send, Smartphone, Trash2, TriangleAlert, X,
} from "lucide-react";
import { MediaField } from "@/components/admin/media-picker";
import { cn } from "@/lib/utils";
import { designWarnings, renderEmailDocument, type DesignMeta, type RenderContext } from "@/lib/newsletter-designer/render";
import { ADDABLE, emptyBusiness, emptyEvent, emptyStory, newSection, SECTION_INFO, uid, type EventItem, type Section, type StoryItem } from "@/lib/newsletter-designer/types";
import type { PickedBusiness, PickedStory } from "@/lib/newsletter-designer/server";
import { articleFullTextAction, checkBeehiivAction, saveDesignAction, searchArticlesAction, searchBusinessesAction, sendToBeehiivAction } from "../actions";
import { RichText } from "./rich-text";

type Beehiiv = { status: string; postId: string | null; editUrl: string | null; message: string | null; configured: boolean; hasTemplate: boolean };

const input = "input";
function F({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function MoveButtons({ onUp, onDown, onRemove, upDisabled, downDisabled, what }: { onUp: () => void; onDown: () => void; onRemove?: () => void; upDisabled: boolean; downDisabled: boolean; what: string }) {
  const b = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30";
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" className={b} onClick={onUp} disabled={upDisabled} aria-label={`Move ${what} up`} title="Move up"><ArrowUp className="h-4 w-4" /></button>
      <button type="button" className={b} onClick={onDown} disabled={downDisabled} aria-label={`Move ${what} down`} title="Move down"><ArrowDown className="h-4 w-4" /></button>
      {onRemove && <button type="button" className={cn(b, "text-red-600 hover:bg-red-50")} onClick={onRemove} aria-label={`Remove ${what}`} title="Remove"><Trash2 className="h-4 w-4" /></button>}
    </span>
  );
}

const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

// ───────────── pickers ─────────────

function ArticlePicker({ onPick, label = "Choose from the website" }: { onPick: (a: PickedStory) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickedStory[] | null>(null);
  const [pending, start] = useTransition();
  const run = useCallback((term: string) => start(async () => setRows(await searchArticlesAction(term))), []);
  useEffect(() => { if (open && rows === null) run(""); }, [open, rows, run]);
  if (!open) return <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)} data-testid="pick-article"><Search className="h-4 w-4" /> {label}</button>;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="article-picker">
      <div className="flex gap-2">
        <input className={cn(input, "min-w-0 flex-1")} placeholder="Search articles" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(q); } }} aria-label="Search articles" />
        <button type="button" className="btn-secondary btn-sm" onClick={() => run(q)}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="sr-only">Search</span></button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {rows?.length === 0 && <li className="p-2 text-sm text-slate-500">No published articles match.</li>}
        {rows?.map((a) => (
          <li key={a.articleId}>
            <button type="button" className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white" onClick={() => { onPick(a); setOpen(false); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.imageUrl ? <img src={a.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" /> : <span className="h-12 w-16 shrink-0 rounded bg-slate-200" />}
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{a.title}</span><span className="block truncate text-xs text-slate-500">{a.description}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BusinessPicker({ onPick }: { onPick: (b: PickedBusiness) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickedBusiness[] | null>(null);
  const [pending, start] = useTransition();
  const run = (term: string) => start(async () => setRows(await searchBusinessesAction(term)));
  if (!open) return <button type="button" className="btn-secondary btn-sm" onClick={() => { setOpen(true); if (rows === null) run(""); }} data-testid="pick-business"><Search className="h-4 w-4" /> Choose a business listing</button>;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="business-picker">
      <div className="flex gap-2">
        <input className={cn(input, "min-w-0 flex-1")} placeholder="Search businesses" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(q); } }} aria-label="Search businesses" />
        <button type="button" className="btn-secondary btn-sm" onClick={() => run(q)}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}<span className="sr-only">Search</span></button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {rows?.length === 0 && <li className="p-2 text-sm text-slate-500">No published businesses match.</li>}
        {rows?.map((b) => (
          <li key={b.businessId}>
            <button type="button" className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-white" onClick={() => { onPick(b); setOpen(false); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {b.imageUrl ? <img src={b.imageUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" /> : <span className="h-12 w-16 shrink-0 rounded bg-slate-200" />}
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{b.name}</span><span className="block truncate text-xs text-slate-500">{b.city ?? ""}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────── item editors ─────────────

function FullTextButton({ articleId, onText }: { articleId: string; onText: (html: string) => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <button type="button" className="btn-ghost btn-sm" disabled={pending} data-testid="use-full-text"
        onClick={() => { if (!window.confirm("Replace this text with the full article?")) return; start(async () => { const html = await articleFullTextAction(articleId); if (html) { setErr(""); onText(html); } else setErr("That article isn't published anymore."); }); }}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Use full article text
      </button>
      {err && <span className="text-xs text-red-700">{err}</span>}
    </span>
  );
}

function StoryFields({ item, onChange, field }: { item: StoryItem; onChange: (s: StoryItem) => void; field: string }) {
  return (
    <div className="space-y-3">
      <F label="Headline"><input className={input} value={item.title} onChange={(e) => onChange({ ...item, title: e.target.value })} data-testid={`${field}-title`} /></F>
      <div>
        <span className="label">Story text</span>
        <RichText value={item.description} onChange={(html) => onChange({ ...item, description: html })} label="Story text" minHeight="min-h-24" />
        {item.articleId && <FullTextButton articleId={item.articleId} onText={(html) => onChange({ ...item, description: html })} />}
      </div>
      <F label="Link (Read More)" hint={item.articleId ? "Linked to the T County Connect article. Edits here only change the newsletter." : undefined}><input className={input} value={item.url} placeholder="https://" onChange={(e) => onChange({ ...item, url: e.target.value })} data-testid={`${field}-url`} /></F>
      <MediaField key={`${item.id}:${item.imageUrl}`} name={`img-${item.id}`} label="Image" defaultValue={item.imageUrl} onChange={(u) => onChange({ ...item, imageUrl: u })} />
    </div>
  );
}

function EventFields({ e, onChange }: { e: EventItem; onChange: (e: EventItem) => void }) {
  return (
    <div className="space-y-3">
      <F label="Event title"><input className={input} value={e.title} onChange={(x) => onChange({ ...e, title: x.target.value })} data-testid="event-title" /></F>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Date"><input type="date" className={input} value={e.date} onChange={(x) => onChange({ ...e, date: x.target.value })} data-testid="event-date" /></F>
        <F label="Time"><input className={input} value={e.time} placeholder="6:00–9:00 PM" onChange={(x) => onChange({ ...e, time: x.target.value })} data-testid="event-time" /></F>
      </div>
      <F label="Location"><input className={input} value={e.location} placeholder="Dover Public Library" onChange={(x) => onChange({ ...e, location: x.target.value })} data-testid="event-location" /></F>
      <div><span className="label">Description (optional)</span><RichText value={e.description} onChange={(html) => onChange({ ...e, description: html })} label="Event description" minHeight="min-h-20" /></div>
      <F label="More information link"><input className={input} value={e.url} placeholder="https://" onChange={(x) => onChange({ ...e, url: x.target.value })} data-testid="event-url" /></F>
      <MediaField key={`${e.id}:${e.imageUrl}`} name={`img-${e.id}`} label="Image (optional)" defaultValue={e.imageUrl} onChange={(u) => onChange({ ...e, imageUrl: u })} />
    </div>
  );
}

function Collapsible({ title, children, defaultOpen = false, actions }: { title: string; children: React.ReactNode; defaultOpen?: boolean; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-1 pr-1">
        <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm font-semibold text-slate-800" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}<span className="truncate">{title}</span>
        </button>
        {actions}
      </div>
      {open && <div className="border-t border-slate-100 p-3">{children}</div>}
    </div>
  );
}

// ───────────── section editor ─────────────

function SectionBody({ s, update }: { s: Section; update: (s: Section) => void }) {
  switch (s.type) {
    case "intro":
      return (
        <div className="space-y-3">
          <F label="Heading (optional)"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          <div><span className="label">Your message</span><RichText value={s.html} onChange={(html) => update({ ...s, html })} label="Personal introduction" /></div>
          <F label="Sign-off"><input className={input} value={s.signature} onChange={(e) => update({ ...s, signature: e.target.value })} /></F>
        </div>
      );
    case "featured":
      return (
        <div className="space-y-3">
          <F label="Section label"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          <div className="flex flex-wrap gap-2">
            <ArticlePicker label={s.story ? "Replace with a website article" : "Choose from the website"} onPick={(a) => update({ ...s, story: { id: uid(), articleId: a.articleId, title: a.title, description: a.description, imageUrl: a.imageUrl, url: a.url } })} />
            {!s.story && <button type="button" className="btn-ghost btn-sm" onClick={() => update({ ...s, story: emptyStory() })}><Plus className="h-4 w-4" /> Enter manually</button>}
            {s.story && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => update({ ...s, story: null })}><X className="h-4 w-4" /> Clear</button>}
          </div>
          {s.story && <StoryFields item={s.story} field="featured" onChange={(st) => update({ ...s, story: st })} />}
          <F label="Button text"><input className={input} value={s.ctaLabel} onChange={(e) => update({ ...s, ctaLabel: e.target.value })} /></F>
        </div>
      );
    case "sponsor":
      return <p className="text-sm text-slate-600">This marks where your beehiiv Ad Network ad goes. The beehiiv draft gets an orange “add your ad here” line in this spot: replace it with your ad in beehiiv. Move this section to choose where the ad appears.</p>;
    case "weather":
      return (
        <div className="space-y-3">
          <F label="Section label"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><CloudSun className="mt-0.5 h-4 w-4 shrink-0 text-sunset-600" aria-hidden /> Comes from the National Weather Service weather feed, so it isn&apos;t typed in here. In beehiiv it&apos;s an RSS block: click its refresh icon just before sending so the forecast is current. The preview shows today&apos;s forecast.</p>
        </div>
      );
    case "events":
      return (
        <div className="space-y-3">
          <F label="Section label"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          <p className="text-xs text-slate-500">Events are added by hand only. Nothing is pulled in from the website automatically.</p>
          {s.items.map((e, i) => (
            <Collapsible key={e.id} defaultOpen={!e.title} title={e.title || `Event ${i + 1}`}
              actions={<MoveButtons what="event" onUp={() => update({ ...s, items: move(s.items, i, -1) })} onDown={() => update({ ...s, items: move(s.items, i, 1) })} onRemove={() => update({ ...s, items: s.items.filter((x) => x.id !== e.id) })} upDisabled={i === 0} downDisabled={i === s.items.length - 1} />}>
              <EventFields e={e} onChange={(ne) => update({ ...s, items: s.items.map((x) => (x.id === e.id ? ne : x)) })} />
            </Collapsible>
          ))}
          <button type="button" className="btn-secondary btn-sm" onClick={() => update({ ...s, items: [...s.items, emptyEvent()] })} data-testid="add-event"><Plus className="h-4 w-4" /> Add event</button>
        </div>
      );
    case "articles":
      return (
        <div className="space-y-3">
          <F label="Section label"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          {s.items.map((it, i) => (
            <Collapsible key={it.id} defaultOpen={!it.title} title={it.title || `Story ${i + 1}`}
              actions={<MoveButtons what="story" onUp={() => update({ ...s, items: move(s.items, i, -1) })} onDown={() => update({ ...s, items: move(s.items, i, 1) })} onRemove={() => update({ ...s, items: s.items.filter((x) => x.id !== it.id) })} upDisabled={i === 0} downDisabled={i === s.items.length - 1} />}>
              <StoryFields item={it} field="story" onChange={(st) => update({ ...s, items: s.items.map((x) => (x.id === it.id ? st : x)) })} />
            </Collapsible>
          ))}
          <div className="flex flex-wrap gap-2">
            <ArticlePicker label="Add from the website" onPick={(a) => update({ ...s, items: [...s.items, { id: uid(), articleId: a.articleId, title: a.title, description: a.description, imageUrl: a.imageUrl, url: a.url }] })} />
            <button type="button" className="btn-ghost btn-sm" onClick={() => update({ ...s, items: [...s.items, emptyStory()] })}><Plus className="h-4 w-4" /> Add manually</button>
          </div>
        </div>
      );
    case "spotlight": {
      const b = s.business;
      return (
        <div className="space-y-3">
          <F label="Section label"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          <div className="flex flex-wrap gap-2">
            <BusinessPicker onPick={(p) => update({ ...s, business: { businessId: p.businessId, name: p.name, imageUrl: p.imageUrl, text: p.text, url: p.url } })} />
            {!b && <button type="button" className="btn-ghost btn-sm" onClick={() => update({ ...s, business: emptyBusiness() })}><Plus className="h-4 w-4" /> Enter manually</button>}
            {b && <button type="button" className="btn-ghost btn-sm text-red-600" onClick={() => update({ ...s, business: null })}><X className="h-4 w-4" /> Clear</button>}
          </div>
          {b && (
            <div className="space-y-3">
              <F label="Business name"><input className={input} value={b.name} onChange={(e) => update({ ...s, business: { ...b, name: e.target.value } })} data-testid="spotlight-name" /></F>
              <div><span className="label">Write-up</span><RichText value={b.text} onChange={(html) => update({ ...s, business: { ...b, text: html } })} label="Business write-up" minHeight="min-h-28" /></div>
              <F label="Link (listing or website)"><input className={input} value={b.url} placeholder="https://" onChange={(e) => update({ ...s, business: { ...b, url: e.target.value } })} /></F>
              <MediaField key={`spot:${b.imageUrl}`} name="img-spotlight" label="Image or logo" defaultValue={b.imageUrl} onChange={(u) => update({ ...s, business: { ...b, imageUrl: u } })} />
            </div>
          )}
        </div>
      );
    }
    case "custom":
      return (
        <div className="space-y-3">
          <F label="Section label (optional)" hint="Small green label above the section, like “Community News”."><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} data-testid="custom-heading" /></F>
          <F label="Headline (optional)"><input className={input} value={s.title} onChange={(e) => update({ ...s, title: e.target.value })} data-testid="custom-title" /></F>
          <div><span className="label">Text</span><RichText value={s.html} onChange={(html) => update({ ...s, html })} label="Custom section text" /></div>
          <MediaField key={`${s.id}:${s.imageUrl}`} name={`img-${s.id}`} label="Image (optional)" defaultValue={s.imageUrl} onChange={(u) => update({ ...s, imageUrl: u })} />
          <F label="Image link (optional)"><input className={input} value={s.imageLink} placeholder="https://" onChange={(e) => update({ ...s, imageLink: e.target.value })} /></F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Button text (optional)"><input className={input} value={s.ctaLabel} onChange={(e) => update({ ...s, ctaLabel: e.target.value })} /></F>
            <F label="Button link"><input className={input} value={s.ctaUrl} placeholder="https://" onChange={(e) => update({ ...s, ctaUrl: e.target.value })} /></F>
          </div>
        </div>
      );
    case "promo":
      return (
        <div className="space-y-3">
          <F label="Heading"><input className={input} value={s.heading} onChange={(e) => update({ ...s, heading: e.target.value })} /></F>
          <div><span className="label">Message</span><RichText value={s.text} onChange={(html) => update({ ...s, text: html })} label="Promotional message" minHeight="min-h-24" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Button text"><input className={input} value={s.ctaLabel} onChange={(e) => update({ ...s, ctaLabel: e.target.value })} /></F>
            <F label="Button link"><input className={input} value={s.ctaUrl} onChange={(e) => update({ ...s, ctaUrl: e.target.value })} /></F>
          </div>
        </div>
      );
  }
}

// ───────────── editor ─────────────

export function DesignEditor({ id, initial, ctx, beehiiv: initialBeehiiv }: { id: string; initial: DesignMeta; ctx: RenderContext; beehiiv: Beehiiv }) {
  const [meta, setMeta] = useState<DesignMeta>(initial);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [open, setOpen] = useState<string | null>(initial.content.sections[0]?.id ?? null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [bh, setBh] = useState(initialBeehiiv);
  const [send, setSend] = useState({ weatherMode: "rss" as "rss" | "snapshot", archiveTag: true, sendAgain: false });
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string; editUrl?: string } | null>(null);
  const [sending, startSend] = useTransition();
  const [copied, setCopied] = useState(false);
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);

  // Every edit bumps the version; a save only marks the draft clean if nothing changed while it was saving.
  const version = useRef(0);
  const change = (m: DesignMeta) => { version.current += 1; setMeta(m); setDirty(true); };
  const setSections = (sections: Section[]) => change({ ...meta, content: { ...meta.content, sections } });
  const updateSection = (s: Section) => setSections(meta.content.sections.map((x) => (x.id === s.id ? s : x)));

  const save = useCallback(async () => {
    setSaveState({ kind: "saving" });
    const v = version.current;
    const r = await saveDesignAction(id, metaRef.current);
    if (r.ok) {
      if (version.current === v) setDirty(false);
      setSaveState({ kind: "saved", text: new Date(r.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) });
      return true;
    }
    setSaveState({ kind: "error", text: r.error });
    return false;
  }, [id]);

  // Autosave a few seconds after the last change; warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { void save(); }, 2500);
    return () => clearTimeout(t);
  }, [dirty, meta, save]);
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); } };
    window.addEventListener("beforeunload", onBefore);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("beforeunload", onBefore); window.removeEventListener("keydown", onKey); };
  }, [dirty, save]);

  const deferred = useDeferredValue(meta);
  const previewHtml = useMemo(() => renderEmailDocument(deferred, { ...ctx, preview: true }), [deferred, ctx]);
  const warnings = useMemo(() => designWarnings(meta, ctx), [meta, ctx]);

  const copyHtml = async () => {
    const html = renderEmailDocument(metaRef.current, { ...ctx, preview: false });
    try { await navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { window.alert("Copy failed. Use the Open preview link and copy the page source instead."); }
  };

  const doSend = () => startSend(async () => {
    setSendMsg(null);
    if (dirty && !(await save())) { setSendMsg({ ok: false, text: "Save failed, so nothing was sent." }); return; }
    const r = await sendToBeehiivAction(id, send);
    setSendMsg({ ok: r.ok, text: r.message, editUrl: r.editUrl });
    if (r.ok) setBh({ ...bh, status: "created", editUrl: r.editUrl ?? bh.editUrl, message: null });
    else if (/unknown/i.test(r.message) || /wasn.t retried/.test(r.message)) setBh({ ...bh, status: "unknown" });
  });
  const doCheck = () => startSend(async () => {
    const r = await checkBeehiivAction(id);
    setSendMsg({ ok: r.ok, text: r.message, editUrl: r.editUrl });
    if (r.editUrl) setBh({ ...bh, status: "created", editUrl: r.editUrl });
    else if (r.ok) setBh({ ...bh, status: "failed" });
  });

  const sections = meta.content.sections;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin/newsletter/designer/" className="text-sm font-medium text-brand-700 hover:underline">← All newsletters</Link>
          <span className="flex items-center gap-2 text-sm" aria-live="polite" data-testid="save-state">
            {saveState.kind === "saving" && <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>}
            {saveState.kind === "saved" && !dirty && <><Check className="h-4 w-4 text-emerald-600" /> Saved {saveState.text}</>}
            {saveState.kind === "error" && <span className="text-red-700">{saveState.text}</span>}
            {dirty && saveState.kind !== "saving" && <span className="text-slate-500">Unsaved changes</span>}
            <button type="button" className="btn-primary btn-sm" onClick={() => void save()} disabled={!dirty || saveState.kind === "saving"} data-testid="save-design">Save draft</button>
          </span>
        </div>

        <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="issue-settings">
          <h2 id="issue-settings" className="text-base font-semibold text-navy-900">Issue</h2>
          <F label="Email subject (beehiiv title)"><input className={input} value={meta.title} onChange={(e) => change({ ...meta, title: e.target.value })} data-testid="design-title" /></F>
          <F label="Preview text (beehiiv subtitle)" hint="Shown next to the subject in most inboxes."><input className={input} value={meta.previewText ?? ""} onChange={(e) => change({ ...meta, previewText: e.target.value })} /></F>
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Issue number"><input type="number" min={1} className={input} value={meta.issueNumber ?? ""} onChange={(e) => change({ ...meta, issueNumber: e.target.value ? Math.max(1, Math.min(99999, Number(e.target.value))) : null })} data-testid="issue-number" /></F>
            <F label="Issue date"><input type="date" className={input} value={meta.issueDate} onChange={(e) => e.target.value && change({ ...meta, issueDate: e.target.value })} data-testid="issue-date" /></F>
          </div>
        </section>

        <section aria-labelledby="sections-title" className="space-y-2">
          <h2 id="sections-title" className="text-base font-semibold text-navy-900">Sections</h2>
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">Header: logo, issue number and date (always included)</div>
          {sections.map((s, i) => {
            const info = SECTION_INFO[s.type];
            const isOpen = open === s.id;
            return (
              <div key={s.id} className={cn("rounded-xl border bg-white", s.enabled ? "border-slate-200" : "border-slate-200 opacity-75")} data-testid={`section-${s.type}`}>
                <div className="flex items-center gap-2 pl-3 pr-1">
                  <label className="flex shrink-0 items-center" title={s.enabled ? "Included" : "Not included"}>
                    <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={s.enabled} onChange={(e) => updateSection({ ...s, enabled: e.target.checked } as Section)} aria-label={`Include ${info.label}`} data-testid={`toggle-${s.type}`} />
                  </label>
                  <button type="button" className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} data-testid={`open-${s.type}`}>
                    {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{info.label}</span><span className="block truncate text-xs text-slate-500">{s.enabled ? info.help : "Not included in this issue"}</span></span>
                  </button>
                  <MoveButtons what={info.label} onUp={() => setSections(move(sections, i, -1))} onDown={() => setSections(move(sections, i, 1))} upDisabled={i === 0} downDisabled={i === sections.length - 1}
                    onRemove={() => { if (window.confirm(`Remove “${info.label}” from this issue?`)) setSections(sections.filter((x) => x.id !== s.id)); }} />
                </div>
                {isOpen && <div className="border-t border-slate-100 p-4"><SectionBody s={s} update={updateSection} /></div>}
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="add-section">
            <p className="mb-2 text-sm font-semibold text-navy-900">Add a section</p>
            <div className="flex flex-wrap gap-2">
              {ADDABLE.map((type) => (
                <button key={type} type="button" className="btn-secondary btn-sm" data-testid={`add-${type}`}
                  onClick={() => { const n = newSection(type); setSections([...sections, n]); setOpen(n.id); }}>
                  <Plus className="h-4 w-4" /> {SECTION_INFO[type].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">New sections go at the end; use the arrows to move them.</p>
          </div>
          <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-600">Footer: logo, website and social links (always included). beehiiv adds unsubscribe and preferences.</div>
        </section>

        <section className="card space-y-3 p-4 sm:p-5" aria-labelledby="send-title" data-testid="send-panel">
          <h2 id="send-title" className="text-base font-semibold text-navy-900">Send to beehiiv as a draft</h2>
          {!bh.configured && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">beehiiv isn&apos;t connected on this server (BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID). You can still preview and use Copy HTML.</p>}
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="design-warnings">
              {warnings.map((w) => <li key={w} className="flex gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{w}</li>)}
            </ul>
          )}
          <fieldset className="space-y-2 text-sm">
            <legend className="label">Weather in beehiiv</legend>
            <label className="flex items-start gap-2"><input type="radio" name="wmode" className="mt-1" checked={send.weatherMode === "rss"} onChange={() => setSend({ ...send, weatherMode: "rss" })} /> <span><strong>Live weather feed</strong> (recommended). Click the RSS block&apos;s refresh icon in beehiiv right before you send.</span></label>
            <label className="flex items-start gap-2"><input type="radio" name="wmode" className="mt-1" checked={send.weatherMode === "snapshot"} onChange={() => setSend({ ...send, weatherMode: "snapshot" })} /> <span><strong>Forecast image as of now</strong>. Use this if beehiiv won&apos;t accept the RSS block.</span></label>
          </fieldset>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={send.archiveTag} onChange={(e) => setSend({ ...send, archiveTag: e.target.checked })} /> <span>Tag as <code className="rounded bg-slate-100 px-1 text-xs">newsletter-archive</code> so the published issue appears in the T County Connect newsletter archive.</span></label>
          {bh.status === "created" && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={send.sendAgain} onChange={(e) => setSend({ ...send, sendAgain: e.target.checked })} data-testid="send-again" /> <span>This issue is already in beehiiv. <strong>Send a new draft anyway</strong> (the earlier draft stays in beehiiv).</span></label>}
          {!bh.hasTemplate && <p className="text-xs text-slate-500">Tip: in Newsletter Events → settings you can choose a beehiiv post template with a minimal header, so beehiiv&apos;s own header doesn&apos;t repeat this masthead.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={sending || !bh.configured || bh.status === "pending" || (bh.status === "created" && !send.sendAgain)} onClick={doSend} data-testid="send-beehiiv">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to beehiiv as draft
            </button>
            {bh.status === "unknown" && <button type="button" className="btn-secondary" onClick={doCheck} disabled={sending}>Check beehiiv</button>}
            <button type="button" className="btn-secondary" onClick={copyHtml} data-testid="copy-html">{copied ? <><Check className="h-4 w-4" /> Copied</> : <><ClipboardCopy className="h-4 w-4" /> Copy HTML</>}</button>
            {(sendMsg?.editUrl || bh.editUrl) && <a href={sendMsg?.editUrl ?? bh.editUrl!} target="_blank" rel="noopener noreferrer" className="btn-ghost"><ExternalLink className="h-4 w-4" /> Open in beehiiv</a>}
          </div>
          {sendMsg && <p role="status" className={cn("rounded-lg p-3 text-sm", sendMsg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800")} data-testid="send-result">{sendMsg.text}</p>}
          {!sendMsg && bh.message && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Last attempt: {bh.message}</p>}
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-500">
            <li>Send to beehiiv as draft (never published or sent from here).</li>
            <li>In beehiiv, replace the orange sponsor line with your Ad Network ad.</li>
            <li>Refresh the weather RSS block, review, and send from beehiiv.</li>
          </ol>
        </section>
      </div>

      <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Preview size">
            <button type="button" className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", device === "desktop" ? "bg-white shadow-sm text-navy-900" : "text-slate-600")} onClick={() => setDevice("desktop")} aria-pressed={device === "desktop"} data-testid="preview-desktop"><Monitor className="h-4 w-4" /> Desktop</button>
            <button type="button" className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium", device === "mobile" ? "bg-white shadow-sm text-navy-900" : "text-slate-600")} onClick={() => setDevice("mobile")} aria-pressed={device === "mobile"} data-testid="preview-mobile"><Smartphone className="h-4 w-4" /> Mobile</button>
          </div>
          <a href={`/admin/newsletter/designer/${id}/preview/`} target="_blank" rel="noopener" className="text-sm font-medium text-brand-700 hover:underline">Open saved preview ↗</a>
        </div>
        <div className="flex justify-center overflow-hidden rounded-2xl bg-slate-200 p-3">
          <iframe
            title="Newsletter preview"
            srcDoc={previewHtml}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            className="h-[78vh] rounded-xl bg-white shadow"
            style={{ width: device === "desktop" ? "100%" : 390, maxWidth: device === "desktop" ? 680 : 390 }}
            data-testid="design-preview"
          />
        </div>
      </div>
    </div>
  );
}

"use client";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, Loader2, Repeat, Send, Star } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { previewSignature, toolQuery, type ToolState } from "@/lib/newsletter-events-shared";
import { abandonRequestAction, createNewsletterEventsDraftAction, type AbandonState, type CreateDraftState } from "./actions";
import { CheckBeehiivButton } from "./check-button";

export type ToolOccurrence = { key: string; title: string; when: string; place: string | null; price: string | null; recurring: boolean; startIso: string };

export function EventsTool({ occurrences, initial, token: renderToken, preview, previewSig, configured, archiveTag, draftsUrl }: {
  occurrences: ToolOccurrence[];
  initial: ToolState;
  token: string;
  preview: { html: string; cardsHtml: string; count: number } | null;
  previewSig: string | null;
  configured: boolean;
  archiveTag: string;
  draftsUrl: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, startNav] = useTransition();
  const [s, setS] = useState<ToolState>(initial);
  const [rangeDraft, setRangeDraft] = useState({ from: initial.from, to: initial.to });
  const set = (patch: Partial<ToolState>) => setS((p) => ({ ...p, ...patch }));

  // Range comes from the server (it may be clamped); keep it in sync after navigation.
  const [seenRange, setSeenRange] = useState(`${initial.from}|${initial.to}`);
  if (seenRange !== `${initial.from}|${initial.to}`) {
    setSeenRange(`${initial.from}|${initial.to}`);
    setS((p) => ({ ...p, from: initial.from, to: initial.to }));
    setRangeDraft({ from: initial.from, to: initial.to });
  }

  // ── Request token (duplicate guard): one token per draft attempt ──
  const [token, setToken] = useState(renderToken);
  const [result, createAction] = useActionState<CreateDraftState, FormData>(createNewsletterEventsDraftAction, null);
  const [abandoned, abandonAction] = useActionState<AbandonState, FormData>(abandonRequestAction, null);
  const [seenAt, setSeenAt] = useState(0);
  if (result && result.at !== seenAt) {
    setSeenAt(result.at);
    if ((result.status === "failed" || result.status === "invalid") && result.nextToken) setToken(result.nextToken);
  }
  const [seenAbandon, setSeenAbandon] = useState(0);
  if (abandoned && abandoned.at !== seenAbandon) {
    setSeenAbandon(abandoned.at);
    setToken(abandoned.nextToken);
  }
  const current = result && "record" in result && result.record?.token === token ? result : null;
  const locked = !!current && (current.status === "created" || current.status === "unknown" || current.status === "duplicate");
  const startNew = () => setToken(renderToken !== token ? renderToken : crypto.randomUUID());

  // ── Selection ──
  const excluded = useMemo(() => new Set(s.excluded), [s.excluded]);
  const keys = useMemo(() => new Set(occurrences.map((o) => o.key)), [occurrences]);
  const featured = s.featured && keys.has(s.featured) ? s.featured : null;
  const selectedCount = occurrences.filter((o) => o.key === featured || !excluded.has(o.key)).length;
  const toggle = (key: string, on: boolean) => set({ excluded: on ? s.excluded.filter((k) => k !== key) : [...s.excluded, key] });

  // Keep the URL in step with the form, so a reload (or a failed draft) keeps everything.
  useEffect(() => {
    const q = toolQuery(s, { preview: !!preview });
    const url = `${pathname}?${q}`;
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(window.history.state, "", url);
  }, [s, pathname, preview]);

  const go = (state: ToolState, withPreview: boolean) => startNav(() => router.push(`${pathname}?${toolQuery(state, { preview: withPreview })}`, { scroll: false }));
  const stale = !!preview && previewSig !== previewSignature({ ...s, featured });
  const canCreate = configured && !!s.title.trim() && selectedCount > 0 && !locked;

  return (
    <div className="space-y-6">
      <section className="card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">1. Date range</h2>
        <p className="mt-0.5 text-sm text-slate-500">Dates are Eastern time. Defaults to the next 7 days. Events that already ended are never listed.</p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); go({ ...s, ...rangeDraft }, !!preview); }}>
          <label className="block"><span className="label">From</span><input type="date" name="from" className="input" value={rangeDraft.from} onChange={(e) => setRangeDraft((r) => ({ ...r, from: e.target.value }))} data-testid="range-from" required /></label>
          <label className="block"><span className="label">To (inclusive)</span><input type="date" name="to" className="input" value={rangeDraft.to} onChange={(e) => setRangeDraft((r) => ({ ...r, to: e.target.value }))} data-testid="range-to" required /></label>
          <button type="submit" className="btn-secondary min-h-11" disabled={navigating}>{navigating && <Loader2 className="h-4 w-4 animate-spin" />}Update range</button>
        </form>
      </section>

      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Events <span className="font-normal text-slate-500" data-testid="selected-count">({selectedCount} of {occurrences.length} selected)</span></h2>
            <p className="mt-0.5 text-sm text-slate-500">Published public events only, in date order. Recurring events show each date in the range. Feature one to show it first in a shaded card.</p>
          </div>
          {occurrences.length > 0 && (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => set({ excluded: [] })}>Select all</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => set({ excluded: occurrences.map((o) => o.key), featured: null })}>Select none</button>
            </div>
          )}
        </div>
        {occurrences.length ? (
          <>
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input type="radio" name="featured" checked={!featured} onChange={() => set({ featured: null })} data-testid="feature-none" /> No featured event
            </label>
            <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="occurrence-list">
              {occurrences.map((o) => {
                const isFeat = featured === o.key;
                const on = isFeat || !excluded.has(o.key);
                return (
                  <li key={o.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:flex-nowrap", isFeat && "bg-cream", !on && "opacity-60")} data-key={o.key} data-testid="occurrence">
                    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={on} disabled={isFeat} onChange={(e) => toggle(o.key, e.target.checked)} aria-label={`Include ${o.title}`} data-testid="occ-check" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{o.title}</span>
                        <span className="block text-xs text-slate-600">{o.when}{o.place ? ` · ${o.place}` : ""}{o.price ? ` · ${o.price}` : ""}</span>
                        {o.recurring && <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-hillside-700"><Repeat className="h-3 w-3" aria-hidden /> Recurring — this date</span>}
                      </span>
                    </label>
                    <label className={cn("ml-7 flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-xs font-semibold sm:ml-0", isFeat ? "text-hillside-700" : "text-slate-500")}>
                      <input type="radio" name="featured" checked={isFeat} onChange={() => set({ featured: o.key, excluded: s.excluded.filter((k) => k !== o.key) })} data-testid="occ-feature" />
                      <Star className={cn("h-3.5 w-3.5", isFeat && "fill-current")} aria-hidden /> {isFeat ? "Featured" : "Feature"}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        ) : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600" data-testid="no-events">No published events in this date range.</p>}
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">3. Issue details</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="label">Issue title <span className="text-red-600">*</span></span>
            <input className="input" value={s.title} maxLength={250} onChange={(e) => set({ title: e.target.value })} placeholder="This Week in T County" data-testid="issue-title" required />
          </label>
          <label className="block sm:col-span-2"><span className="label">Subtitle (optional)</span>
            <input className="input" value={s.subtitle} maxLength={250} onChange={(e) => set({ subtitle: e.target.value })} data-testid="issue-subtitle" />
          </label>
          <label className="block sm:col-span-2"><span className="label">Intro line (optional)</span>
            <input className="input" value={s.intro} maxLength={500} onChange={(e) => set({ intro: e.target.value })} data-testid="issue-intro" />
            <span className="help">A normal paragraph under “Things to Do” — you can edit it in beehiiv. Leave empty to skip it.</span>
          </label>
          <label className="flex items-start gap-3 sm:col-span-2">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={s.archiveTag} onChange={(e) => set({ archiveTag: e.target.checked })} data-testid="archive-tag" />
            <span className="text-sm"><span className="font-semibold text-slate-800">Tag as <code className="rounded bg-slate-100 px-1 text-xs">{archiveTag}</code></span>
              <span className="block text-slate-500">When you publish this issue in beehiiv, the site sync files it under /newsletter/ instead of creating an Article. Drafts are never imported.</span></span>
          </label>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">4. Preview and create</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary min-h-11" onClick={() => go({ ...s, featured }, true)} disabled={navigating || selectedCount === 0} data-testid="preview-btn">
            {navigating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview
          </button>
          {!locked && (
            <form action={createAction} className="contents">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="from" value={s.from} />
              <input type="hidden" name="to" value={s.to} />
              <input type="hidden" name="ex" value={s.excluded.filter((k) => keys.has(k)).join(",")} />
              <input type="hidden" name="feat" value={featured ?? ""} />
              <input type="hidden" name="title" value={s.title} />
              <input type="hidden" name="subtitle" value={s.subtitle} />
              <input type="hidden" name="intro" value={s.intro} />
              <input type="hidden" name="tag" value={s.archiveTag ? "1" : "0"} />
              <SubmitButton className="btn-primary min-h-11" pendingText="Creating draft…" disabled={!canCreate} data-testid="create-draft">
                <Send className="h-4 w-4" /> Create Beehiiv Draft
              </SubmitButton>
            </form>
          )}
          {!configured && <span className="text-sm text-amber-800">Creating drafts needs the beehiiv Railway variables listed above.</span>}
          {configured && !s.title.trim() && !locked && <span className="text-sm text-slate-500">Enter an issue title to create a draft.</span>}
        </div>
        <p className="mt-2 text-xs text-slate-500">Creates a <strong>draft</strong> only. Nothing is scheduled, published or emailed — you review and send it in beehiiv.</p>

        <ResultPanel result={result} current={current} token={token} draftsUrl={draftsUrl} onStartNew={startNew} abandonAction={abandonAction} />
      </section>

      {preview && (
        <section className="card p-4 sm:p-5" data-testid="preview">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Email preview <span className="font-normal text-slate-500">({preview.count} event{preview.count === 1 ? "" : "s"})</span></h2>
              <p className="mt-0.5 text-sm text-slate-500">The event cards are the exact HTML sent to beehiiv. The heading, intro and button are beehiiv blocks — your beehiiv template styles them, so they will look a little different there.</p>
            </div>
          </div>
          {stale && <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="preview-stale"><AlertTriangle className="h-4 w-4" aria-hidden /> You changed the selection since this preview. Click Preview to refresh it. The draft always uses your current selection.</p>}
          <div className="mt-4 flex flex-wrap items-start gap-6">
            <figure className="min-w-0 max-w-full overflow-x-auto">
              <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Desktop</figcaption>
              <iframe title="Desktop email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={preview.html} className="block rounded-lg border border-slate-200 bg-white" style={{ width: 640, height: 900 }} data-testid="preview-desktop" />
            </figure>
            <figure className="min-w-0 max-w-full overflow-x-auto">
              <figcaption className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Mobile (375px)</figcaption>
              <iframe title="Mobile email preview" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={preview.html} className="block rounded-lg border border-slate-200 bg-white" style={{ width: 375, height: 900 }} data-testid="preview-mobile" />
            </figure>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Event cards HTML</summary>
            <textarea readOnly className="input mt-2 h-48 font-mono text-xs" value={preview.cardsHtml} aria-label="Event cards HTML" />
          </details>
        </section>
      )}
    </div>
  );
}

function ResultPanel({ result, current, token, draftsUrl, onStartNew, abandonAction }: {
  result: CreateDraftState;
  current: CreateDraftState;
  token: string;
  draftsUrl: string;
  onStartNew: () => void;
  abandonAction: (fd: FormData) => void;
}) {
  if (!result) return null;
  if (result.status === "missing_env") return <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="draft-result" data-status="missing_env">{result.message}</p>;
  if (result.status === "invalid" || (result.status === "failed" && !current)) {
    return <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="draft-result" data-status={result.status}>{result.message} Your selection is kept — fix the problem and try again.</p>;
  }
  if (!current) return null;
  if (current.status === "created") {
    const rec = current.record;
    return (
      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status" data-testid="draft-result" data-status="created" data-post-id={rec.postId ?? ""}>
        <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" aria-hidden /> {current.message}</p>
        <p className="mt-1">“{rec.title}” — {rec.eventCount} event{rec.eventCount === 1 ? "" : "s"}. Status in beehiiv: <strong>draft</strong>{rec.postState === "creating" ? " (beehiiv is still finishing it)" : ""}.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={current.editUrl} target="_blank" rel="noopener noreferrer" className="btn-primary btn-sm" data-testid="open-draft"><ExternalLink className="h-4 w-4" /> Open draft in beehiiv</a>
          {rec.previewUrl && <a href={rec.previewUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">beehiiv preview</a>}
          <a href={draftsUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">All posts in beehiiv</a>
          <button type="button" className="btn-ghost btn-sm" onClick={onStartNew} data-testid="start-new">Start another draft</button>
        </div>
        <p className="mt-2 text-xs text-emerald-800">If “Open draft” doesn’t land on the editor, use “All posts in beehiiv” — beehiiv doesn’t document its editor address.</p>
      </div>
    );
  }
  if (current.status === "unknown") {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert" data-testid="draft-result" data-status="unknown">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden /> We don’t know whether the draft was created</p>
        <p className="mt-1">{current.message}</p>
        <div className="mt-3 flex flex-wrap items-start gap-2">
          <a href={draftsUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> Open beehiiv Drafts</a>
          <CheckBeehiivButton token={token} draftsUrl={draftsUrl} />
        </div>
        <form action={abandonAction} className="mt-3">
          <input type="hidden" name="token" value={token} />
          <SubmitButton className="btn-ghost btn-sm" pendingText="…" data-testid="abandon">I checked beehiiv — the draft isn’t there. Let me try again.</SubmitButton>
        </form>
      </div>
    );
  }
  return <p role="status" className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="draft-result" data-status={current.status}>{current.message}</p>;
}

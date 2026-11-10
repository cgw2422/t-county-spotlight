"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, ExternalLink, Monitor, RotateCcw, Smartphone, Undo2 } from "lucide-react";
import { ActionForm, DirtyIndicator, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Card } from "@/components/admin/page-header";
import { MediaField } from "@/components/admin/media-picker";
import { SearchSelect } from "@/components/admin/search-select";
import type { LookupItem } from "@/app/admin/_actions/common";
import { HERO_IMAGE_HELP } from "@/components/home/hero-background";
import { SeasonIcon } from "@/components/home/season-icon";
import {
  ACCENT_PRESETS, accentMinContrast, DEFAULT_EYEBROW, formatMonthDay, heroReadability, heroTextContrast, isHex, monthName, SAFE_HERO_OVERLAY,
  SEASON_EVENT_ATTRIBUTES, SEASON_LABEL, SEASON_OVERLAY_DEFAULT, SEASON_OVERLAY_MAX, SEASON_TOKENS, SEASONS, seasonForDate, validateAccent, validateSeasonStarts,
  type MonthDay, type Season, type SeasonalConfig, type SeasonHero, type SeasonSettings,
} from "@/lib/seasons";
import { cn } from "@/lib/utils";
import { discardSeasonalDraftAction, restoreDefaultBrandThemeAction, saveSeasonalAction } from "./actions";
import { FocusPicker } from "../focus-picker";

export type PickLabels = Record<Season, { collections: LookupItem[]; articles: LookupItem[]; events: LookupItem[] }>;
type Status = { live: string; publishedAt: string | null; draftAt: string | null; draftSummary: string; hasUnpublishedChanges: boolean };
type PreviewTarget = Season | "auto";

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function SeasonsEditor({ initial, canEdit, status, previewUrls, pickLabels, initialSeason }: {
  initial: SeasonalConfig; canEdit: boolean; status: Status; previewUrls: Record<PreviewTarget, string>; pickLabels: PickLabels; initialSeason: Season;
}) {
  const [cfg, setCfg] = useState<SeasonalConfig>(initial);
  const [tab, setTab] = useState<Season>(initialSeason);
  const [labels, setLabels] = useState<PickLabels>(pickLabels);
  const [preview, setPreview] = useState<PreviewTarget>(initialSeason);
  const edited = useMemo(() => JSON.stringify(cfg) !== JSON.stringify(initial), [cfg, initial]);
  const startsError = validateSeasonStarts(cfg.starts);
  const accentErrors = SEASONS.map((s) => validateAccent(cfg.seasons[s].accent, s)).filter(Boolean);

  const patch = (p: Partial<SeasonalConfig>) => setCfg((c) => ({ ...c, ...p }));
  const patchSeason = (s: Season, p: Partial<SeasonSettings>) => setCfg((c) => ({ ...c, seasons: { ...c.seasons, [s]: { ...c.seasons[s], ...p } } }));
  const patchHero = (s: Season, p: Partial<SeasonHero>) => setCfg((c) => ({ ...c, seasons: { ...c.seasons, [s]: { ...c.seasons[s], hero: { ...c.seasons[s].hero, ...p } } } }));
  const patchPicks = (s: Season, p: Partial<SeasonSettings["picks"]>) => setCfg((c) => ({ ...c, seasons: { ...c.seasons, [s]: { ...c.seasons[s], picks: { ...c.seasons[s].picks, ...p } } } }));
  const setStart = (s: Season, md: Partial<MonthDay>) => setCfg((c) => {
    const next = { ...c.starts[s], ...md };
    next.day = Math.min(next.day, DAYS_IN_MONTH[next.month - 1]);
    return { ...c, starts: { ...c.starts, [s]: next } };
  });

  const previewPanel = <PreviewPanel urls={previewUrls} target={preview} onTarget={setPreview} edited={edited} />;

  if (!canEdit) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-4">
          <StatusLine status={status} edited={false} />
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Only administrators can change seasonal themes. You can preview the draft for any season.</p>
        </div>
        <div className="min-w-0">{previewPanel}</div>
      </div>
    );
  }

  const s = tab;
  const ss = cfg.seasons[s];
  const hero = ss.hero;
  const mobileSrc = hero.mobileImageUrl || hero.imageUrl;
  const readability = heroReadability(hero.overlay);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="min-w-0 space-y-6">
        <StatusLine status={status} edited={edited} />

        <ActionForm action={saveSeasonalAction} warnUnsaved className="space-y-6">
          <input type="hidden" name="config" value={JSON.stringify(cfg)} />

          <Card title="Seasonal themes" description="When off, the site looks exactly as it does today.">
            <div className="space-y-4">
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-900">
                <input type="checkbox" name="_enabled" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="h-5 w-5 accent-brand-600" data-testid="seasonal-enabled" />
                Enable seasonal themes
              </label>
              <fieldset className="space-y-2" disabled={!cfg.enabled}>
                <legend className="label">Which season shows</legend>
                <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
                  <input type="radio" name="_mode" value="auto" checked={cfg.mode === "auto"} onChange={() => patch({ mode: "auto" })} className="mt-0.5 h-5 w-5 accent-brand-600" />
                  <span><span className="font-semibold text-slate-900">Automatic by date</span><span className="block text-slate-500">Switches on the start dates below (Eastern time). Today: {SEASON_LABEL[seasonForDate(new Date(), startsError ? undefined : cfg.starts)]}.</span></span>
                </label>
                <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
                  <input type="radio" name="_mode" value="manual" checked={cfg.mode === "manual"} onChange={() => patch({ mode: "manual" })} className="mt-0.5 h-5 w-5 accent-brand-600" data-testid="seasonal-mode-manual" />
                  <span><span className="font-semibold text-slate-900">Manual</span><span className="block text-slate-500">Always show the season you choose until you change it.</span></span>
                </label>
                {cfg.mode === "manual" && (
                  <div className="pl-8">
                    <label className="label" htmlFor="manual-season">Active season</label>
                    <select id="manual-season" className="input max-w-xs" value={cfg.manualSeason} onChange={(e) => patch({ manualSeason: e.target.value as Season })} data-testid="seasonal-manual-season">
                      {SEASONS.map((x) => <option key={x} value={x}>{SEASON_LABEL[x]}</option>)}
                    </select>
                  </div>
                )}
              </fieldset>
              <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" name="_accents" checked={cfg.showAccents} onChange={(e) => patch({ showAccents: e.target.checked })} className="h-5 w-5 accent-brand-600" />
                Show tiny decorative icons (blossom, sun, leaf, snowflake) next to seasonal headings
              </label>
            </div>
          </Card>

          <Card title="Season start dates" description="Each season runs from its start date until the next season starts (America/New_York).">
            <div className="grid gap-3 sm:grid-cols-2">
              {SEASONS.map((x) => (
                <fieldset key={x} className="rounded-lg border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-semibold text-slate-900">{SEASON_LABEL[x]} starts</legend>
                  <div className="flex gap-2">
                    <select aria-label={`${SEASON_LABEL[x]} start month`} className="input" value={cfg.starts[x].month} onChange={(e) => setStart(x, { month: Number(e.target.value) })} data-testid={`start-${x}-month`}>
                      {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
                    </select>
                    <select aria-label={`${SEASON_LABEL[x]} start day`} className="input w-24" value={cfg.starts[x].day} onChange={(e) => setStart(x, { day: Number(e.target.value) })} data-testid={`start-${x}-day`}>
                      {Array.from({ length: DAYS_IN_MONTH[cfg.starts[x].month - 1] }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </div>
                </fieldset>
              ))}
            </div>
            {startsError && <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-red-700" role="alert"><AlertTriangle className="h-4 w-4" aria-hidden /> {startsError}</p>}
            <button type="button" className="mt-2 min-h-9 text-sm font-medium text-brand-700 hover:underline" onClick={() => patch({ starts: { spring: { month: 3, day: 1 }, summer: { month: 6, day: 1 }, fall: { month: 9, day: 1 }, winter: { month: 12, day: 1 } } })}>Reset to Mar 1 · Jun 1 · Sep 1 · Dec 1</button>
          </Card>

          <div className="card overflow-hidden">
            <div role="tablist" aria-label="Season" className="flex overflow-x-auto border-b border-slate-100">
              {SEASONS.map((x) => (
                <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => { setTab(x); setPreview(x); }}
                  className={cn("flex min-h-11 flex-1 items-center justify-center gap-1.5 px-3 text-sm font-semibold", tab === x ? "border-b-2 border-navy-900 text-navy-900" : "text-slate-500 hover:text-slate-800")} data-testid={`tab-${x}`}>
                  <span style={{ color: SEASON_TOKENS[x].decor }}><SeasonIcon season={x} themed={false} /></span>{SEASON_LABEL[x]}
                </button>
              ))}
            </div>
            <div className="space-y-6 p-4 sm:p-5" key={s}>
              <p className="text-sm text-slate-600">{SEASON_LABEL[s]} starts {formatMonthDay(cfg.starts[s])}. Without a {SEASON_LABEL[s].toLowerCase()} photo the homepage keeps the default hero photo (or gradient).</p>

              <div>
                <label className="label" htmlFor={`eyebrow-${s}`}>Heading line above the headline</label>
                <input id={`eyebrow-${s}`} className="input" maxLength={60} value={ss.eyebrow} onChange={(e) => patchSeason(s, { eyebrow: e.target.value })} placeholder={DEFAULT_EYEBROW[s]} data-testid="eyebrow-input" />
                <p className="help">Short, e.g. “{DEFAULT_EYEBROW[s]}”. Also used on the “Around T County This Season” section.</p>
              </div>

              <AccentPicker season={s} value={ss.accent} onChange={(hex) => patchSeason(s, { accent: hex })} />

              <section className="space-y-5" aria-label={`${SEASON_LABEL[s]} hero photo`}>
                <h3 className="font-display text-base font-bold text-navy-900">Hero photo</h3>
                <MediaField name={`_img-${s}`} label="Desktop photo" defaultValue={hero.imageUrl} aspect="aspect-[2/1]" help={HERO_IMAGE_HELP.desktop} onChange={(url) => patchHero(s, { imageUrl: url || null, ...(url ? {} : { mobileImageUrl: null }) })} />
                {hero.imageUrl ? (
                  <>
                    <div>
                      <label className="label" htmlFor={`alt-${s}`}>Alt text <span className="font-normal text-slate-500">(optional)</span></label>
                      <input id={`alt-${s}`} className="input" maxLength={300} value={hero.imageAlt} onChange={(e) => patchHero(s, { imageAlt: e.target.value })} placeholder="Leave blank — the photo is decorative" />
                    </div>
                    <MediaField name={`_mimg-${s}`} label="Mobile photo (optional)" defaultValue={hero.mobileImageUrl} aspect="aspect-[4/5] max-w-56" help={HERO_IMAGE_HELP.mobile} onChange={(url) => patchHero(s, { mobileImageUrl: url || null })} />
                    <FocusPicker id={`focus-d-${s}`} label="Desktop focal point" help="Used on screens 1024px and wider." imageUrl={hero.imageUrl} x={hero.desktopFocusX} y={hero.desktopFocusY} onChange={(x, y) => patchHero(s, { desktopFocusX: x, desktopFocusY: y })} />
                    {mobileSrc && <FocusPicker id={`focus-m-${s}`} label="Mobile focal point" help="Phones and tablets." imageUrl={mobileSrc} x={hero.mobileFocusX} y={hero.mobileFocusY} onChange={(x, y) => patchHero(s, { mobileFocusX: x, mobileFocusY: y })} />}
                    <div>
                      <label className="block text-sm text-slate-700" htmlFor={`overlay-${s}`}>
                        <span className="flex justify-between font-medium"><span>Dark overlay for readability</span><span className="tabular-nums text-slate-500">{hero.overlay}%</span></span>
                      </label>
                      <input id={`overlay-${s}`} type="range" min={0} max={SEASON_OVERLAY_MAX} value={hero.overlay} onChange={(e) => patchHero(s, { overlay: Number(e.target.value) })} className="mt-2 w-full accent-brand-600" data-testid="overlay-input" />
                      <div className="mt-1 flex justify-between text-xs text-slate-500"><span>0%</span><span>{SEASON_OVERLAY_MAX}%</span></div>
                      <p className={cn("mt-2 flex items-start gap-1.5 text-sm", readability === "good" ? "text-emerald-700" : "text-amber-800")} data-testid="overlay-readability">
                        {readability === "good" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                        {readability === "good"
                          ? `Headline and text stay readable on any photo (at least ${heroTextContrast(hero.overlay).toFixed(1)}:1).`
                          : `Below ${SAFE_HERO_OVERLAY}%, very bright photos can make the hero text hard to read — check the preview.`}
                      </p>
                      {hero.overlay !== SEASON_OVERLAY_DEFAULT && <button type="button" onClick={() => patchHero(s, { overlay: SEASON_OVERLAY_DEFAULT })} className="mt-1 min-h-9 text-sm font-medium text-brand-700 hover:underline">Reset to {SEASON_OVERLAY_DEFAULT}%</button>}
                    </div>
                  </>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600" data-testid="season-fallback-note">No {SEASON_LABEL[s].toLowerCase()} photo — the homepage uses the default hero appearance.</p>
                )}
              </section>

              <section className="space-y-4" aria-label={`${SEASON_LABEL[s]} picks`}>
                <div>
                  <h3 className="font-display text-base font-bold text-navy-900">“Around T County This Season” picks</h3>
                  <p className="help">Pinned items show first (only while published / upcoming). The section also fills in upcoming {SEASON_EVENT_ATTRIBUTES[s].join(" & ")} events and matching collections and Things to Do articles. Turn the section on in Admin → Homepage.</p>
                </div>
                <SearchSelect name={`_col-${s}`} type="collection" ordered publishedOnly label="Pinned Explore collections" initial={labels[s].collections}
                  onChange={(items) => { setLabels((l) => ({ ...l, [s]: { ...l[s], collections: items } })); patchPicks(s, { collectionIds: items.map((i) => i.id) }); }} />
                <SearchSelect name={`_art-${s}`} type="article" ordered publishedOnly label="Pinned articles" initial={labels[s].articles}
                  onChange={(items) => { setLabels((l) => ({ ...l, [s]: { ...l[s], articles: items } })); patchPicks(s, { articleIds: items.map((i) => i.id) }); }} />
                <SearchSelect name={`_evt-${s}`} type="event" ordered publishedOnly label="Pinned events" initial={labels[s].events}
                  onChange={(items) => { setLabels((l) => ({ ...l, [s]: { ...l[s], events: items } })); patchPicks(s, { eventIds: items.map((i) => i.id) }); }} />
              </section>
            </div>
          </div>

          <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <Submit name="intent" value="draft" className="btn-secondary" pendingText="Saving…">Save draft &amp; preview</Submit>
            <Submit name="intent" value="publish" className="btn-primary" pendingText="Publishing…">Publish</Submit>
            <DirtyIndicator />
            {(startsError || accentErrors.length > 0) && <span className="text-sm font-medium text-red-700">Fix the highlighted settings before saving.</span>}
          </div>
        </ActionForm>

        <Card title="Other actions">
          <div className="flex flex-wrap gap-2">
            <ActionButton action={discardSeasonalDraftAction} className="btn-secondary"
              confirm={{ title: "Discard the draft?", body: "Unpublished seasonal changes are thrown away and the editor goes back to what's live.", confirmLabel: "Discard draft" }}>
              <Undo2 className="h-4 w-4" /> Discard draft
            </ActionButton>
            <ActionButton action={restoreDefaultBrandThemeAction} className="btn border border-red-200 bg-white text-red-700 hover:bg-red-50"
              confirm={{ title: "Restore the default brand theme?", body: "Seasonal themes are switched off on the live site right away and accents, headings and dates go back to their defaults. Seasonal photos and pinned picks stay saved here (unused while off).", confirmLabel: "Restore default", danger: true }}>
              <RotateCcw className="h-4 w-4" /> Restore default brand theme
            </ActionButton>
          </div>
        </Card>
      </div>

      <div className="min-w-0 xl:sticky xl:top-20 xl:self-start">{previewPanel}</div>
    </div>
  );
}

function AccentPicker({ season, value, onChange }: { season: Season; value: string; onChange: (hex: string) => void }) {
  const isPreset = ACCENT_PRESETS.some((p) => p.hex.toUpperCase() === value.toUpperCase());
  const [custom, setCustom] = useState(isPreset ? "" : value);
  const presets = ACCENT_PRESETS.filter((p) => !validateAccent(p.hex, season));
  const customErr = custom ? validateAccent(custom.startsWith("#") ? custom : `#${custom}`, season) : null;
  const err = validateAccent(value, season);
  return (
    <fieldset>
      <legend className="label">Accent color</legend>
      <p className="help -mt-1 mb-2">Used for seasonal headings, links and small highlights. Only colors that stay readable (at least 4.5:1) can be used.</p>
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => {
          const on = p.hex.toUpperCase() === value.toUpperCase();
          return (
            <button key={p.id} type="button" onClick={() => { onChange(p.hex); setCustom(""); }} aria-pressed={on}
              className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-2.5 text-sm", on ? "border-navy-900 ring-2 ring-navy-900/20" : "border-slate-200 hover:border-slate-400")}>
              <span aria-hidden className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: p.hex }} />
              {p.label}{p.hex.toUpperCase() === SEASON_TOKENS[season].accent.toUpperCase() && <span className="text-xs text-slate-500">(default)</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor={`custom-${season}`}>Custom hex (optional)</label>
          <input id={`custom-${season}`} className="input w-36 font-mono" placeholder="#387D14" maxLength={7} value={custom} data-testid="accent-custom"
            onChange={(e) => {
              const v = e.target.value.trim();
              setCustom(v);
              const hex = v.startsWith("#") ? v : `#${v}`;
              if (isHex(hex) && !validateAccent(hex, season)) onChange(hex.toUpperCase());
            }} />
        </div>
        <span className="mb-1 flex items-center gap-2 text-sm text-slate-600">
          <span aria-hidden className="h-6 w-6 rounded ring-1 ring-black/10" style={{ background: value }} />
          <span className="font-mono">{value.toUpperCase()}</span> · {accentMinContrast(value, season).toFixed(2)}:1
        </span>
      </div>
      {customErr && <p className="mt-2 flex items-start gap-1.5 text-sm font-medium text-red-700" role="alert" data-testid="accent-error"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {customErr} The current accent stays {value.toUpperCase()}.</p>}
      {err && <p className="mt-2 text-sm font-medium text-red-700" role="alert">{err}</p>}
      <p className="mt-3 rounded-lg p-3 text-sm" style={{ background: SEASON_TOKENS[season].tint }}>
        <span className="font-display text-xs font-bold uppercase tracking-wider" style={{ color: value }}>Sample heading</span>
        <span className="ml-3 inline-flex min-h-9 items-center rounded-lg px-3 font-semibold text-white" style={{ background: value }}>Sample button</span>
      </p>
    </fieldset>
  );
}

function PreviewPanel({ urls, target, onTarget, edited }: { urls: Record<PreviewTarget, string>; target: PreviewTarget; onTarget: (t: PreviewTarget) => void; edited: boolean }) {
  const [nonce] = useState(() => Date.now());
  const src = `${urls[target]}&v=${nonce}`;
  return (
    <Card title="Preview" description="The real homepage with the saved draft. Visitors don't see this until you publish."
      actions={<a href={urls[target]} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> Open in new tab</a>}>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Preview season">
        {([...SEASONS, "auto"] as PreviewTarget[]).map((t) => (
          <button key={t} type="button" onClick={() => onTarget(t)} aria-pressed={target === t}
            className={cn("min-h-9 rounded-full px-3 text-sm font-semibold ring-1", target === t ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")} data-testid={`preview-${t}`}>
            {t === "auto" ? "Draft as of today" : SEASON_LABEL[t]}
          </button>
        ))}
      </div>
      {edited && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You have unsaved edits — choose “Save draft &amp; preview” to see them here.</p>}
      <div className="space-y-4">
        <Frame label="Desktop · 1280px" icon={Monitor} width={1280} height={900} src={src} />
        <div className="flex flex-wrap items-start gap-4">
          <Frame label="Phone · 390px" icon={Smartphone} width={390} height={844} fixedScale={0.6} src={src} />
          <p className="help max-w-56 flex-1">An orange banner at the top of the preview marks it as unpublished. Footer, logo and navigation stay the same in every season.</p>
        </div>
      </div>
    </Card>
  );
}

function Frame({ label, icon: Icon, width, height, fixedScale, src }: { label: string; icon: typeof Monitor; width: number; height: number; fixedScale?: number; src: string }) {
  const [scale, setScale] = useState(fixedScale ?? 0.45);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || fixedScale) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedScale, width]);
  return (
    <figure className={fixedScale ? "shrink-0" : "w-full"}>
      <figcaption className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden /> {label}</figcaption>
      <div
        ref={wrap}
        className="overflow-hidden rounded-lg bg-slate-200 ring-1 ring-slate-300"
        style={{ height: height * scale, width: fixedScale ? width * scale : undefined }}
      >
        <iframe src={src} title={`Seasonal theme preview, ${label}`} tabIndex={-1} loading="lazy" data-testid={`preview-frame-${width}`}
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0, display: "block" }} />
      </div>
    </figure>
  );
}

function StatusLine({ status, edited }: { status: Status; edited: boolean }) {
  return (
    <div className="card space-y-1.5 p-4 text-sm" role="status" aria-live="polite" data-testid="seasonal-status">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        <span className="font-semibold text-slate-900">Live:</span>
        <span className="text-slate-700">{status.live}{status.publishedAt ? ` · published ${status.publishedAt}` : ""}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CircleDot className={status.hasUnpublishedChanges ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-slate-400"} aria-hidden />
        <span className="font-semibold text-slate-900">Draft:</span>
        <span className="text-slate-700">{status.draftSummary}{status.draftAt ? ` · saved ${status.draftAt}` : ""}</span>
        {status.hasUnpublishedChanges ? <span className="badge-amber">Unpublished changes</span> : <span className="badge-gray">Same as live</span>}
        {edited && <span className="badge-blue">Unsaved edits</span>}
      </p>
    </div>
  );
}

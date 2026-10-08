import Link from "next/link";
import { ChevronUp, ChevronDown, Eye, EyeOff, ExternalLink, Sparkles } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { LookupItem, LookupType } from "../_actions/common";
import { PageHeader, Card } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Checkbox, FormGrid, TextField } from "@/components/admin/form-field";
import { MediaField } from "@/components/admin/media-picker";
import { SearchSelect } from "@/components/admin/search-select";
import { cn } from "@/lib/utils";
import { moveSection, saveHeroBanner, saveSection, toggleSection } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Homepage" };

const PICK: Record<string, { type: LookupType; label: string } | undefined> = {
  weekend: { type: "event", label: "Pinned events" },
  events: { type: "event", label: "Pinned events" },
  businesses: { type: "business", label: "Pinned businesses" },
  spotlights: { type: "article", label: "Pinned articles" },
  things_to_do: { type: "article", label: "Pinned articles" },
  announcements: { type: "article", label: "Pinned articles" },
  specials: { type: "promotion", label: "Pinned specials" },
};
const TYPE_LABEL: Record<string, string> = {
  hero: "Hero banner", explore: "Explore categories grid", weekend: "This weekend's events", events: "Upcoming events", businesses: "Featured businesses",
  spotlights: "Business spotlights", specials: "Local specials", things_to_do: "Things to do", announcements: "Announcements", cta: "Call to action", banner: "Banner",
};

async function resolveFeatured(type: LookupType, ids: string[]): Promise<LookupItem[]> {
  if (!ids.length) return [];
  let rows: { id: string; label: string; sub?: string | null }[] = [];
  if (type === "event") rows = (await db.event.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, status: true } })).map((r) => ({ id: r.id, label: r.title, sub: r.status.toLowerCase() }));
  if (type === "business") rows = (await db.business.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, city: true } })).map((r) => ({ id: r.id, label: r.name, sub: r.city }));
  if (type === "article") rows = (await db.article.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, status: true } })).map((r) => ({ id: r.id, label: r.title, sub: r.status.toLowerCase() }));
  if (type === "promotion") rows = (await db.promotion.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, business: { select: { name: true } } } })).map((r) => ({ id: r.id, label: r.title, sub: r.business.name }));
  return ids.map((id) => rows.find((r) => r.id === id)).filter((x): x is LookupItem => !!x);
}

export default async function HomepageManager() {
  await requireStaff();
  const [sections, settings] = await Promise.all([db.homepageSection.findMany({ orderBy: { sortOrder: "asc" } }), getSettings()]);
  const featured = await Promise.all(sections.map((s) => (PICK[s.type] ? resolveFeatured(PICK[s.type]!.type, s.featuredIds) : Promise.resolve([]))));
  return (
    <>
      <PageHeader
        title="Homepage"
        description="Choose which sections appear, in what order, and pin specific items to the top of a section."
        actions={<><Link href="/admin/placements/" className="btn-secondary"><Sparkles className="h-4 w-4" /> Sponsored placements</Link><a href="/" target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink className="h-4 w-4" /> View homepage</a></>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-3">
          {sections.map((s, i) => {
            const pick = PICK[s.type];
            return (
              <div key={s.id} className={cn("card", !s.isEnabled && "bg-slate-50")}>
                <div className="flex items-start gap-2 p-3 sm:p-4">
                  <div className="flex shrink-0 flex-col">
                    {i > 0 ? <ActionButton action={moveSection} fields={{ id: s.id, dir: "up" }} className="grid h-8 w-9 place-items-center rounded text-slate-500 hover:bg-slate-100"><ChevronUp className="h-4 w-4" /><span className="sr-only">Move {s.title} up</span></ActionButton> : <span className="h-8 w-9" />}
                    {i < sections.length - 1 ? <ActionButton action={moveSection} fields={{ id: s.id, dir: "down" }} className="grid h-8 w-9 place-items-center rounded text-slate-500 hover:bg-slate-100"><ChevronDown className="h-4 w-4" /><span className="sr-only">Move {s.title} down</span></ActionButton> : <span className="h-8 w-9" />}
                  </div>
                  <details className="group min-w-0 flex-1">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-1">
                      <span className="min-w-0 flex-1">
                        <span className={cn("block font-semibold", s.isEnabled ? "text-slate-900" : "text-slate-500")}>{s.title || TYPE_LABEL[s.type]}</span>
                        <span className="block text-xs text-slate-500">{TYPE_LABEL[s.type] ?? s.type}{pick ? ` · shows up to ${s.limit}` : ""}{s.featuredIds.length ? ` · ${s.featuredIds.length} pinned` : ""}</span>
                      </span>
                      <span className={s.isEnabled ? "badge-green" : "badge-gray"}>{s.isEnabled ? "Visible" : "Hidden"}</span>
                      <span className="text-sm font-semibold text-brand-700 group-open:hidden">Edit</span>
                      <span className="hidden text-sm font-semibold text-slate-500 group-open:inline">Close</span>
                    </summary>
                    <ActionForm action={saveSection} className="mt-3 space-y-4 border-t border-slate-100 pt-4">
                      <input type="hidden" name="id" value={s.id} />
                      <FormGrid>
                        <TextField name="title" label="Title" defaultValue={s.title} maxLength={200} />
                        {pick ? <TextField name="limit" type="number" min={1} max={48} label="Items to show" defaultValue={s.limit} /> : <input type="hidden" name="limit" value={s.limit} />}
                      </FormGrid>
                      <TextField name="subtitle" label="Subtitle" defaultValue={s.subtitle ?? ""} maxLength={400} />
                      {s.type === "hero" && <p className="text-xs text-slate-500">Leave the title/subtitle blank to use the hero text below.</p>}
                      {pick && (
                        <SearchSelect name="featured" type={pick.type} ordered label={pick.label} initial={featured[i]} placeholder="Search to pin items…" help="Pinned items show first, in this order; the rest fill automatically. Only published items appear on the site." />
                      )}
                      <Checkbox name="isEnabled" label="Show this section on the homepage" defaultChecked={s.isEnabled} />
                      <Submit className="btn-primary btn-sm" pendingText="Saving…">Save section</Submit>
                    </ActionForm>
                  </details>
                  <ActionButton action={toggleSection} fields={{ id: s.id }} className="btn-ghost btn-sm shrink-0" title={s.isEnabled ? "Hide section" : "Show section"}>
                    {s.isEnabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}<span className="sr-only">{s.isEnabled ? `Hide ${s.title}` : `Show ${s.title}`}</span>
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
        <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <Card title="Hero & announcement banner">
            <ActionForm action={saveHeroBanner} className="space-y-4">
              <TextField name="heroHeadline" label="Hero headline" defaultValue={settings.heroHeadline} required maxLength={200} />
              <TextField name="heroSubheadline" label="Hero subheadline" defaultValue={settings.heroSubheadline} maxLength={400} />
              <MediaField name="heroImageUrl" label="Hero image" defaultValue={settings.heroImageUrl} />
              <div className="rounded-xl border border-slate-200 p-3">
                <Checkbox name="bannerEnabled" label="Show announcement banner" defaultChecked={settings.bannerEnabled} help="A slim bar across the top of every page." />
                <div className="mt-2 space-y-3">
                  <TextField name="bannerText" label="Banner text" defaultValue={settings.bannerText} maxLength={300} placeholder="Canal Days are this weekend!" />
                  <TextField name="bannerLink" label="Banner link" defaultValue={settings.bannerLink} placeholder="/events/ or https://…" />
                </div>
              </div>
              <Submit pendingText="Saving…">Save hero & banner</Submit>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}

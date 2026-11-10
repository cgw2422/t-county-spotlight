import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  EVENT_ATTRIBUTE_FILTERS, attributeWhere, expandOccurrences, isTonight, monthWindow, todayWindow, tomorrowWindow,
  tonightWindow, upcomingEventWhere, weekendWindow, type TimeWindow,
} from "@/lib/events";
import { eventCardSelect } from "@/lib/queries";
import { eventHref } from "@/lib/links";
import { TUSCARAWAS_CITIES, cn, formatDate, formatTime } from "@/lib/utils";
import { EventCard } from "@/components/cards/event-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { TrackView } from "@/components/public/track";
import { Pagination } from "@/components/public/pagination";
import { FilterPanel } from "@/components/public/filter-panel";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import { addDaysKey, endOfNyDay, isDateKey, isMonthKey, monthInfo, nyDateKey, startOfNyDay } from "@/components/public/dates";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
const PER_PAGE = 30;

const WHEN = [
  { key: "", label: "All upcoming" },
  { key: "today", label: "Today" },
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This weekend" },
  { key: "week", label: "Next 7 days" },
  { key: "month", label: "This month" },
] as const;

const WHEN_EMPTY: Record<string, string> = {
  today: "Nothing else listed for today",
  tonight: "Nothing listed for tonight yet",
  tomorrow: "Nothing listed for tomorrow yet",
  weekend: "Nothing listed for this weekend yet",
};

const MARKETS_TITLE = "Markets, Craft Shows & Vendor Events";

function windowFor(when: string, from: string, to: string, now: Date): TimeWindow {
  const today = nyDateKey(now);
  if (isDateKey(from) || isDateKey(to)) {
    const f0 = isDateKey(from) ? startOfNyDay(from) : now;
    const f = f0 < now ? now : f0; // never list ended events as upcoming
    const t = isDateKey(to) ? endOfNyDay(to) : new Date(f.getTime() + 90 * 86400_000);
    return { start: f, end: t < f ? f : t };
  }
  switch (when) {
    case "today": return todayWindow(now);
    case "tonight": return tonightWindow(now);
    case "tomorrow": return tomorrowWindow(now);
    case "weekend": return weekendWindow(now);
    case "week": return { start: now, end: endOfNyDay(addDaysKey(today, 6)) };
    case "month": return monthWindow(now);
    default: return { start: now, end: new Date(now.getTime() + 180 * 86400_000) };
  }
}

/** Attribute filters may arrive as repeated params (form checkboxes) or a comma list (links). */
function attrsParam(sp: Record<string, string | string[] | undefined>) {
  const raw = sp.attr;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  const picked = new Set(list.map((v) => v.trim()));
  return EVENT_ATTRIBUTE_FILTERS.map((f) => f.key as string).filter((k) => picked.has(k));
}

function cityParam(sp: Record<string, string | string[] | undefined>) {
  const v = param(sp, "city").toLowerCase();
  return TUSCARAWAS_CITIES.find((c) => c.toLowerCase() === v) ?? "";
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const catSlug = param(sp, "category");
  const cat = catSlug ? await db.eventCategory.findUnique({ where: { slug: catSlug }, select: { name: true } }) : null;
  const filtered = !!(param(sp, "when") || param(sp, "from") || param(sp, "to") || param(sp, "view") || param(sp, "q") || param(sp, "page") || param(sp, "city") || param(sp, "free") || param(sp, "attr"));
  const markets = catSlug === "markets";
  return buildMetadata({
    title: markets ? `${MARKETS_TITLE} in Tuscarawas County` : cat ? `${cat.name} Events in Tuscarawas County` : "Events in Tuscarawas County",
    description: markets
      ? "Farmers markets, craft shows, flea markets and vendor events across Tuscarawas County, Ohio."
      : `Upcoming ${cat ? cat.name.toLowerCase() + " " : ""}events, festivals, live music and community happenings across Tuscarawas County, Ohio.`,
    path: `/events/${qs({ category: cat ? catSlug : undefined })}`,
    noindex: filtered,
  });
}

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = param(sp, "view") === "calendar" ? "calendar" : "list";
  const when = WHEN.some((w) => w.key === param(sp, "when")) ? param(sp, "when") : "";
  const from = isDateKey(param(sp, "from")) ? param(sp, "from") : "";
  const to = isDateKey(param(sp, "to")) ? param(sp, "to") : "";
  const catSlug = param(sp, "category");
  const q = param(sp, "q").slice(0, 100);
  const city = cityParam(sp);
  const free = param(sp, "free") === "1";
  const attrs = attrsParam(sp);
  const page = pageParam(sp);
  const now = new Date();
  const todayKey = nyDateKey(now);
  const month = isMonthKey(param(sp, "month")) ? param(sp, "month") : todayKey.slice(0, 7);

  const [categories, cityRows] = await Promise.all([
    db.eventCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, _count: { select: { events: { where: upcomingEventWhere(now) } } } },
    }),
    db.event.groupBy({ by: ["city"], where: { AND: [upcomingEventWhere(now), { city: { not: null } }] } }),
  ]);
  const category = categories.find((c) => c.slug === catSlug) ?? null;
  // Communities with upcoming events (plus the selected one, so it stays visible).
  const withEvents = new Set(cityRows.map((r) => r.city?.trim().toLowerCase()).filter(Boolean));
  const cities = TUSCARAWAS_CITIES.filter((c) => withEvents.has(c.toLowerCase()) || c === city).sort();

  const calendarMonth = { start: startOfNyDay(monthInfo(month).first), end: endOfNyDay(monthInfo(month).last) };
  const win = view === "calendar" ? calendarMonth : windowFor(from || to ? "" : when, from, to, now);

  // One query: window + every active filter (each attribute is an OR of tag/category/organization).
  const extra: Prisma.EventWhereInput[] = [{ startAt: { lte: win.end } }];
  if (category) extra.push({ categoryId: category.id });
  if (q) extra.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { locationName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] });
  if (city) extra.push({ city: { equals: city, mode: "insensitive" } });
  if (free) extra.push({ isFree: true });
  for (const a of attrs) { const w = attributeWhere(a); if (w) extra.push(w); }
  // Lists start at "now" (ended events are never upcoming); the calendar shows the whole month, as before.
  const events = await db.event.findMany({
    where: { AND: [upcomingEventWhere(win.start), ...extra] },
    select: eventCardSelect,
    take: 500,
  });
  let occurrences = expandOccurrences(events, win.start, win.end, 120);
  if (view === "list" && !from && !to && when === "tonight") { const tw = tonightWindow(now); occurrences = occurrences.filter((o) => isTonight(o, tw)); }

  const state = {
    category: category?.slug, q: q || undefined, city: city || undefined, free: free ? "1" : undefined,
    attr: attrs.length ? attrs.join(",") : undefined,
  };
  const base = { view: view === "calendar" ? "calendar" : undefined, ...state };
  const dateState = { when: when || undefined, from: from || undefined, to: to || undefined };
  const listHref = (o: Record<string, string | number | undefined>) => `/events/${qs({ ...state, ...dateState, ...o })}`;
  const keepHref = (o: Record<string, string | number | undefined>) =>
    view === "calendar" ? `/events/${qs({ ...base, month, ...o })}` : listHref({ ...o, page: undefined });
  const toggleAttr = (k: string) => {
    const next = attrs.includes(k) ? attrs.filter((x) => x !== k) : [...attrs, k];
    return next.length ? next.join(",") : undefined;
  };

  const pills: { label: string; href: string }[] = [];
  if (view === "list" && (from || to)) pills.push({ label: [from && `From ${formatDate(startOfNyDay(from), { month: "short", day: "numeric" })}`, to && `to ${formatDate(startOfNyDay(to), { month: "short", day: "numeric" })}`].filter(Boolean).join(" "), href: listHref({ from: undefined, to: undefined }) });
  if (category) pills.push({ label: category.name, href: keepHref({ category: undefined }) });
  if (city) pills.push({ label: city, href: keepHref({ city: undefined }) });
  if (free) pills.push({ label: "Free", href: keepHref({ free: undefined }) });
  for (const a of attrs) pills.push({ label: EVENT_ATTRIBUTE_FILTERS.find((f) => f.key === a)!.label, href: keepHref({ attr: toggleAttr(a) }) });
  if (q) pills.push({ label: `“${q}”`, href: keepHref({ q: undefined }) });
  const filterCount = pills.length;
  const activeCount = filterCount + (view === "list" && when && !from && !to ? 1 : 0);
  const clearHref = view === "calendar" ? `/events/?view=calendar&month=${month}` : `/events/${qs({ when: when || undefined })}`;
  const totalAny = await db.event.count({ where: upcomingEventWhere(now) });

  const markets = category?.slug === "markets" || (attrs.length === 1 && attrs[0] === "markets" && !category);
  const title = markets ? MARKETS_TITLE : category ? `${category.name} events` : "Events";
  const whenLabel = view === "list" && !from && !to && when ? WHEN.find((w) => w.key === when)?.label : null;

  const filters = (
    <form action="/events/" className="space-y-5">
      {view === "calendar" ? <><input type="hidden" name="view" value="calendar" /><input type="hidden" name="month" value={month} /></> : when && !from && !to ? <input type="hidden" name="when" value={when} /> : null}
      <div>
        <label htmlFor="ev-q" className="label">Keyword</label>
        <input id="ev-q" name="q" type="search" defaultValue={q} placeholder="Festival, market, concert…" className="input" />
      </div>
      <div>
        <label htmlFor="ev-city" className="label">Community</label>
        <select id="ev-city" name="city" defaultValue={city} className="input">
          <option value="">All of Tuscarawas County</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="ev-cat" className="label">Category</label>
        <select id="ev-cat" name="category" defaultValue={category?.slug ?? ""} className="input">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-800">
        <input type="checkbox" name="free" value="1" defaultChecked={free} className="h-5 w-5 rounded border-slate-300 accent-brand-600" /> Free events only
      </label>
      <fieldset>
        <legend className="label">Good for</legend>
        <div className="grid grid-cols-2 gap-x-3 lg:grid-cols-1">
          {EVENT_ATTRIBUTE_FILTERS.map((f) => (
            <label key={f.key} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700">
              <input type="checkbox" name="attr" value={f.key} defaultChecked={attrs.includes(f.key)} className="h-5 w-5 shrink-0 rounded border-slate-300 accent-brand-600" /> {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      {view === "list" && (
        <fieldset>
          <legend className="label">Date range</legend>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="ev-from" className="sr-only">From</label><input id="ev-from" type="date" name="from" defaultValue={from} min={todayKey} className="input" /></div>
            <div><label htmlFor="ev-to" className="sr-only">To</label><input id="ev-to" type="date" name="to" defaultValue={to} min={todayKey} className="input" /></div>
          </div>
          <p className="help">Leave blank to use the quick dates above.</p>
        </fieldset>
      )}
      <button className="btn-primary w-full">Apply filters</button>
      {filterCount > 0 && <Link href={clearHref} className="btn-ghost w-full">Clear filters</Link>}
    </form>
  );

  return (
    <>
      <TrackView type="view_events_list" targetType="EVENTS_VIEW" targetId={view === "calendar" ? "calendar" : from || to ? "range" : when || "all"} />
      <PageHeader
        eyebrow="What’s happening"
        title={title}
        subtitle={markets ? "Farmers markets, craft shows, flea markets and vendor events across Tuscarawas County." : "Festivals, live music, markets, family fun and community gatherings across Tuscarawas County."}
        crumbs={category ? [{ label: "Events", href: "/events/" }, { label: category.name }] : [{ label: "Events" }]}
      >
        <Link href="/events/submit/" className="btn-accent"><Plus className="h-4 w-4" aria-hidden /> Submit an event</Link>
      </PageHeader>

      <div className="container-page py-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {view === "list" ? (
            <nav aria-label="When" className="-mx-4 min-w-0 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
              <ul className="flex gap-2 pb-1">
                {WHEN.map((w) => {
                  const active = !from && !to && when === w.key;
                  return (
                    <li key={w.key}>
                      <Link href={listHref({ when: w.key || undefined, from: undefined, to: undefined, page: undefined })} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>{w.label}</Link>
                    </li>
                  );
                })}
                {/* One-tap toggles for the most common resident filters (also in the filter panel). */}
                {[
                  { label: "Family-friendly", on: attrs.includes("family"), href: listHref({ attr: toggleAttr("family"), page: undefined }) },
                  { label: "Free", on: free, href: listHref({ free: free ? undefined : "1", page: undefined }) },
                ].map((t, i) => (
                  <li key={t.label} className={i === 0 ? "ml-1 border-l border-slate-200 pl-3" : undefined}>
                    <Link href={t.href} className={cn("relative inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", t.on ? "bg-hillside-600 text-white ring-hillside-600" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
                      {t.label}{t.on && <><X className="h-3.5 w-3.5" aria-hidden /><span className="sr-only"> (on, tap to remove)</span></>}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : <div />}
          <div role="group" aria-label="View" className="inline-flex shrink-0 self-start rounded-lg bg-slate-100 p-1">
            <Link href={`/events/${qs(state)}`} aria-current={view === "list" ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", view === "list" ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900")}><LayoutList className="h-4 w-4" aria-hidden /> List</Link>
            <Link href={`/events/${qs({ ...state, view: "calendar", month })}`} aria-current={view === "calendar" ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", view === "calendar" ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900")}><CalendarDays className="h-4 w-4" aria-hidden /> Calendar</Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
          <aside aria-label="Event filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={filterCount}>{filters}</FilterPanel>
          </aside>
          <div className="min-w-0">
            {pills.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Active filters">
                <span className="text-sm text-slate-600">{filterCount} {filterCount === 1 ? "filter" : "filters"}:</span>
                {pills.map((p) => (
                  <Link key={p.label} href={p.href} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-brand-50 px-3 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100">
                    {p.label} <X className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">Remove filter</span>
                  </Link>
                ))}
                <Link href={clearHref} className="inline-flex min-h-9 items-center px-2 text-sm font-semibold text-slate-600 underline-offset-2 hover:text-navy-900 hover:underline">Clear filters</Link>
              </div>
            )}
            {view === "calendar" ? (
              <Calendar month={month} todayKey={todayKey} occurrences={occurrences} base={base} />
            ) : (
              <ListView
                occurrences={occurrences} page={page} hrefFor={(p) => listHref({ page: p > 1 ? p : undefined })} totalAny={totalAny}
                filtered={activeCount > 0} whenLabel={whenLabel ?? null} emptyTitle={!from && !to && !filterCount ? WHEN_EMPTY[when] : undefined}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

type Occ = ReturnType<typeof expandOccurrences<Prisma.EventGetPayload<{ select: typeof eventCardSelect }>>>[number];

function ListView({ occurrences, page, hrefFor, totalAny, filtered, whenLabel, emptyTitle }: { occurrences: Occ[]; page: number; hrefFor: (p: number) => string; totalAny: number; filtered: boolean; whenLabel: string | null; emptyTitle?: string }) {
  if (!occurrences.length) {
    return totalAny === 0 ? (
      <EmptyState icon={CalendarDays} title="No upcoming events listed yet">
        Hosting something in Tuscarawas County? <Link href="/events/submit/" className="font-semibold text-brand-700">Submit your event</Link> — it&rsquo;s free.
      </EmptyState>
    ) : (
      <EmptyState icon={CalendarDays} title={emptyTitle ?? "No events match those filters"}>
        {filtered ? <>Try a different date or filter, or <Link href="/events/" className="font-semibold text-brand-700">see all upcoming events</Link>. Know of something? <Link href="/events/submit/" className="font-semibold text-brand-700">Submit an event</Link>.</> : null}
      </EmptyState>
    );
  }
  const totalPages = Math.max(1, Math.ceil(occurrences.length / PER_PAGE));
  const slice = occurrences.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const groups = new Map<string, Occ[]>();
  for (const o of slice) {
    const k = nyDateKey(o.occurrenceStart);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  return (
    <>
      <p className="mb-4 text-sm text-slate-600" aria-live="polite"><span className="font-semibold text-slate-900">{occurrences.length}</span> {occurrences.length === 1 ? "event" : "events"}{whenLabel && whenLabel !== "All upcoming" ? <> · {whenLabel.toLowerCase()}</> : null}</p>
      <div className="space-y-8">
        {[...groups.entries()].map(([k, list]) => (
          <section key={k} aria-labelledby={`d-${k}`}>
            <h2 id={`d-${k}`} className="sticky top-16 z-10 -mx-1 mb-3 bg-white/95 px-1 py-2 font-display text-lg font-semibold text-navy-900 backdrop-blur lg:top-[72px]">
              {formatDate(list[0].occurrenceStart, { weekday: "long", month: "long", day: "numeric" })}
            </h2>
            <div className="grid grid-cols-1 gap-3">{list.map((e) => <EventCard key={`${e.id}-${k}`} e={e} layout="row" />)}</div>
          </section>
        ))}
      </div>
      <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} />
    </>
  );
}

function Calendar({ month, todayKey, occurrences, base }: { month: string; todayKey: string; occurrences: Occ[]; base: Record<string, string | undefined> }) {
  const m = monthInfo(month);
  const byDay = new Map<string, Occ[]>();
  for (const o of occurrences) {
    const k = nyDateKey(o.occurrenceStart);
    byDay.set(k, [...(byDay.get(k) ?? []), o]);
  }
  const cells: (string | null)[] = [...Array(m.firstWeekday).fill(null), ...Array.from({ length: m.days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const nav = (mm: string) => `/events/${qs({ ...base, view: "calendar", month: mm })}`;
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={nav(m.prev)} className="btn-ghost px-3" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></Link>
        <h2 className="font-display text-xl font-semibold text-navy-900 sm:text-2xl" aria-live="polite">{m.label}</h2>
        <div className="flex items-center gap-1">
          {month !== todayKey.slice(0, 7) && <Link href={nav(todayKey.slice(0, 7))} className="btn-ghost btn-sm hidden sm:inline-flex">Today</Link>}
          <Link href={nav(m.next)} className="btn-ghost px-3" aria-label="Next month"><ChevronRight className="h-5 w-5" /></Link>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold uppercase tracking-wide text-slate-500" aria-hidden>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2"><span className="sm:hidden">{d.charAt(0)}</span><span className="hidden sm:inline">{d}</span></div>)}
        </div>
        <ol className="grid grid-cols-7">
          {cells.map((k, i) => {
            if (!k) return <li key={`e${i}`} aria-hidden className="min-h-14 border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-28 [&:nth-child(7n)]:border-r-0" />;
            const list = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            const past = k < todayKey;
            return (
              <li key={k} className={cn("min-h-14 border-b border-r border-slate-100 p-1 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0", past && "bg-slate-50/60")}>
                <div className="flex items-center justify-between">
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm", isToday ? "bg-brand-600 font-bold text-white" : past ? "text-slate-400" : "font-medium text-slate-700")}>
                    <span className="sr-only">{formatDate(startOfNyDay(k), { weekday: "long", month: "long", day: "numeric" })}</span>
                    <span aria-hidden>{Number(k.slice(8))}</span>
                  </span>
                </div>
                {list.length > 0 && (
                  <>
                    <a href={`#day-${k}`} className="mt-1 flex justify-center sm:hidden" aria-label={`${list.length} ${list.length === 1 ? "event" : "events"}`}>
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">{list.length}</span>
                    </a>
                    <ul className="mt-1 hidden space-y-1 sm:block">
                      {list.slice(0, 3).map((o) => (
                        <li key={o.id}>
                          <Link href={eventHref(o)} className={cn("block truncate rounded px-1.5 py-0.5 text-xs font-medium", o.isSponsored ? "bg-amber-100 text-amber-900" : "bg-brand-50 text-brand-700 hover:bg-brand-100")} title={o.title}>
                            {!o.allDay && <span className="font-normal opacity-75">{formatTime(o.occurrenceStart).replace(":00", "").replace(" ", "").toLowerCase()} </span>}{o.title}
                          </Link>
                        </li>
                      ))}
                      {list.length > 3 && <li><a href={`#day-${k}`} className="block px-1.5 text-xs font-semibold text-slate-500 hover:text-navy-900">+{list.length - 3} more</a></li>}
                    </ul>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <section aria-labelledby="agenda-title" className="mt-10">
        <h2 id="agenda-title" className="section-title">{m.label.split(" ")[0]} at a glance</h2>
        {days.length === 0 ? (
          <div className="mt-4"><EmptyState icon={CalendarDays} title={`No events listed in ${m.label}`}>Know of something happening? <Link href="/events/submit/" className="font-semibold text-brand-700">Submit an event</Link>.</EmptyState></div>
        ) : (
          <div className="mt-4 space-y-6">
            {days.map(([k, list]) => (
              <section key={k} id={`day-${k}`} aria-labelledby={`ag-${k}`} className="scroll-mt-24">
                <h3 id={`ag-${k}`} className="mb-2 font-semibold text-navy-900">{formatDate(startOfNyDay(k), { weekday: "long", month: "long", day: "numeric" })}</h3>
                <div className="grid grid-cols-1 gap-3">{list.map((e) => <EventCard key={`${e.id}-${k}`} e={e} layout="row" />)}</div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

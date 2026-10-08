import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, LayoutList, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { expandOccurrences, upcomingEventWhere, weekendWindow } from "@/lib/events";
import { eventCardSelect } from "@/lib/queries";
import { eventHref } from "@/lib/links";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { EventCard } from "@/components/cards/event-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
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
  { key: "weekend", label: "This weekend" },
  { key: "week", label: "Next 7 days" },
  { key: "month", label: "This month" },
] as const;

function windowFor(when: string, from: string, to: string, now: Date) {
  const today = nyDateKey(now);
  if (isDateKey(from) || isDateKey(to)) {
    const f = isDateKey(from) ? startOfNyDay(from) : now;
    const t = isDateKey(to) ? endOfNyDay(to) : new Date(f.getTime() + 90 * 86400_000);
    return { from: f, to: t < f ? f : t };
  }
  switch (when) {
    case "today": return { from: now, to: endOfNyDay(today) };
    case "weekend": { const w = weekendWindow(now); return { from: w.start, to: w.end }; }
    case "week": return { from: now, to: endOfNyDay(addDaysKey(today, 6)) };
    case "month": return { from: now, to: endOfNyDay(monthInfo(today.slice(0, 7)).last) };
    default: return { from: now, to: new Date(now.getTime() + 180 * 86400_000) };
  }
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const catSlug = param(sp, "category");
  const cat = catSlug ? await db.eventCategory.findUnique({ where: { slug: catSlug }, select: { name: true } }) : null;
  const filtered = !!(param(sp, "when") || param(sp, "from") || param(sp, "to") || param(sp, "view") || param(sp, "q") || param(sp, "page"));
  return buildMetadata({
    title: cat ? `${cat.name} Events in Tuscarawas County` : "Events in Tuscarawas County",
    description: `Upcoming ${cat ? cat.name.toLowerCase() + " " : ""}events, festivals, live music and community happenings across Tuscarawas County, Ohio.`,
    path: `/events/${qs({ category: cat ? catSlug : undefined })}`,
    noindex: filtered,
  });
}

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = param(sp, "view") === "calendar" ? "calendar" : "list";
  const when = WHEN.some((w) => w.key === param(sp, "when")) ? param(sp, "when") : "";
  const from = param(sp, "from"), to = param(sp, "to");
  const catSlug = param(sp, "category");
  const q = param(sp, "q").slice(0, 100);
  const page = pageParam(sp);
  const now = new Date();
  const todayKey = nyDateKey(now);
  const month = isMonthKey(param(sp, "month")) ? param(sp, "month") : todayKey.slice(0, 7);

  const categories = await db.eventCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, _count: { select: { events: { where: upcomingEventWhere(now) } } } },
  });
  const category = categories.find((c) => c.slug === catSlug) ?? null;

  const win = view === "calendar"
    ? { from: startOfNyDay(monthInfo(month).first), to: endOfNyDay(monthInfo(month).last) }
    : windowFor(when, from, to, now);

  const extra: Prisma.EventWhereInput[] = [{ startAt: { lte: win.to } }];
  if (category) extra.push({ categoryId: category.id });
  if (q) extra.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { locationName: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] });
  const events = await db.event.findMany({
    where: { AND: [upcomingEventWhere(win.from), ...extra] },
    select: eventCardSelect,
    take: 500,
  });
  const occurrences = expandOccurrences(events, win.from, win.to, 120);

  const base = { view: view === "calendar" ? "calendar" : undefined, category: category?.slug, q: q || undefined };
  const listHref = (o: Record<string, string | number | undefined>) => `/events/${qs({ category: category?.slug, q: q || undefined, when: when || undefined, from: from || undefined, to: to || undefined, ...o })}`;
  const activeCount = (category ? 1 : 0) + (when || from || to ? 1 : 0) + (q ? 1 : 0);
  const totalAny = await db.event.count({ where: upcomingEventWhere(now) });

  const filters = (
    <form action="/events/" className="space-y-4">
      {view === "calendar" && <><input type="hidden" name="view" value="calendar" /><input type="hidden" name="month" value={month} /></>}
      <div>
        <label htmlFor="ev-q" className="label">Keyword</label>
        <input id="ev-q" name="q" type="search" defaultValue={q} placeholder="Festival, market, concert…" className="input" />
      </div>
      <div>
        <label htmlFor="ev-cat" className="label">Category</label>
        <select id="ev-cat" name="category" defaultValue={category?.slug ?? ""} className="input">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>
      {view === "list" && (
        <fieldset>
          <legend className="label">Date range</legend>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="ev-from" className="sr-only">From</label><input id="ev-from" type="date" name="from" defaultValue={isDateKey(from) ? from : ""} min={todayKey} className="input" /></div>
            <div><label htmlFor="ev-to" className="sr-only">To</label><input id="ev-to" type="date" name="to" defaultValue={isDateKey(to) ? to : ""} min={todayKey} className="input" /></div>
          </div>
          <p className="help">Leave blank for all upcoming events.</p>
        </fieldset>
      )}
      <button className="btn-primary w-full">Apply filters</button>
      {activeCount > 0 && <Link href={view === "calendar" ? `/events/?view=calendar&month=${month}` : "/events/"} className="btn-ghost w-full">Clear all</Link>}
    </form>
  );

  return (
    <>
      <PageHeader
        eyebrow="What’s happening"
        title={category ? `${category.name} events` : "Events"}
        subtitle="Festivals, live music, markets, family fun and community gatherings across Tuscarawas County."
        crumbs={category ? [{ label: "Events", href: "/events/" }, { label: category.name }] : [{ label: "Events" }]}
      >
        <Link href="/events/submit/" className="btn-accent"><Plus className="h-4 w-4" aria-hidden /> Submit an event</Link>
      </PageHeader>

      <div className="container-page py-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {view === "list" ? (
            <nav aria-label="Date filter" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
              <ul className="flex gap-2 pb-1">
                {WHEN.map((w) => {
                  const active = !from && !to && when === w.key;
                  return (
                    <li key={w.key}>
                      <Link href={listHref({ when: w.key || undefined, from: undefined, to: undefined })} aria-current={active ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>{w.label}</Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : <div />}
          <div role="group" aria-label="View" className="inline-flex shrink-0 self-start rounded-lg bg-slate-100 p-1">
            <Link href={`/events/${qs({ category: category?.slug, q: q || undefined })}`} aria-current={view === "list" ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", view === "list" ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900")}><LayoutList className="h-4 w-4" aria-hidden /> List</Link>
            <Link href={`/events/${qs({ ...base, view: "calendar", month })}`} aria-current={view === "calendar" ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", view === "calendar" ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900")}><CalendarDays className="h-4 w-4" aria-hidden /> Calendar</Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
          <aside aria-label="Event filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={activeCount}>{filters}</FilterPanel>
          </aside>
          <div className="min-w-0">
            {view === "calendar" ? (
              <Calendar month={month} todayKey={todayKey} occurrences={occurrences} base={base} />
            ) : (
              <ListView occurrences={occurrences} page={page} hrefFor={(p) => listHref({ page: p > 1 ? p : undefined })} totalAny={totalAny} filtered={activeCount > 0} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

type Occ = ReturnType<typeof expandOccurrences<Prisma.EventGetPayload<{ select: typeof eventCardSelect }>>>[number];

function ListView({ occurrences, page, hrefFor, totalAny, filtered }: { occurrences: Occ[]; page: number; hrefFor: (p: number) => string; totalAny: number; filtered: boolean }) {
  if (!occurrences.length) {
    return totalAny === 0 ? (
      <EmptyState icon={CalendarDays} title="No upcoming events listed yet">
        Hosting something in Tuscarawas County? <Link href="/events/submit/" className="font-semibold text-brand-700">Submit your event</Link> — it&rsquo;s free.
      </EmptyState>
    ) : (
      <EmptyState icon={CalendarDays} title="No events match those filters">
        {filtered ? <>Try a different date or category, or <Link href="/events/" className="font-semibold text-brand-700">see all upcoming events</Link>.</> : null}
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
      <p className="mb-4 text-sm text-slate-600" aria-live="polite"><span className="font-semibold text-slate-900">{occurrences.length}</span> {occurrences.length === 1 ? "event" : "events"}</p>
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

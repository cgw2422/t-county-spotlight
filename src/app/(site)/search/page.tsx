import type { Metadata } from "next";
import Link from "next/link";
import { FileText, MapPin, Search as SearchIcon } from "lucide-react";
import { businessHref, pageHref } from "@/lib/links";
import { cn, formatDate, stripHtml, truncate } from "@/lib/utils";
import { BusinessCard } from "@/components/cards/business-card";
import { ArticleCard } from "@/components/cards/article-card";
import { EventCard } from "@/components/cards/event-card";
import { SpecialCard } from "@/components/cards/special-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { TrackView } from "@/components/public/track";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import { EXPLORE_ITEMS } from "@/components/home/explore-grid";
import { ChurchCard, NeedCard, OpportunityCard, OrgCard } from "@/components/gives/cards";
import { PulseCard } from "@/components/pulse/pulse-card";
import { GarageSaleCard } from "@/components/garage-sales/garage-sale-card";
import { OpeningCard } from "@/components/openings/opening-card";
import { timeRange } from "@/lib/food-trucks";
import { COMMUNITIES, communityName, communitySlug, getCommunityPreference } from "@/lib/my-t-county";
import { SEARCH_TYPES, runSearch, searchType, type SearchType } from "@/lib/search";

export const dynamic = "force-dynamic";
/** Results per type in the "All" view. */
const LIMIT = 8;
/** Results per page when one type is selected. */
const PER_PAGE = 24;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = param(await searchParams, "q");
  return buildMetadata({ title: q ? `Search: ${q}` : "Search", description: "Search businesses, events, things to do, food trucks, garage sales, churches, nonprofits and ways to help across Tuscarawas County.", path: "/search/", noindex: true });
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").trim().slice(0, 100);
  const type = searchType(param(sp, "type"));
  const city = communityName(param(sp, "community"));
  const includePast = param(sp, "past") === "1";
  const page = type ? pageParam(sp) : 1;
  const pref = await getCommunityPreference();

  const now = new Date();
  const search = q.length >= 2
    ? await runSearch({ q, city, now, includePast }, { only: type, skip: (page - 1) * PER_PAGE, take: type ? PER_PAGE : LIMIT })
    : null;
  const r = search?.results;
  const counts = search?.counts;
  const total = search?.total ?? 0;
  const label = (t: SearchType) => SEARCH_TYPES.find((x) => x.key === t)!.label;

  const href = (o: { type?: string | null; community?: string | null; past?: boolean; page?: number }) => `/search/${qs({
    q,
    type: o.type === undefined ? type : o.type,
    community: o.community === undefined ? communitySlug(city) : o.community,
    past: (o.past === undefined ? includePast : o.past) ? "1" : undefined,
    page: o.page && o.page > 1 ? o.page : undefined,
  })}`;
  const chip = (active: boolean) => cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50");
  const visibleTypes = SEARCH_TYPES.filter((t) => (counts?.[t.key] ?? 0) > 0 || t.key === type);
  const show = (t: SearchType) => (!type || type === t) && (counts?.[t] ?? 0) > 0;
  const shownCount = type ? counts?.[type] ?? 0 : total;
  const typeCount = counts ? Object.values(counts).filter((n) => n > 0).length : 0;

  /** Header for one group. "All" view links to the single-type view; single-type view links to the section's own page. */
  const header = (t: SearchType, title: string = label(t), count: number = counts?.[t] ?? 0) => {
    const more = SEARCH_TYPES.find((x) => x.key === t)!.more;
    return (
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id={`r-${t}`} className="section-title">{title} <span className="ml-1 align-middle text-base font-normal text-slate-500">({count})</span></h2>
        {!type && count > LIMIT ? (
          <Link href={href({ type: t, page: 1 })} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">See all {count} {title.toLowerCase()} →</Link>
        ) : type && more ? (
          <Link href={more} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">Browse {label(t).toLowerCase()} →</Link>
        ) : null}
      </div>
    );
  };
  const grid4 = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-navy-900 text-balance sm:text-4xl">{q ? <>Results for &ldquo;{q}&rdquo;</> : "Search T County"}</h1>
        <div className="mt-5">
          <SearchBox action="/search/" defaultValue={q} placeholder="Search businesses, events, things to do…" label="Search the site" id="search-q" size="lg" hidden={{ type: type ?? undefined, community: communitySlug(city) ?? undefined, past: includePast ? "1" : undefined }} />
        </div>
        {q.length >= 2 && (
          <form action="/search/" className="mt-3 flex flex-wrap items-end gap-3" aria-label="Search filters" data-testid="search-filters">
            <input type="hidden" name="q" value={q} />
            {type && <input type="hidden" name="type" value={type} />}
            <div className="w-full min-w-0 sm:w-auto">
              <label htmlFor="search-community" className="label">Community</label>
              <select id="search-community" name="community" defaultValue={communitySlug(city) ?? ""} className="input sm:w-64">
                <option value="">All of Tuscarawas County</option>
                {COMMUNITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="past" value="1" defaultChecked={includePast} className="h-4 w-4 rounded border-slate-300" /> Include past events
            </label>
            <button className="btn-secondary">Apply</button>
          </form>
        )}
        {q.length >= 2 && pref.community && city !== pref.community && (
          <p className="mt-3"><Link href={href({ community: communitySlug(pref.community), page: 1 })} className={chip(false)} data-testid="search-my-community"><MapPin className="h-4 w-4" aria-hidden /> Only {pref.community}</Link></p>
        )}
        {search && (
          <p className="mt-3 text-sm text-slate-600" aria-live="polite">
            {shownCount === 0 ? "No results found." : <><span className="font-semibold text-slate-900">{shownCount}</span> {shownCount === 1 ? "result" : "results"}{type ? ` in ${label(type).toLowerCase()}` : ""}</>}
            {city && <> in {city} · <Link href={href({ community: null, page: 1 })} className="font-medium text-brand-700 hover:underline">search all of T County</Link></>}
          </p>
        )}
        {search && city && search.skippedTypes.length > 0 && (
          <p className="mt-1 text-xs text-slate-500">Community Pulse and site pages aren&apos;t tied to one community, so they&apos;re left out while a community is selected.</p>
        )}
      </div>

      {search && total > 0 && (
        <nav aria-label="Result types" className="-mx-4 mt-6 overflow-x-auto px-4 scrollbar-none sm:mx-auto sm:max-w-5xl sm:px-0" data-testid="search-type-chips">
          <ul className="flex gap-2 pb-1 sm:flex-wrap sm:justify-center">
            <li><Link href={href({ type: null, page: 1 })} aria-current={!type ? "page" : undefined} className={chip(!type)}>All <span className={!type ? "text-white/70" : "text-slate-400"}>{total}</span></Link></li>
            {visibleTypes.map((t) => (
              <li key={t.key}><Link href={href({ type: t.key, page: 1 })} aria-current={type === t.key ? "page" : undefined} className={chip(type === t.key)}>{t.label} <span className={type === t.key ? "text-white/70" : "text-slate-400"}>{counts?.[t.key] ?? 0}</span></Link></li>
            ))}
          </ul>
        </nav>
      )}

      {!q && (
        <div className="mx-auto mt-10 max-w-3xl">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Browse</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {EXPLORE_ITEMS.map(({ label: l, href: h, icon: Icon, color }) => (
              <li key={l}><Link href={h} className="card card-hover flex h-full items-center gap-3 p-3 text-sm font-semibold text-navy-900"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" aria-hidden /></span>{l}</Link></li>
            ))}
          </ul>
        </div>
      )}
      {q && q.length < 2 && <p className="mx-auto mt-6 max-w-3xl text-slate-600">Type at least two characters to search.</p>}

      {search && shownCount === 0 && (
        <div className="mx-auto mt-8 max-w-3xl" data-testid="search-empty">
          <EmptyState icon={SearchIcon} title={`Nothing found for “${q}”${type ? ` in ${label(type).toLowerCase()}` : ""}${city ? ` in ${city}` : ""}`}>
            {city || type ? (
              <>Try <Link href={href({ type: null, community: null, page: 1 })} className="font-semibold text-brand-700">all results across T County</Link>, check the spelling, or use a more general word.</>
            ) : (
              <>Check the spelling, try a more general word, or browse <Link href="/businesses/" className="font-semibold text-brand-700">businesses</Link>, <Link href="/events/" className="font-semibold text-brand-700">events</Link> and <Link href="/things-to-do/" className="font-semibold text-brand-700">things to do</Link>.</>
            )}
          </EmptyState>
        </div>
      )}

      {search && r && shownCount > 0 && (
        <div className="mt-10 space-y-14">
          <TrackView type="search" targetType="SEARCH" targetId={String(typeCount)} />
          {show("businesses") && (
            <section id="businesses" aria-labelledby="r-businesses" className="scroll-mt-24">
              {header("businesses")}
              <div className={grid4}>{r.businesses.rows.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
            </section>
          )}
          {(show("events") || (type === "events" && r.events.past)) && (
            <section id="events" aria-labelledby="r-events" className="scroll-mt-24">
              {header("events", "Upcoming events", r.events.count)}
              {r.events.rows.length > 0
                ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{r.events.rows.map((e) => <EventCard key={e.id} e={e} layout="row" />)}</div>
                : <p className="text-sm text-slate-600">No upcoming events match.</p>}
              {r.events.past && r.events.past.rows.length > 0 && (
                <div className="mt-8" data-testid="search-past-events">
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Past events ({r.events.past.count})</h3>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{r.events.past.rows.map((e) => <EventCard key={e.id} e={{ ...e, occurrenceStart: e.startAt, occurrenceEnd: e.endAt }} layout="row" />)}</div>
                </div>
              )}
            </section>
          )}
          {show("food-trucks") && (
            <section id="food-trucks" aria-labelledby="r-food-trucks" className="scroll-mt-24">
              {header("food-trucks")}
              <ul className={grid4}>
                {r["food-trucks"].rows.map((t) => (
                  <li key={t.id}>
                    <Link href={businessHref(t)} className="card card-hover block h-full p-4">
                      <span className="block font-semibold text-navy-900">{t.name}</span>
                      {t.cuisine && <span className="block text-sm text-slate-600">{t.cuisine}</span>}
                      <span className="mt-1 block text-xs text-slate-500">{t.next ? `Next scheduled: ${formatDate(t.next.startAt, { weekday: "short", month: "short", day: "numeric" })} · ${timeRange(t.next.startAt, t.next.endAt)} · ${t.next.locationName}` : "No upcoming stops listed"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {show("things-to-do") && (
            <section id="things-to-do" aria-labelledby="r-things-to-do" className="scroll-mt-24">
              {header("things-to-do")}
              <div className={grid4}>{r["things-to-do"].rows.map((x) => x.kind === "business" ? <BusinessCard key={x.b.id} b={x.b} /> : <ArticleCard key={x.a.id} a={x.a} />)}</div>
            </section>
          )}
          {show("gives") && (
            <section id="gives" aria-labelledby="r-gives" className="scroll-mt-24">
              {header("gives", "Volunteer opportunities & needs")}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {r.gives.rows.map((x) => x.kind === "need" ? <NeedCard key={`n-${x.n.id}`} n={x.n} pledged={x.pledged} /> : <OpportunityCard key={`o-${x.o.id}`} o={x.o} left={x.left} />)}
              </div>
            </section>
          )}
          {show("garage-sales") && (
            <section id="garage-sales" aria-labelledby="r-garage-sales" className="scroll-mt-24">
              {header("garage-sales")}
              <div className={grid4}>{r["garage-sales"].rows.map((s) => <GarageSaleCard key={s.id} s={s} compact />)}</div>
            </section>
          )}
          {show("churches") && (
            <section id="churches" aria-labelledby="r-churches" className="scroll-mt-24">
              {header("churches")}
              <div className={grid4}>{r.churches.rows.map((o) => <ChurchCard key={o.id} o={o} />)}</div>
            </section>
          )}
          {show("nonprofits") && (
            <section id="organizations" aria-labelledby="r-nonprofits" className="scroll-mt-24">
              {header("nonprofits", "Nonprofits & community groups")}
              <div className={grid4}>{r.nonprofits.rows.map((o) => <OrgCard key={o.id} o={o} />)}</div>
            </section>
          )}
          {show("announcements") && (
            <section id="announcements" aria-labelledby="r-announcements" className="scroll-mt-24">
              {header("announcements")}
              <div className={grid4}>{r.announcements.rows.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
            </section>
          )}
          {show("new") && (
            <section id="new" aria-labelledby="r-new" className="scroll-mt-24">
              {header("new")}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{r.new.rows.map((o) => <OpeningCard key={o.id} o={o} />)}</div>
            </section>
          )}
          {show("specials") && (
            <section id="specials" aria-labelledby="r-specials" className="scroll-mt-24">
              {header("specials")}
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{r.specials.rows.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
            </section>
          )}
          {show("articles") && (
            <section id="articles" aria-labelledby="r-articles" className="scroll-mt-24">
              {header("articles")}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{r.articles.rows.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
            </section>
          )}
          {show("community-pulse") && (
            <section id="community-pulse" aria-labelledby="r-community-pulse" className="scroll-mt-24">
              {header("community-pulse")}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{r["community-pulse"].rows.map((p) => <PulseCard key={p.id} p={p} />)}</div>
            </section>
          )}
          {show("pages") && (
            <section id="pages" aria-labelledby="r-pages" className="scroll-mt-24">
              {header("pages")}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {r.pages.rows.map((p) => (
                  <li key={p.id}>
                    <Link href={pageHref(p)} className="card card-hover flex gap-3 p-4">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                      <span className="min-w-0"><span className="block font-semibold text-navy-900">{stripHtml(p.title)}</span><span className="mt-1 line-clamp-2 block text-sm text-slate-600">{truncate(stripHtml(p.content), 160)}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {type && <Pagination page={page} totalPages={Math.max(1, Math.ceil((r[type].count) / PER_PAGE))} hrefFor={(p) => href({ page: p })} />}
        </div>
      )}
    </div>
  );
}

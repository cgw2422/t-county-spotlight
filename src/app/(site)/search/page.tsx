import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Search as SearchIcon } from "lucide-react";
import { db } from "@/lib/db";
import { activePromotionWhere } from "@/lib/promotions";
import { articleCardSelect, businessCardSelect, eventCardSelect, publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { expandOccurrences, upcomingEventWhere } from "@/lib/events";
import { pageHref } from "@/lib/links";
import { stripHtml, truncate } from "@/lib/utils";
import { BusinessCard } from "@/components/cards/business-card";
import { ArticleCard } from "@/components/cards/article-card";
import { EventCard } from "@/components/cards/event-card";
import { SpecialCard } from "@/components/cards/special-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchBox } from "@/components/public/search-box";
import { buildMetadata, param, qs, type SearchParams } from "@/components/public/seo";
import { EXPLORE_ITEMS } from "@/components/home/explore-grid";

export const dynamic = "force-dynamic";
const LIMIT = 8;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = param(await searchParams, "q");
  return buildMetadata({ title: q ? `Search: ${q}` : "Search", description: "Search businesses, events, specials and stories across Tuscarawas County.", path: "/search/", noindex: true });
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = param(await searchParams, "q").slice(0, 100);
  const c = { contains: q, mode: "insensitive" as const };
  const now = new Date();

  const results = q.length >= 2 ? await (async () => {
    const bizWhere = publicBusinessWhere({ OR: [{ name: c }, { tagline: c }, { description: c }, { city: c }, { categories: { some: { name: c } } }] });
    const artWhere = publishedArticleWhere({ OR: [{ title: c }, { excerpt: c }, { content: c }] });
    const evWhere = { AND: [upcomingEventWhere(now), { OR: [{ title: c }, { description: c }, { locationName: c }, { city: c }] }] };
    const spWhere = { ...activePromotionWhere(now), AND: [{ OR: [{ title: c }, { description: c }, { business: { name: c } }] }] };
    const pgWhere = { status: "PUBLISHED" as const, deletedAt: null, OR: [{ title: c }, { content: c }] };
    const [bizCount, businesses, artCount, articles, rawEvents, spCount, specials, pages] = await Promise.all([
      db.business.count({ where: bizWhere }),
      db.business.findMany({ where: bizWhere, select: businessCardSelect, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: LIMIT }),
      db.article.count({ where: artWhere }),
      db.article.findMany({ where: artWhere, select: articleCardSelect, orderBy: { publishedAt: "desc" }, take: LIMIT }),
      db.event.findMany({ where: evWhere, select: eventCardSelect, take: 100 }),
      db.promotion.count({ where: spWhere }),
      db.promotion.findMany({ where: spWhere, take: LIMIT, orderBy: [{ isSponsored: "desc" }, { startsAt: "desc" }], select: { id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true, business: { select: { name: true, logoUrl: true, coverUrl: true } } } }),
      db.page.findMany({ where: pgWhere, select: { id: true, slug: true, title: true, legacyPath: true, content: true }, take: 6 }),
    ]);
    const seen = new Set<string>();
    const events = expandOccurrences(rawEvents, now, new Date(now.getTime() + 365 * 86400_000)).filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
    return { bizCount, businesses, artCount, articles, events, spCount, specials, pages };
  })() : null;

  const total = results ? results.bizCount + results.artCount + results.events.length + results.spCount + results.pages.length : 0;
  const groups = results ? [
    { id: "businesses", label: "Businesses", count: results.bizCount },
    { id: "events", label: "Events", count: results.events.length },
    { id: "specials", label: "Specials", count: results.spCount },
    { id: "articles", label: "Stories", count: results.artCount },
    { id: "pages", label: "Pages", count: results.pages.length },
  ].filter((g) => g.count > 0) : [];

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold text-navy-900 sm:text-4xl">{q ? <>Results for &ldquo;{q}&rdquo;</> : "Search T-County"}</h1>
        <div className="mt-5"><SearchBox action="/search/" defaultValue={q} placeholder="Search businesses, events, specials, stories…" label="Search the site" id="search-q" size="lg" /></div>
        {results && (
          <p className="mt-3 text-sm text-slate-600" aria-live="polite">{total === 0 ? "No results found." : <><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "result" : "results"}</>}</p>
        )}
        {groups.length > 1 && (
          <nav aria-label="Result groups" className="mt-4 flex flex-wrap gap-2">
            {groups.map((g) => <a key={g.id} href={`#${g.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">{g.label} <span className="text-slate-400">{g.count}</span></a>)}
          </nav>
        )}
      </div>

      {!q && (
        <div className="mx-auto mt-10 max-w-3xl">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Browse</h2>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {EXPLORE_ITEMS.map(({ label, href, icon: Icon, color }) => (
              <li key={label}><Link href={href} className="card card-hover flex h-full items-center gap-3 p-3 text-sm font-semibold text-navy-900"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" aria-hidden /></span>{label}</Link></li>
            ))}
          </ul>
        </div>
      )}
      {q && q.length < 2 && <p className="mx-auto mt-6 max-w-3xl text-slate-600">Type at least two characters to search.</p>}

      {results && total === 0 && (
        <div className="mx-auto mt-8 max-w-3xl">
          <EmptyState icon={SearchIcon} title={`Nothing found for “${q}”`}>Check the spelling, try a more general word, or browse <Link href="/businesses/" className="font-semibold text-brand-700">businesses</Link> and <Link href="/events/" className="font-semibold text-brand-700">events</Link>.</EmptyState>
        </div>
      )}

      {results && total > 0 && (
        <div className="mt-10 space-y-14">
          {results.businesses.length > 0 && (
            <section id="businesses" aria-labelledby="r-biz" className="scroll-mt-24">
              <GroupHeader id="r-biz" title="Businesses" count={results.bizCount} more={results.bizCount > LIMIT ? `/businesses/${qs({ q })}` : undefined} />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{results.businesses.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
            </section>
          )}
          {results.events.length > 0 && (
            <section id="events" aria-labelledby="r-ev" className="scroll-mt-24">
              <GroupHeader id="r-ev" title="Upcoming events" count={results.events.length} more={results.events.length > LIMIT ? `/events/${qs({ q })}` : undefined} />
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{results.events.slice(0, LIMIT).map((e) => <EventCard key={e.id} e={e} layout="row" />)}</div>
            </section>
          )}
          {results.specials.length > 0 && (
            <section id="specials" aria-labelledby="r-sp" className="scroll-mt-24">
              <GroupHeader id="r-sp" title="Specials" count={results.spCount} />
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{results.specials.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
            </section>
          )}
          {results.articles.length > 0 && (
            <section id="articles" aria-labelledby="r-art" className="scroll-mt-24">
              <GroupHeader id="r-art" title="Stories" count={results.artCount} more={results.artCount > LIMIT ? `/articles/${qs({ q })}` : undefined} />
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{results.articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
            </section>
          )}
          {results.pages.length > 0 && (
            <section id="pages" aria-labelledby="r-pg" className="scroll-mt-24">
              <GroupHeader id="r-pg" title="Pages" count={results.pages.length} />
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {results.pages.map((p) => (
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
        </div>
      )}
    </div>
  );
}

function GroupHeader({ id, title, count, more }: { id: string; title: string; count: number; more?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 id={id} className="section-title">{title} <span className="ml-1 align-middle text-base font-normal text-slate-500">({count})</span></h2>
      {more && <Link href={more} className="shrink-0 text-sm font-semibold text-brand-700 hover:underline">See all →</Link>}
    </div>
  );
}

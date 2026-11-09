import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, X } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { publicPulseWhere, pulseCardSelect } from "@/lib/pulse";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import { PulseCard } from "@/components/pulse/pulse-card";

export const dynamic = "force-dynamic";
const PER_PAGE = 12;
const INTRO = "Discover what people across Tuscarawas County are talking about, recommending, and sharing. Explore local favorites, community recommendations, and conversations that help connect our county.";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const catSlug = param(sp, "category"), page = pageParam(sp);
  const cat = catSlug ? await db.pulseCategory.findUnique({ where: { slug: catSlug }, select: { name: true } }) : null;
  return buildMetadata({
    title: cat ? `${cat.name} — Community Pulse` : "Community Pulse",
    description: INTRO,
    path: `/community-pulse/${qs({ category: cat ? catSlug : undefined, page: page > 1 ? page : undefined })}`,
    noindex: !!param(sp, "q") || !!param(sp, "archived"),
  });
}

export default async function PulseArchivePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100);
  const catSlug = param(sp, "category");
  const archived = param(sp, "archived") === "1";
  const page = pageParam(sp);

  const category = catSlug ? await db.pulseCategory.findUnique({ where: { slug: catSlug }, select: { id: true, name: true, slug: true } }) : null;
  const filtered = !!(q || category || archived);
  // Archived entries leave the "recent" list but stay findable through search and filters.
  const and: Prisma.CommunityPulseWhereInput[] = [];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ title: c }, { description: c }, { results: { some: { name: c } } }] });
  }
  if (category) and.push({ categoryId: category.id });
  if (archived) and.push({ status: "ARCHIVED" });
  const where = publicPulseWhere(and.length ? { AND: and } : {}, { includeArchived: filtered });

  const [categories, total, featured] = await Promise.all([
    db.pulseCategory.findMany({
      where: { pulses: { some: publicPulseWhere({}, { includeArchived: true }) } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    }),
    db.communityPulse.count({ where }),
    // Highlight: the featured entry, else the most recent one (unfiltered list; shown on page 1).
    !filtered
      ? db.communityPulse.findFirst({ where: publicPulseWhere(), orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], select: pulseCardSelect })
      : null,
  ]);
  const highlightId = featured?.id;
  const listWhere: Prisma.CommunityPulseWhereInput = highlightId ? { AND: [where, { id: { not: highlightId } }] } : where;
  const listTotal = highlightId ? total - 1 : total;
  const entries = await db.communityPulse.findMany({ where: listWhere, select: pulseCardSelect, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE });
  const totalPages = Math.max(1, Math.ceil(listTotal / PER_PAGE));
  const href = (o: { category?: string | null; q?: string | null; archived?: boolean; page?: number }) => `/community-pulse/${qs({
    q: o.q === undefined ? q : o.q,
    category: o.category === undefined ? category?.slug : o.category,
    archived: (o.archived === undefined ? archived : o.archived) ? 1 : undefined,
    page: o.page && o.page > 1 ? o.page : undefined,
  })}`;
  const chip = (active: boolean) => cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50");

  return (
    <>
      <PageHeader eyebrow="Local favorites & conversations" title={category ? `${category.name} — Community Pulse` : "Community Pulse"} subtitle={INTRO} crumbs={category ? [{ label: "Community Pulse", href: "/community-pulse/" }, { label: category.name }] : [{ label: "Community Pulse" }]} />
      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/community-pulse/" defaultValue={q} placeholder="Search topics, questions or local names…" label="Search Community Pulse" hidden={{ category: category?.slug, archived: archived ? "1" : undefined }} id="pulse-q" />
        {categories.length > 0 && (
          <nav aria-label="Community Pulse categories" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <ul className="flex gap-2 pb-1 sm:flex-wrap">
              <li><Link href={href({ category: null, page: 1 })} aria-current={!category ? "page" : undefined} className={chip(!category)}>All topics</Link></li>
              {categories.map((c) => (
                <li key={c.id}><Link href={href({ category: c.slug, page: 1 })} aria-current={c.id === category?.id ? "page" : undefined} className={chip(c.id === category?.id)}>{c.name}</Link></li>
              ))}
            </ul>
          </nav>
        )}
        {filtered && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "entry" : "entries"}</p>
            {q && <Link href={href({ q: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">“{q}” <X className="h-3 w-3" aria-label="Remove search" /></Link>}
            {archived && <Link href={href({ archived: false, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">Archived only <X className="h-3 w-3" aria-label="Remove archived filter" /></Link>}
          </div>
        )}

        <div className="mt-8">
          {total === 0 ? (
            <EmptyState icon={MessagesSquare} title={filtered ? "No Community Pulse entries match" : "Community Pulse is coming soon"}>
              {filtered ? <>Try another search or <Link href="/community-pulse/" className="font-semibold text-brand-700">see all entries</Link>.</> : "We’re gathering local conversations and recommendations. Check back soon."}
            </EmptyState>
          ) : (
            <>
              {featured && page === 1 && <div className="mb-10"><PulseCard p={featured} variant="feature" /></div>}
              {entries.length > 0 && (
                <>
                  {featured && page === 1 && <h2 className="section-title mb-5">Recent conversations</h2>}
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{entries.map((p) => <PulseCard key={p.id} p={p} />)}</div>
                </>
              )}
            </>
          )}
          <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
          {!archived && (
            <p className="mt-8 text-center text-sm text-slate-500"><Link href={href({ archived: true, q: null, category: null, page: 1 })} className="font-medium text-brand-700 hover:underline">Browse archived conversations</Link></p>
          )}
        </div>
      </div>
    </>
  );
}

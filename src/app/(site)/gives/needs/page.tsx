import type { Metadata } from "next";
import Link from "next/link";
import { HandHelping, X } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { KIND_PARAM, KIND_PLURAL, KIND_TO_PARAM, NEED_CATEGORIES, NEED_CATEGORY_LABEL, NEED_URGENCIES, ORG_KINDS, URGENCY_LABEL } from "@/lib/gives/constants";
import { needCardSelect, openNeedWhere, pledgedTotals } from "@/lib/gives/queries";
import { NeedCard } from "@/components/gives/cards";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { FilterPanel } from "@/components/public/filter-panel";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;
const CAT_PARAM = Object.fromEntries(NEED_CATEGORIES.map((c) => [c.toLowerCase(), c])) as Record<string, (typeof NEED_CATEGORIES)[number]>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = CAT_PARAM[param(sp, "category")];
  return buildMetadata({
    title: `${cat ? `${NEED_CATEGORY_LABEL[cat]} Needed` : "Community Needs Board"} — Tuscarawas County`,
    description: "See what local nonprofits, churches and community groups need right now — supplies, food, clothing and volunteers — and pledge to help.",
    path: `/gives/needs/${qs({ category: cat ? cat.toLowerCase() : undefined })}`,
    noindex: !!param(sp, "q") || !!param(sp, "urgency") || !!param(sp, "kind") || !!param(sp, "city") || pageParam(sp) > 1,
  });
}

export default async function NeedsBoard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100);
  const category = CAT_PARAM[param(sp, "category")] ?? null;
  const urgency = (NEED_URGENCIES as readonly string[]).includes(param(sp, "urgency").toUpperCase()) ? (param(sp, "urgency").toUpperCase() as (typeof NEED_URGENCIES)[number]) : null;
  const kind = KIND_PARAM[param(sp, "kind")] ?? null;
  const cityParam = param(sp, "city").slice(0, 80);
  const page = pageParam(sp);

  const [catGroups, allNeeds] = await Promise.all([
    db.communityNeed.groupBy({ by: ["category"], where: openNeedWhere(), _count: { _all: true } }),
    db.communityNeed.findMany({ where: openNeedWhere(), select: { organization: { select: { city: true } } }, take: 2000 }),
  ]);
  const cc = new Map(catGroups.map((g) => [g.category, g._count._all]));
  const totalAll = catGroups.reduce((n, g) => n + g._count._all, 0);
  const cities = [...new Set(allNeeds.map((n) => n.organization.city?.trim()).filter((c): c is string => !!c))].sort();
  const city = cities.find((c) => c.toLowerCase() === cityParam.toLowerCase()) ?? cityParam;

  const and: Prisma.CommunityNeedWhereInput[] = [];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ title: c }, { description: c }, { organization: { name: c } }] });
  }
  if (category) and.push({ category });
  if (urgency) and.push({ urgency });
  if (kind) and.push({ organization: { kind } });
  if (city) and.push({ organization: { city: { equals: city, mode: "insensitive" } } });
  const where = openNeedWhere(and.length ? { AND: and } : {});
  const [total, needs] = await Promise.all([
    db.communityNeed.count({ where }),
    db.communityNeed.findMany({ where, select: needCardSelect, orderBy: [{ urgency: "desc" }, { deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  const pledged = await pledgedTotals(needs.map((n) => n.id));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (o: { q?: string | null; category?: string | null; urgency?: string | null; kind?: string | null; city?: string | null; page?: number }) =>
    `/gives/needs/${qs({
      q: o.q === undefined ? q : o.q,
      category: o.category === undefined ? category?.toLowerCase() : o.category,
      urgency: o.urgency === undefined ? urgency?.toLowerCase() : o.urgency,
      kind: o.kind === undefined ? (kind ? KIND_TO_PARAM[kind] : undefined) : o.kind,
      city: o.city === undefined ? city : o.city,
      page: o.page && o.page > 1 ? o.page : undefined,
    })}`;
  const chip = (active: boolean) => cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50");

  return (
    <>
      <PageHeader
        eyebrow="T-County Gives"
        title={category ? `${NEED_CATEGORY_LABEL[category]} needed` : "Community needs board"}
        subtitle="What local organizations need right now. Pledge to help — no account needed."
        crumbs={[{ label: "T-County Gives", href: "/gives/" }, { label: "Needs" }]}
      />
      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/gives/needs/" defaultValue={q} placeholder="Search needs or organizations…" label="Search needs" hidden={{ category: category?.toLowerCase(), urgency: urgency?.toLowerCase(), kind: kind ? KIND_TO_PARAM[kind] : undefined, city }} id="need-q" />
        <nav aria-label="Need categories" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li><Link href={href({ category: null, page: 1 })} aria-current={!category ? "page" : undefined} className={chip(!category)}>All <span className={!category ? "text-white/70" : "text-slate-400"}>{totalAll}</span></Link></li>
            {NEED_CATEGORIES.filter((c) => cc.get(c) || c === category).map((c) => (
              <li key={c}><Link href={href({ category: c.toLowerCase(), page: 1 })} aria-current={category === c ? "page" : undefined} className={chip(category === c)}>{NEED_CATEGORY_LABEL[c]} <span className={category === c ? "text-white/70" : "text-slate-400"}>{cc.get(c) ?? 0}</span></Link></li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={[category, urgency, kind, city].filter(Boolean).length}>
              <form action="/gives/needs/" className="space-y-4">
                {q && <input type="hidden" name="q" value={q} />}
                <div>
                  <label htmlFor="f-category" className="label">Category</label>
                  <select id="f-category" name="category" defaultValue={category?.toLowerCase() ?? ""} className="input">
                    <option value="">All categories</option>
                    {NEED_CATEGORIES.map((c) => <option key={c} value={c.toLowerCase()}>{NEED_CATEGORY_LABEL[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-urgency" className="label">Urgency</label>
                  <select id="f-urgency" name="urgency" defaultValue={urgency?.toLowerCase() ?? ""} className="input">
                    <option value="">Any urgency</option>
                    {[...NEED_URGENCIES].reverse().map((u) => <option key={u} value={u.toLowerCase()}>{URGENCY_LABEL[u]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-kind" className="label">Organization</label>
                  <select id="f-kind" name="kind" defaultValue={kind ? KIND_TO_PARAM[kind] : ""} className="input">
                    <option value="">All organizations</option>
                    {ORG_KINDS.map((k) => <option key={k} value={KIND_TO_PARAM[k]}>{KIND_PLURAL[k]}</option>)}
                  </select>
                </div>
                {cities.length > 0 && (
                  <div>
                    <label htmlFor="f-city" className="label">Town</label>
                    <select id="f-city" name="city" defaultValue={city} className="input">
                      <option value="">All of Tuscarawas County</option>
                      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <button className="btn-primary w-full">Apply filters</button>
                {(category || urgency || kind || city || q) && <Link href="/gives/needs/" className="btn-ghost w-full">Clear all</Link>}
              </form>
            </FilterPanel>
          </aside>
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <p aria-live="polite"><span className="font-semibold text-slate-900">{total}</span> open {total === 1 ? "need" : "needs"}</p>
              {q && <Link href={href({ q: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">“{q}” <X className="h-3 w-3" aria-label="Remove search" /></Link>}
              {urgency && <Link href={href({ urgency: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{URGENCY_LABEL[urgency]} <X className="h-3 w-3" aria-label="Remove urgency filter" /></Link>}
              {kind && <Link href={href({ kind: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{KIND_PLURAL[kind]} <X className="h-3 w-3" aria-label="Remove organization filter" /></Link>}
              {city && <Link href={href({ city: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{city} <X className="h-3 w-3" aria-label="Remove town filter" /></Link>}
            </div>
            {needs.length ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {needs.map((n) => <li key={n.id} className="flex"><div className="w-full"><NeedCard n={n} pledged={pledged.get(n.id)} /></div></li>)}
              </ul>
            ) : totalAll === 0 ? (
              <EmptyState icon={HandHelping} title="No open needs right now">
                Local organizations post needs here as they come up. Run one? <Link href="/gives/register/" className="font-semibold text-brand-700">Register for free</Link>.
              </EmptyState>
            ) : (
              <EmptyState icon={HandHelping} title="No needs match those filters">
                Try fewer filters or <Link href="/gives/needs/" className="font-semibold text-brand-700">see all needs</Link>.
              </EmptyState>
            )}
            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
          </div>
        </div>
      </div>
    </>
  );
}

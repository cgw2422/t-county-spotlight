import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Store, X } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { businessCardSelect, getActivePlacements, publicBusinessWhere } from "@/lib/queries";
import { TUSCARAWAS_CITIES, cn } from "@/lib/utils";
import { BusinessCard } from "@/components/cards/business-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { FilterPanel } from "@/components/public/filter-panel";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

async function getCategories() {
  return db.businessCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true, _count: { select: { businesses: { where: publicBusinessWhere() } } } },
  });
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const catSlug = param(sp, "category");
  const city = param(sp, "city");
  const page = pageParam(sp);
  const cat = catSlug ? await db.businessCategory.findUnique({ where: { slug: catSlug }, select: { name: true, description: true } }) : null;
  const where = [cat?.name, city ? `in ${city}` : null].filter(Boolean).join(" ");
  return buildMetadata({
    title: where ? `${cat?.name ?? "Local Businesses"}${city ? ` in ${city}, Ohio` : " in Tuscarawas County"}` : "Local Business Directory",
    description: cat?.description || `Find ${cat ? cat.name.toLowerCase() : "local businesses"}${city ? ` in ${city}` : ""} across Tuscarawas County, Ohio — hours, contact info, specials and stories.`,
    path: `/businesses/${qs({ category: cat ? catSlug : undefined, city: city || undefined, page: page > 1 ? page : undefined })}`,
    noindex: !!param(sp, "q"),
  });
}

export default async function BusinessesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100);
  const catSlug = param(sp, "category");
  const cityParam = param(sp, "city");
  const page = pageParam(sp);

  const [settings, categories, cityGroups, totalAll] = await Promise.all([
    getSettings(),
    getCategories(),
    db.business.groupBy({ by: ["city"], where: publicBusinessWhere({ city: { not: null } }), _count: { _all: true } }),
    db.business.count({ where: publicBusinessWhere() }),
  ]);
  const category = categories.find((c) => c.slug === catSlug) ?? null;
  const cityCounts = new Map(cityGroups.map((g) => [(g.city ?? "").trim().toLowerCase(), g._count._all]));
  const cities = TUSCARAWAS_CITIES.filter((c) => cityCounts.has(c.toLowerCase())).map((c) => ({ name: c, count: cityCounts.get(c.toLowerCase())! }));
  const city = cities.find((c) => c.name.toLowerCase() === cityParam.toLowerCase())?.name ?? (cityParam ? cityParam : "");

  const and: Prisma.BusinessWhereInput[] = [];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ name: c }, { tagline: c }, { description: c }, { city: c }, { categories: { some: { name: c } } }] });
  }
  if (category) and.push({ categories: { some: { id: category.id } } });
  if (city) and.push({ city: { equals: city, mode: "insensitive" } });
  const where = publicBusinessWhere(and.length ? { AND: and } : {});

  const [total, businesses, placements] = await Promise.all([
    db.business.count({ where }),
    db.business.findMany({ where, select: businessCardSelect, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    page === 1 && !q ? getActivePlacements(category ? `category:${category.slug}` : "homepage_featured") : Promise.resolve([]),
  ]);
  const sponsored = placements
    .map((p) => p.business)
    .filter((b): b is NonNullable<typeof b> => !!b)
    .filter((b) => !city || (b.city ?? "").toLowerCase() === city.toLowerCase())
    .slice(0, 4);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (o: { category?: string | null; city?: string | null; page?: number; q?: string | null }) =>
    `/businesses/${qs({
      q: o.q === undefined ? q : o.q,
      category: o.category === undefined ? catSlug : o.category,
      city: o.city === undefined ? city : o.city,
      page: o.page && o.page > 1 ? o.page : undefined,
    })}`;
  const activeFilters = [category, city, q].filter(Boolean).length;
  const title = category ? category.name : "Local Business Directory";

  return (
    <>
      <PageHeader
        eyebrow="Shop & support local"
        title={city && category ? `${category.name} in ${city}` : city ? `Businesses in ${city}` : title}
        subtitle={category?.description || "Discover the shops, restaurants, makers and services that make Tuscarawas County home."}
        crumbs={category ? [{ label: "Businesses", href: "/businesses/" }, { label: category.name }] : [{ label: "Businesses" }]}
      >
        <Link href="/list-your-business/" className="btn-accent"><Plus className="h-4 w-4" aria-hidden /> List your business</Link>
      </PageHeader>

      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/businesses/" defaultValue={q} placeholder="Search by name, service or town…" label="Search businesses" hidden={{ category: category?.slug, city }} id="biz-q" />

        <nav aria-label="Business categories" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li>
              <Link href={href({ category: null, page: 1 })} aria-current={!category ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", !category ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>All</Link>
            </li>
            {categories.filter((c) => c._count.businesses > 0 || c.id === category?.id).map((c) => (
              <li key={c.id}>
                <Link href={href({ category: c.slug, page: 1 })} aria-current={c.id === category?.id ? "page" : undefined} className={cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", c.id === category?.id ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
                  {c.name} <span className={c.id === category?.id ? "text-white/70" : "text-slate-400"}>{c._count.businesses}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={(category ? 1 : 0) + (city ? 1 : 0)}>
              <form action="/businesses/" className="space-y-4">
                {q && <input type="hidden" name="q" value={q} />}
                <div>
                  <label htmlFor="f-category" className="label">Category</label>
                  <select id="f-category" name="category" defaultValue={category?.slug ?? ""} className="input">
                    <option value="">All categories</option>
                    {categories.map((c) => <option key={c.id} value={c.slug}>{c.name} ({c._count.businesses})</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-city" className="label">Town</label>
                  <select id="f-city" name="city" defaultValue={city} className="input">
                    <option value="">All of Tuscarawas County</option>
                    {cities.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
                  </select>
                </div>
                <button className="btn-primary w-full">Apply filters</button>
                {activeFilters > 0 && <Link href="/businesses/" className="btn-ghost w-full">Clear all</Link>}
              </form>
              {cities.length > 0 && (
                <div className="mt-6 hidden lg:block">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Browse by town</h2>
                  <ul className="mt-2 space-y-0.5 text-sm">
                    {cities.map((c) => (
                      <li key={c.name}>
                        <Link href={href({ city: c.name === city ? null : c.name, page: 1 })} aria-current={c.name === city ? "page" : undefined} className={cn("flex justify-between rounded-md px-2 py-1.5", c.name === city ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-100")}>
                          {c.name} <span className="text-slate-400">{c.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </FilterPanel>
          </aside>

          <div className="min-w-0">
            {sponsored.length > 0 && (
              <section aria-labelledby="sponsored-title" className="mb-10 rounded-2xl bg-amber-50/60 p-4 ring-1 ring-amber-200 sm:p-5">
                <h2 id="sponsored-title" className="mb-4 flex items-center gap-2 text-sm font-semibold text-amber-900"><span className="badge-sponsored">{settings.sponsoredLabel}</span> Featured partners{category ? ` in ${category.name}` : ""}</h2>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {sponsored.map((b) => <BusinessCard key={b.id} b={b} sponsored sponsoredLabel={settings.sponsoredLabel} />)}
                </div>
              </section>
            )}

            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <p aria-live="polite"><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "business" : "businesses"}{q && <> matching &ldquo;{q}&rdquo;</>}</p>
              {q && <Link href={href({ q: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">“{q}” <X className="h-3 w-3" aria-label="Remove search" /></Link>}
              {category && <Link href={href({ category: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{category.name} <X className="h-3 w-3" aria-label="Remove category filter" /></Link>}
              {city && <Link href={href({ city: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{city} <X className="h-3 w-3" aria-label="Remove town filter" /></Link>}
            </div>

            {businesses.length ? (
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {businesses.map((b) => <li key={b.id} className="flex"><div className="flex w-full flex-col [&>a]:flex-1"><BusinessCard b={b} /></div></li>)}
              </ul>
            ) : totalAll === 0 ? (
              <EmptyState icon={Store} title="The business directory is being built">
                We&rsquo;re adding Tuscarawas County businesses now. Own one? <Link href="/list-your-business/" className="font-semibold text-brand-700">Add your free listing</Link>.
              </EmptyState>
            ) : (
              <EmptyState icon={Store} title="No businesses match those filters">
                Try a different search or <Link href="/businesses/" className="font-semibold text-brand-700">browse all businesses</Link>.
              </EmptyState>
            )}

            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
          </div>
        </div>
      </div>
    </>
  );
}

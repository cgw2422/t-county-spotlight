import type { Metadata } from "next";
import Link from "next/link";
import { HeartHandshake, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { KIND_PARAM, KIND_PLURAL, KIND_TO_PARAM, ORG_KINDS } from "@/lib/gives/constants";
import { orgCardSelect, publicOrgWhere } from "@/lib/gives/queries";
import { OrgCard } from "@/components/gives/cards";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { FilterPanel } from "@/components/public/filter-panel";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const kind = KIND_PARAM[param(sp, "kind")];
  const city = param(sp, "city");
  return buildMetadata({
    title: `${kind ? KIND_PLURAL[kind] : "Nonprofits, Churches & Community Groups"}${city ? ` in ${city}, Ohio` : " in Tuscarawas County"}`,
    description: "Find local nonprofits, churches and community groups across Tuscarawas County, Ohio — see their needs, volunteer opportunities and how to help.",
    path: `/gives/organizations/${qs({ kind: kind ? KIND_TO_PARAM[kind] : undefined, city: city || undefined })}`,
    noindex: !!param(sp, "q") || !!param(sp, "type") || pageParam(sp) > 1,
  });
}

export default async function OrganizationsDirectory({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100);
  const kindParam = param(sp, "kind");
  const kind = KIND_PARAM[kindParam] ?? null;
  const type = param(sp, "type").slice(0, 80);
  const cityParam = param(sp, "city").slice(0, 80);
  const page = pageParam(sp);

  const [kindCounts, typeGroups, cityGroups] = await Promise.all([
    db.organization.groupBy({ by: ["kind"], where: publicOrgWhere(), _count: { _all: true } }),
    db.organization.groupBy({ by: ["orgType"], where: publicOrgWhere({ orgType: { not: null } }), _count: { _all: true }, orderBy: { orgType: "asc" } }),
    db.organization.groupBy({ by: ["city"], where: publicOrgWhere({ city: { not: null } }), _count: { _all: true }, orderBy: { city: "asc" } }),
  ]);
  const kc = new Map(kindCounts.map((k) => [k.kind, k._count._all]));
  const totalAll = kindCounts.reduce((n, k) => n + k._count._all, 0);
  const types = typeGroups.filter((t) => t.orgType).map((t) => ({ name: t.orgType!, count: t._count._all }));
  const cities = cityGroups.filter((c) => c.city).map((c) => ({ name: c.city!, count: c._count._all }));
  const city = cities.find((c) => c.name.toLowerCase() === cityParam.toLowerCase())?.name ?? cityParam;

  const and: Prisma.OrganizationWhereInput[] = [];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ name: c }, { tagline: c }, { mission: c }, { orgType: c }, { denomination: c }, { city: c }, { serviceArea: c }] });
  }
  if (kind) and.push({ kind });
  if (type) and.push({ orgType: { equals: type, mode: "insensitive" } });
  if (city) and.push({ city: { equals: city, mode: "insensitive" } });
  const where = publicOrgWhere(and.length ? { AND: and } : {});
  const [total, orgs] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({ where, select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { verifiedAt: { sort: "desc", nulls: "last" } }, { name: "asc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (o: { kind?: string | null; type?: string | null; city?: string | null; q?: string | null; page?: number }) =>
    `/gives/organizations/${qs({
      q: o.q === undefined ? q : o.q,
      kind: o.kind === undefined ? (kind ? KIND_TO_PARAM[kind] : undefined) : o.kind,
      type: o.type === undefined ? type : o.type,
      city: o.city === undefined ? city : o.city,
      page: o.page && o.page > 1 ? o.page : undefined,
    })}`;
  const chip = (active: boolean) => cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50");

  return (
    <>
      <PageHeader
        eyebrow="T-County Gives"
        title={kind ? `${KIND_PLURAL[kind]}${city ? ` in ${city}` : ""}` : city ? `Organizations in ${city}` : "Nonprofits, churches & community groups"}
        subtitle="The people and places making Tuscarawas County a better home. Find a cause you care about."
        crumbs={[{ label: "T-County Gives", href: "/gives/" }, { label: "Organizations" }]}
      >
        <Link href="/gives/register/" className="btn-accent"><Plus className="h-4 w-4" aria-hidden /> Register free</Link>
      </PageHeader>

      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/gives/organizations/" defaultValue={q} placeholder="Search by name, cause or town…" label="Search organizations" hidden={{ kind: kind ? KIND_TO_PARAM[kind] : undefined, type, city }} id="org-q" />

        <nav aria-label="Organization kinds" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li><Link href={href({ kind: null, page: 1 })} aria-current={!kind ? "page" : undefined} className={chip(!kind)}>All <span className={!kind ? "text-white/70" : "text-slate-400"}>{totalAll}</span></Link></li>
            {ORG_KINDS.filter((k) => kc.get(k)).map((k) => (
              <li key={k}><Link href={href({ kind: KIND_TO_PARAM[k], page: 1 })} aria-current={kind === k ? "page" : undefined} className={chip(kind === k)}>{KIND_PLURAL[k]} <span className={kind === k ? "text-white/70" : "text-slate-400"}>{kc.get(k)}</span></Link></li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={(type ? 1 : 0) + (city ? 1 : 0) + (kind ? 1 : 0)}>
              <form action="/gives/organizations/" className="space-y-4">
                {q && <input type="hidden" name="q" value={q} />}
                <div>
                  <label htmlFor="f-kind" className="label">Kind</label>
                  <select id="f-kind" name="kind" defaultValue={kind ? KIND_TO_PARAM[kind] : ""} className="input">
                    <option value="">All kinds</option>
                    {ORG_KINDS.map((k) => <option key={k} value={KIND_TO_PARAM[k]}>{KIND_PLURAL[k]}</option>)}
                  </select>
                </div>
                {types.length > 0 && (
                  <div>
                    <label htmlFor="f-type" className="label">Cause or type</label>
                    <select id="f-type" name="type" defaultValue={type} className="input">
                      <option value="">All causes</option>
                      {types.map((t) => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
                    </select>
                  </div>
                )}
                {cities.length > 0 && (
                  <div>
                    <label htmlFor="f-city" className="label">Town</label>
                    <select id="f-city" name="city" defaultValue={city} className="input">
                      <option value="">All of Tuscarawas County</option>
                      {cities.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
                    </select>
                  </div>
                )}
                <button className="btn-primary w-full">Apply filters</button>
                {(kind || type || city || q) && <Link href="/gives/organizations/" className="btn-ghost w-full">Clear all</Link>}
              </form>
            </FilterPanel>
          </aside>

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <p aria-live="polite"><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "organization" : "organizations"}{q && <> matching &ldquo;{q}&rdquo;</>}</p>
              {q && <Link href={href({ q: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">“{q}” <X className="h-3 w-3" aria-label="Remove search" /></Link>}
              {type && <Link href={href({ type: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{type} <X className="h-3 w-3" aria-label="Remove cause filter" /></Link>}
              {city && <Link href={href({ city: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{city} <X className="h-3 w-3" aria-label="Remove town filter" /></Link>}
            </div>
            {orgs.length ? (
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {orgs.map((o) => <li key={o.id} className="flex"><div className="w-full"><OrgCard o={o} /></div></li>)}
              </ul>
            ) : totalAll === 0 ? (
              <EmptyState icon={HeartHandshake} title="Organizations are joining now">
                Run a nonprofit, church or community group? <Link href="/gives/register/" className="font-semibold text-brand-700">Register for free</Link> — it takes a few minutes.
              </EmptyState>
            ) : (
              <EmptyState icon={HeartHandshake} title="No organizations match those filters">
                Try a different search or <Link href="/gives/organizations/" className="font-semibold text-brand-700">see all organizations</Link>.
              </EmptyState>
            )}
            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
          </div>
        </div>
      </div>
    </>
  );
}

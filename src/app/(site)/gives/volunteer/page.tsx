import type { Metadata } from "next";
import Link from "next/link";
import { UsersRound, X } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { KIND_PARAM, KIND_PLURAL, KIND_TO_PARAM, ORG_KINDS } from "@/lib/gives/constants";
import { activeSignupCounts, openOpportunityWhere, opportunityCardSelect, spotsLeft } from "@/lib/gives/queries";
import { OpportunityCard } from "@/components/gives/cards";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { FilterPanel } from "@/components/public/filter-panel";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;
const WHEN = { week: "This week", month: "Next 30 days", ongoing: "Ongoing" } as const;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  return buildMetadata({
    title: "Volunteer Opportunities in Tuscarawas County",
    description: "Find ways to volunteer with local nonprofits, churches and community groups across Tuscarawas County, Ohio. Sign up in a minute.",
    path: "/gives/volunteer/",
    noindex: ["q", "when", "kind", "city", "youth"].some((k) => !!param(sp, k)) || pageParam(sp) > 1,
  });
}

export default async function VolunteerList({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100);
  const when = (param(sp, "when") in WHEN ? param(sp, "when") : "") as keyof typeof WHEN | "";
  const kind = KIND_PARAM[param(sp, "kind")] ?? null;
  const cityParam = param(sp, "city").slice(0, 80);
  const youth = param(sp, "youth") === "1";
  const page = pageParam(sp);
  const now = new Date();

  const cityRows = await db.volunteerOpportunity.findMany({ where: openOpportunityWhere(), select: { city: true, organization: { select: { city: true } } }, take: 2000 });
  const cities = [...new Set(cityRows.map((r) => (r.city || r.organization.city)?.trim()).filter((c): c is string => !!c))].sort();
  const city = cities.find((c) => c.toLowerCase() === cityParam.toLowerCase()) ?? cityParam;

  const and: Prisma.VolunteerOpportunityWhereInput[] = [];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ title: c }, { description: c }, { organization: { name: c } }, { locationName: c }] });
  }
  if (when === "week") and.push({ OR: [{ isOngoing: true }, { startAt: { lte: new Date(now.getTime() + 7 * 86400_000) } }] }, { NOT: { startAt: null, isOngoing: false } });
  if (when === "month") and.push({ OR: [{ isOngoing: true }, { startAt: { lte: new Date(now.getTime() + 30 * 86400_000) } }] });
  if (when === "ongoing") and.push({ isOngoing: true });
  if (kind) and.push({ organization: { kind } });
  if (city) and.push({ OR: [{ city: { equals: city, mode: "insensitive" } }, { city: null, organization: { city: { equals: city, mode: "insensitive" } } }] });
  if (youth) and.push({ OR: [{ minAge: null }, { minAge: { lt: 18 } }] });
  const where = openOpportunityWhere(and.length ? { AND: and } : {});
  const [total, opps] = await Promise.all([
    db.volunteerOpportunity.count({ where }),
    db.volunteerOpportunity.findMany({ where, select: opportunityCardSelect, orderBy: [{ isOngoing: "asc" }, { startAt: { sort: "asc", nulls: "last" } }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  const counts = await activeSignupCounts(opps.map((o) => o.id));
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (o: { q?: string | null; when?: string | null; kind?: string | null; city?: string | null; youth?: string | null; page?: number }) =>
    `/gives/volunteer/${qs({
      q: o.q === undefined ? q : o.q,
      when: o.when === undefined ? when : o.when,
      kind: o.kind === undefined ? (kind ? KIND_TO_PARAM[kind] : undefined) : o.kind,
      city: o.city === undefined ? city : o.city,
      youth: o.youth === undefined ? (youth ? "1" : undefined) : o.youth,
      page: o.page && o.page > 1 ? o.page : undefined,
    })}`;
  const chip = (active: boolean) => cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50");

  return (
    <>
      <PageHeader eyebrow="T-County Gives" title="Volunteer opportunities" subtitle="Give an hour, an afternoon or a regular shift. Local organizations need you." crumbs={[{ label: "T-County Gives", href: "/gives/" }, { label: "Volunteer" }]} />
      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/gives/volunteer/" defaultValue={q} placeholder="Search opportunities or organizations…" label="Search volunteer opportunities" hidden={{ when, kind: kind ? KIND_TO_PARAM[kind] : undefined, city, youth: youth ? "1" : undefined }} id="vol-q" />
        <nav aria-label="When" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li><Link href={href({ when: null, page: 1 })} className={chip(!when)} aria-current={!when ? "page" : undefined}>Anytime</Link></li>
            {(Object.keys(WHEN) as (keyof typeof WHEN)[]).map((w) => <li key={w}><Link href={href({ when: w, page: 1 })} className={chip(when === w)} aria-current={when === w ? "page" : undefined}>{WHEN[w]}</Link></li>)}
          </ul>
        </nav>
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={[when, kind, city, youth ? "1" : ""].filter(Boolean).length}>
              <form action="/gives/volunteer/" className="space-y-4">
                {q && <input type="hidden" name="q" value={q} />}
                <div>
                  <label htmlFor="f-when" className="label">When</label>
                  <select id="f-when" name="when" defaultValue={when} className="input">
                    <option value="">Anytime</option>
                    {(Object.keys(WHEN) as (keyof typeof WHEN)[]).map((w) => <option key={w} value={w}>{WHEN[w]}</option>)}
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
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="youth" value="1" defaultChecked={youth} className="h-5 w-5 rounded border-slate-300 accent-brand-600" />
                  <span className="text-sm font-medium text-slate-800">Open to volunteers under 18</span>
                </label>
                <button className="btn-primary w-full">Apply filters</button>
                {(when || kind || city || youth || q) && <Link href="/gives/volunteer/" className="btn-ghost w-full">Clear all</Link>}
              </form>
            </FilterPanel>
          </aside>
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <p aria-live="polite"><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "opportunity" : "opportunities"}</p>
              {q && <Link href={href({ q: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">“{q}” <X className="h-3 w-3" aria-label="Remove search" /></Link>}
              {kind && <Link href={href({ kind: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{KIND_PLURAL[kind]} <X className="h-3 w-3" aria-label="Remove organization filter" /></Link>}
              {city && <Link href={href({ city: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{city} <X className="h-3 w-3" aria-label="Remove town filter" /></Link>}
              {youth && <Link href={href({ youth: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">Under 18 OK <X className="h-3 w-3" aria-label="Remove age filter" /></Link>}
            </div>
            {opps.length ? (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {opps.map((o) => <li key={o.id} className="flex"><div className="w-full"><OpportunityCard o={o} left={spotsLeft(o.spots, counts.get(o.id) ?? 0)} /></div></li>)}
              </ul>
            ) : (
              <EmptyState icon={UsersRound} title={total === 0 && !and.length ? "No volunteer opportunities posted yet" : "No opportunities match those filters"}>
                {and.length ? <Link href="/gives/volunteer/" className="font-semibold text-brand-700">See all opportunities</Link> : <>Organizations post shifts and projects here. Run one? <Link href="/gives/register/" className="font-semibold text-brand-700">Register for free</Link>.</>}
              </EmptyState>
            )}
            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
          </div>
        </div>
      </div>
    </>
  );
}

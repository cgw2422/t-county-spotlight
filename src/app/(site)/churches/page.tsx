import type { Metadata } from "next";
import Link from "next/link";
import { Church, Plus, X } from "lucide-react";
import { db } from "@/lib/db";
import { SERVICE_DAYS, SERVICE_DAY_NAMES, readServiceTimes } from "@/lib/gives/constants";
import { orgCardSelect, publicOrgWhere } from "@/lib/gives/queries";
import { ChurchCard } from "@/components/gives/cards";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { FilterPanel } from "@/components/public/filter-panel";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";

export const dynamic = "force-dynamic";
const PER_PAGE = 24;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const city = param(sp, "city");
  const denom = param(sp, "denomination");
  return buildMetadata({
    title: `${denom ? `${denom} ` : ""}Churches${city ? ` in ${city}, Ohio` : " in Tuscarawas County, Ohio"}`,
    description: `Find a church${city ? ` in ${city}` : " in Tuscarawas County"}: service times, livestreams, ministries and how to plan your first visit.`,
    path: `/churches/${qs({ city: city || undefined, denomination: denom || undefined })}`,
    noindex: !!param(sp, "q") || !!param(sp, "day") || !!param(sp, "live") || pageParam(sp) > 1,
  });
}

export default async function ChurchesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100).toLowerCase();
  const denomParam = param(sp, "denomination").slice(0, 120);
  const cityParam = param(sp, "city").slice(0, 80);
  const day = (SERVICE_DAYS as readonly string[]).includes(param(sp, "day")) ? param(sp, "day") : "";
  const live = param(sp, "live") === "1";
  const page = pageParam(sp);

  const all = await db.organization.findMany({
    where: publicOrgWhere({ kind: "CHURCH" }),
    select: { ...orgCardSelect, ministries: true, isFeatured: true },
    orderBy: [{ isFeatured: "desc" }, { name: "asc" }],
    take: 1000,
  });
  const denoms = [...new Set(all.map((c) => c.denomination?.trim()).filter((d): d is string => !!d))].sort();
  const cities = [...new Set(all.map((c) => c.city?.trim()).filter((d): d is string => !!d))].sort();
  const denomination = denoms.find((d) => d.toLowerCase() === denomParam.toLowerCase()) ?? denomParam;
  const city = cities.find((c) => c.toLowerCase() === cityParam.toLowerCase()) ?? cityParam;

  const filtered = all.filter((c) => {
    if (q && ![c.name, c.denomination, c.city, c.tagline, ...c.ministries].some((v) => v?.toLowerCase().includes(q))) return false;
    if (denomination && c.denomination?.toLowerCase() !== denomination.toLowerCase()) return false;
    if (city && c.city?.toLowerCase() !== city.toLowerCase()) return false;
    if (live && !c.livestreamUrl) return false;
    if (day && !readServiceTimes(c.serviceTimes).some((t) => t.day === day)) return false;
    return true;
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const href = (o: { q?: string | null; denomination?: string | null; city?: string | null; day?: string | null; live?: string | null; page?: number }) =>
    `/churches/${qs({
      q: o.q === undefined ? param(sp, "q") : o.q,
      denomination: o.denomination === undefined ? denomination : o.denomination,
      city: o.city === undefined ? city : o.city,
      day: o.day === undefined ? day : o.day,
      live: o.live === undefined ? (live ? "1" : undefined) : o.live,
      page: o.page && o.page > 1 ? o.page : undefined,
    })}`;
  const active = [denomination, city, day, live ? "1" : ""].filter(Boolean).length;

  return (
    <>
      <PageHeader
        eyebrow="Faith in T-County"
        title={city ? `Churches in ${city}` : "Find a church"}
        subtitle="Congregations across Tuscarawas County — service times, livestreams, ministries and a warm welcome."
        crumbs={[{ label: "Churches" }]}
      >
        <Link href="/gives/register/?kind=church" className="btn-accent"><Plus className="h-4 w-4" aria-hidden /> Add your church — free</Link>
      </PageHeader>

      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/churches/" defaultValue={param(sp, "q")} placeholder="Search by name, denomination, town or ministry…" label="Search churches" hidden={{ denomination, city, day, live: live ? "1" : undefined }} id="church-q" />

        <nav aria-label="Service day" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex gap-2 pb-1 sm:flex-wrap">
            <li><Link href={href({ day: null, page: 1 })} className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1 ${!day ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`} aria-current={!day ? "page" : undefined}>Any day</Link></li>
            {SERVICE_DAYS.map((d) => (
              <li key={d}><Link href={href({ day: d, page: 1 })} aria-current={day === d ? "page" : undefined} className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1 ${day === d ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}>{SERVICE_DAY_NAMES[d]}</Link></li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <aside aria-label="Filters" className="lg:sticky lg:top-24 lg:self-start">
            <FilterPanel activeCount={active}>
              <form action="/churches/" className="space-y-4">
                {param(sp, "q") && <input type="hidden" name="q" value={param(sp, "q")} />}
                {denoms.length > 0 && (
                  <div>
                    <label htmlFor="f-denom" className="label">Denomination</label>
                    <select id="f-denom" name="denomination" defaultValue={denomination} className="input">
                      <option value="">All denominations</option>
                      {denoms.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                )}
                {cities.length > 0 && (
                  <div>
                    <label htmlFor="f-city" className="label">Town</label>
                    <select id="f-city" name="city" defaultValue={city} className="input">
                      <option value="">All of Tuscarawas County</option>
                      {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="f-day" className="label">Has a service on</label>
                  <select id="f-day" name="day" defaultValue={day} className="input">
                    <option value="">Any day</option>
                    {SERVICE_DAYS.map((d) => <option key={d} value={d}>{SERVICE_DAY_NAMES[d]}</option>)}
                  </select>
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="live" value="1" defaultChecked={live} className="h-5 w-5 rounded border-slate-300 accent-brand-600" />
                  <span className="text-sm font-medium text-slate-800">Livestream available</span>
                </label>
                <button className="btn-primary w-full">Apply filters</button>
                {(active > 0 || q) && <Link href="/churches/" className="btn-ghost w-full">Clear all</Link>}
              </form>
            </FilterPanel>
          </aside>

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <p aria-live="polite"><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "church" : "churches"}</p>
              {denomination && <Link href={href({ denomination: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{denomination} <X className="h-3 w-3" aria-label="Remove denomination filter" /></Link>}
              {city && <Link href={href({ city: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{city} <X className="h-3 w-3" aria-label="Remove town filter" /></Link>}
              {day && <Link href={href({ day: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">{SERVICE_DAY_NAMES[day]} <X className="h-3 w-3" aria-label="Remove day filter" /></Link>}
              {live && <Link href={href({ live: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">Livestream <X className="h-3 w-3" aria-label="Remove livestream filter" /></Link>}
            </div>
            {rows.length ? (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((c) => <li key={c.id} className="flex"><div className="w-full"><ChurchCard o={c} /></div></li>)}
              </ul>
            ) : all.length === 0 ? (
              <EmptyState icon={Church} title="Churches are joining now">
                Lead or serve at a church in Tuscarawas County? <Link href="/gives/register/?kind=church" className="font-semibold text-brand-700">Add it for free</Link>.
              </EmptyState>
            ) : (
              <EmptyState icon={Church} title="No churches match those filters">
                Try fewer filters or <Link href="/churches/" className="font-semibold text-brand-700">see all churches</Link>.
              </EmptyState>
            )}
            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
          </div>
        </div>
      </div>
    </>
  );
}

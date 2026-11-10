import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { TUSCARAWAS_CITIES, cn } from "@/lib/utils";
import { PageHeader } from "@/components/public/page-header";
import { FilterPanel } from "@/components/public/filter-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { buildMetadata, param, qs, type SearchParams } from "@/components/public/seo";
import { activeSaleWhere, getUpcomingGarageSales, type SaleView } from "@/lib/garage-sales";
import { GARAGE_SALE_CATEGORIES, GARAGE_SALE_TYPES } from "@/lib/garage-sales-shared";
import { GarageSaleCard } from "@/components/garage-sales/garage-sale-card";

export const dynamic = "force-dynamic";

const VIEWS: { key: SaleView; label: string }[] = [
  { key: "all", label: "All upcoming" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This weekend" },
];

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = ["when", "city", "type", "category"].some((k) => param(sp, k));
  return buildMetadata({
    title: "Garage Sales in Tuscarawas County",
    description: "Find garage, yard, estate and rummage sales happening today, tomorrow and this weekend across Tuscarawas County, Ohio.",
    path: "/garage-sales/",
    noindex: filtered,
  });
}

export default async function GarageSalesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === param(sp, "when"))?.key ?? "all") as SaleView;
  const city = param(sp, "city").slice(0, 80);
  const type = GARAGE_SALE_TYPES.find((t) => t.value === param(sp, "type"))?.value ?? "";
  const category = GARAGE_SALE_CATEGORIES.find((c) => c.key === param(sp, "category"))?.key ?? "";
  const [sales, activeCities] = await Promise.all([
    getUpcomingGarageSales({ view, city: city || undefined, type: type || undefined, category: category || undefined }),
    db.garageSale.findMany({ where: activeSaleWhere(), distinct: ["city"], select: { city: true } }),
  ]);
  const cities = [...new Set([...activeCities.map((c) => c.city).filter((c): c is string => !!c), ...TUSCARAWAS_CITIES])].sort();
  const base = { city, type, category };
  const activeCount = [city, type, category].filter(Boolean).length;
  const viewLabel = VIEWS.find((v) => v.key === view)!.label;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Garage Sales"
        subtitle="Garage, yard, estate and rummage sales around Tuscarawas County. Sales drop off automatically after their last day."
        crumbs={[{ label: "Garage Sales" }]}
      >
        <Link href="/garage-sales/submit/" className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> List your sale</Link>
      </PageHeader>
      <div className="container-page py-8">
        <nav aria-label="When" className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/garage-sales/${qs({ ...base, when: v.key === "all" ? "" : v.key })}`} aria-current={v.key === view ? "page" : undefined}
              className={cn("inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ring-1", v.key === view ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside>
            <FilterPanel activeCount={activeCount}>
              <form action="/garage-sales/" method="get" className="space-y-4">
                {view !== "all" && <input type="hidden" name="when" value={view} />}
                <div>
                  <label htmlFor="f-city" className="label">Community</label>
                  <select id="f-city" name="city" defaultValue={city} className="input">
                    <option value="">All communities</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-type" className="label">Kind of sale</label>
                  <select id="f-type" name="type" defaultValue={type} className="input">
                    <option value="">All kinds</option>
                    {GARAGE_SALE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-category" className="label">Items</label>
                  <select id="f-category" name="category" defaultValue={category} className="input">
                    <option value="">Any items</option>
                    {GARAGE_SALE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1">Apply</button>
                  {activeCount > 0 && <Link href={`/garage-sales/${qs({ when: view === "all" ? "" : view })}`} className="btn-ghost">Clear</Link>}
                </div>
              </form>
            </FilterPanel>
          </aside>
          <section aria-labelledby="gs-results">
            <h2 id="gs-results" className="mb-4 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{sales.length}</span> {sales.length === 1 ? "sale" : "sales"} · {viewLabel}{city ? ` · ${city}` : ""}
            </h2>
            {sales.length ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{sales.map((s) => <GarageSaleCard key={s.id} s={s} />)}</div>
            ) : (
              <EmptyState icon={Tag} title={activeCount || view !== "all" ? "No sales match these filters" : "No garage sales listed yet"}>
                {activeCount || view !== "all" ? <><Link href="/garage-sales/" className="font-semibold text-brand-700">See all upcoming sales</Link> or </> : "Having one? "}
                <Link href="/garage-sales/submit/" className="font-semibold text-brand-700">list your sale for free</Link>.
              </EmptyState>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

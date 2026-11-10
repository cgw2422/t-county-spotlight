import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { cn, formatDate } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import {
  TRUCK_WINDOWS, getPublicStops, groupByDay, lastScheduleUpdates, menuLinks, publicStopWhere, publicTruckWhere, timeRange, truckSelect, type TruckWindow,
} from "@/lib/food-trucks";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { TrackView } from "@/components/public/track";
import { FoodTruckStopCard, TruckLogo } from "@/components/food-trucks/stop-card";
import { buildMetadata, param, qs, type SearchParams } from "@/components/public/seo";

export const dynamic = "force-dynamic";

const WINDOW_TEXT: Record<TruckWindow, string> = { today: "today", tomorrow: "tomorrow", weekend: "this weekend", upcoming: "the coming weeks" };

function readWindow(v: string): TruckWindow {
  return (TRUCK_WINDOWS.find((w) => w.key === v)?.key ?? "today") as TruckWindow;
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = !!(param(sp, "city") || param(sp, "food") || param(sp, "when"));
  return buildMetadata({
    title: "Food Trucks in Tuscarawas County — Where They're Serving",
    description: "Where are the food trucks serving today? Scheduled stops from local food trucks in Dover, New Philadelphia and across Tuscarawas County.",
    path: "/food-trucks/",
    noindex: filtered,
  });
}

export default async function FoodTrucksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const when = readWindow(param(sp, "when"));
  const city = param(sp, "city").slice(0, 80);
  const food = param(sp, "food").slice(0, 60);
  const now = new Date();

  const [stops, trucks, cityRows, upcomingCount] = await Promise.all([
    getPublicStops({ window: when, city: city || undefined, cuisine: food || undefined, now }),
    db.business.findMany({ where: publicTruckWhere(), orderBy: { name: "asc" }, select: truckSelect, take: 200 }),
    db.foodTruckStop.findMany({ where: publicStopWhere({ start: now }), distinct: ["city"], select: { city: true } }),
    when === "upcoming" ? Promise.resolve(-1) : db.foodTruckStop.count({ where: publicStopWhere({ start: now }) }),
  ]);
  const cuisines = [...new Set(trucks.map((t) => t.cuisine?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const cities = [...new Set(cityRows.map((r) => r.city?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
  const [updates, menus, nextStops] = await Promise.all([
    lastScheduleUpdates(trucks),
    menuLinks(trucks),
    db.foodTruckStop.findMany({ where: publicStopWhere({ start: now }), orderBy: { startAt: "asc" }, distinct: ["businessId"], select: { businessId: true, startAt: true, endAt: true, locationName: true, city: true } }),
  ]);
  const nextByTruck = new Map(nextStops.map((s) => [s.businessId, s]));
  const groups = groupByDay(stops, now);
  const href = (o: { when?: TruckWindow; city?: string | null; food?: string | null }) => `/food-trucks/${qs({
    when: (o.when ?? when) === "today" ? undefined : o.when ?? when,
    city: o.city === undefined ? city : o.city,
    food: o.food === undefined ? food : o.food,
  })}`;
  const filtered = !!(city || food);

  return (
    <>
      <TrackView type="view_food_trucks" />
      <PageHeader
        eyebrow="Eat local"
        title="Food Trucks"
        subtitle="Where are the food trucks serving today? Stops are scheduled by the trucks themselves — look for “Confirmed by the truck” on the day."
        crumbs={[{ label: "Food Trucks" }]}
      />
      <div className="container-page py-6 sm:py-8">
        <nav aria-label="When" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <ul className="flex gap-1 rounded-2xl bg-slate-100 p-1 sm:inline-flex" role="list">
            {TRUCK_WINDOWS.map((w) => (
              <li key={w.key} className="flex-1 sm:flex-none">
                <Link href={href({ when: w.key })} aria-current={w.key === when ? "page" : undefined}
                  className={cn("flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl px-4 text-sm font-semibold", w.key === when ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-navy-900")}>
                  {w.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {(cities.length > 0 || cuisines.length > 0) && (
          <form method="get" action="/food-trucks/" className="mt-4 flex flex-wrap items-end gap-3" aria-label="Filter food trucks">
            {when !== "today" && <input type="hidden" name="when" value={when} />}
            <div>
              <label htmlFor="ft-city" className="label">Community</label>
              <select id="ft-city" name="city" defaultValue={city} className="input min-h-11 w-48">
                <option value="">All communities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                {city && !cities.some((c) => c.toLowerCase() === city.toLowerCase()) && <option value={city}>{city}</option>}
              </select>
            </div>
            <div>
              <label htmlFor="ft-food" className="label">Food type</label>
              <select id="ft-food" name="food" defaultValue={food} className="input min-h-11 w-48">
                <option value="">All food</option>
                {cuisines.map((c) => <option key={c} value={c}>{c}</option>)}
                {food && !cuisines.some((c) => c.toLowerCase() === food.toLowerCase()) && <option value={food}>{food}</option>}
              </select>
            </div>
            <button type="submit" className="btn-primary min-h-11">Filter</button>
            {filtered && <Link href={href({ city: null, food: null })} className="btn-ghost min-h-11">Clear filters</Link>}
          </form>
        )}

        <section aria-labelledby="stops-title" className="mt-8">
          <h2 id="stops-title" className="sr-only">Food truck stops {WINDOW_TEXT[when]}</h2>
          {groups.length === 0 ? (
            <EmptyState icon={Truck} title={filtered ? `No food truck stops match those filters for ${WINDOW_TEXT[when]}.` : `No food truck stops scheduled for ${WINDOW_TEXT[when]} yet.`}>
              <span className="block">
                {when !== "upcoming" && (upcomingCount > 0
                  ? <><Link href={href({ when: "upcoming" })} className="font-semibold text-brand-700">See upcoming stops</Link>{filtered && <> or <Link href={href({ city: null, food: null })} className="font-semibold text-brand-700">clear filters</Link></>}.</>
                  : <>No upcoming stops are listed right now. Check back soon.</>)}
                {when === "upcoming" && filtered && <Link href={href({ city: null, food: null })} className="font-semibold text-brand-700">Clear filters</Link>}
              </span>
              <span className="mt-2 block">Run a food truck? <Link href="/list-your-business/" className="font-semibold text-brand-700">Add your schedule</Link> — it&apos;s free.</span>
            </EmptyState>
          ) : (
            <div className="space-y-8">
              {groups.map((g) => (
                <section key={g.key} aria-labelledby={`day-${g.key}`} data-testid="truck-day">
                  <h3 id={`day-${g.key}`} className="font-display text-xl font-bold text-navy-900">{g.label}</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((s) => <FoodTruckStopCard key={s.id} stop={s} now={now} extras={{ menu: menus.get(s.business.id), updatedAt: updates.get(s.business.id) }} />)}
                  </div>
                </section>
              ))}
            </div>
          )}
          <p className="mt-6 text-xs text-slate-500">Times are Eastern Time. Schedules can change because of weather or sell-outs — check the truck&apos;s page or social media before heading out.</p>
        </section>

        <section aria-labelledby="all-trucks" className="mt-12 border-t border-slate-200 pt-10" id="all-trucks-section">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="all-trucks" className="section-title">All food trucks</h2>
              <p className="mt-1 text-slate-600">Local trucks with a T County Connect profile.</p>
            </div>
            <Link href="/list-your-business/" className="text-sm font-semibold text-brand-700 hover:underline">Run a food truck? Add your schedule →</Link>
          </div>
          {trucks.length === 0 ? (
            <div className="mt-4"><EmptyState icon={Truck} title="No food trucks have profiles yet">Run a food truck in Tuscarawas County? <Link href="/list-your-business/" className="font-semibold text-brand-700">Add your free listing</Link> or claim your existing one.</EmptyState></div>
          ) : (
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="all-trucks">
              {trucks.map((t) => {
                const next = nextByTruck.get(t.id);
                return (
                  <li key={t.id}>
                    <Link href={businessHref(t)} className="card card-hover flex h-full items-start gap-3 p-4">
                      <TruckLogo truck={t} size="sm" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-navy-900">{t.name}</span>
                        {(t.cuisine || t.city) && <span className="block text-sm text-slate-600">{[t.cuisine, t.city].filter(Boolean).join(" · ")}</span>}
                        <span className="mt-1 block text-xs text-slate-500">
                          {next
                            ? <>Next: {formatDate(next.startAt, { weekday: "short", month: "short", day: "numeric" })} · {timeRange(next.startAt, next.endAt)} · {next.locationName}{next.city ? `, ${next.city}` : ""}</>
                            : "No upcoming stops listed"}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

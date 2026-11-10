import Link from "next/link";
import { ExternalLink, Navigation, UtensilsCrossed } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { directionsHref, groupByDay, lastScheduleUpdates, publicStopWhere, safeHttpUrl, stopLabel } from "@/lib/food-trucks";
import { TrackedLink } from "@/components/public/track";
import { StopBadge } from "./stop-card";

/** "Upcoming stops" on a food truck's public profile. */
export async function FoodTruckSchedule({ truck, showMenuSection }: { truck: { id: string; name: string; menuUrl: string | null; updatedAt: Date }; showMenuSection?: boolean }) {
  const now = new Date();
  const [stops, last] = await Promise.all([
    db.foodTruckStop.findMany({
      where: publicStopWhere({ start: now, businessId: truck.id }),
      orderBy: [{ startAt: "asc" }, { id: "asc" }], take: 10,
      select: { id: true, startAt: true, endAt: true, locationName: true, address: true, city: true, notes: true, confirmedAt: true },
    }),
    lastScheduleUpdates([truck]),
  ]);
  const menu = safeHttpUrl(truck.menuUrl);
  const updated = last.get(truck.id);
  const track = { type: "click_food_truck_directions", businessId: truck.id, targetType: "BUSINESS", targetId: truck.id };
  return (
    <section aria-labelledby="truck-stops-title" data-testid="truck-upcoming-stops">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="truck-stops-title" className="section-title">Upcoming stops</h2>
        <div className="flex flex-wrap gap-2">
          {menu && <a href={menu} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><UtensilsCrossed className="h-4 w-4" aria-hidden /> Menu <ExternalLink className="h-3 w-3" aria-hidden /></a>}
          {!menu && showMenuSection && <a href="#offerings-menu" className="btn-secondary btn-sm"><UtensilsCrossed className="h-4 w-4" aria-hidden /> Menu</a>}
        </div>
      </div>
      {stops.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-4 text-slate-600 ring-1 ring-slate-200">No upcoming stops are listed right now. <Link href="/food-trucks/" className="font-semibold text-brand-700">See where other trucks are serving</Link>.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {groupByDay(stops, now).map((g) => (
            <div key={g.key}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{g.label}</h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
                {g.items.map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy-900">{stopLabel(s, now)}</p>
                      <p className="text-sm text-slate-700">{s.locationName}{(s.address || s.city) && <span className="text-slate-500"> · {[s.address, s.city].filter(Boolean).join(", ")}</span>}</p>
                      {s.notes && <p className="mt-0.5 text-sm text-slate-600">{s.notes}</p>}
                      <div className="mt-1.5"><StopBadge stop={s} now={now} /></div>
                    </div>
                    <TrackedLink href={directionsHref(s)} target="_blank" rel="noopener noreferrer" track={track} className="btn-secondary btn-sm shrink-0"><Navigation className="h-4 w-4" aria-hidden /> Directions</TrackedLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {updated && <p className="mt-2 text-xs text-slate-500">Schedule updated {formatDate(updated, { month: "short", day: "numeric", year: "numeric" })}. Times are Eastern Time and can change — the truck confirms stops on the day.</p>}
    </section>
  );
}

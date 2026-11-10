import { SectionHeader } from "@/components/home/section-header";
import { getPublicStops } from "@/lib/food-trucks";
import { FoodTruckStopCard } from "./stop-card";
import { CommunityGroups } from "@/components/my-t-county/community-groups";
import { splitByCommunity } from "@/lib/my-t-county-shared";

/**
 * Homepage "Food Trucks Near You": today's stops, else the next scheduled stops
 * (clearly labeled). Renders nothing when no truck has an upcoming stop.
 */
export async function FoodTrucksHomeSection({ title, subtitle, limit, community = null }: { title: string; subtitle?: string | null; limit: number; community?: string | null }) {
  const take = Math.min(Math.max(limit || 4, 1), 12);
  const now = new Date();
  // With a chosen community, fetch the whole window so its stops can come first.
  const fetchTake = community ? 200 : take;
  let stops = await getPublicStops({ window: "today", limit: fetchTake, now });
  const today = stops.length > 0;
  if (!today) stops = await getPublicStops({ window: "upcoming", limit: fetchTake, now });
  if (!stops.length) return null;
  const groups = community ? splitByCommunity(stops, (s) => s.city, community, take) : null;
  return (
    <section className="container-page py-12" data-testid="home-food-trucks">
      <SectionHeader title={title || "Food Trucks Near You"} subtitle={subtitle} href="/food-trucks/" linkLabel="See all food trucks" />
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500" data-testid="home-food-trucks-label">
        {today ? "Scheduled today" : "No stops scheduled today · Next scheduled stops"}
      </h3>
      {groups && community ? (
        <CommunityGroups community={community} local={groups.local} rest={groups.rest} testId="home-food-trucks-groups"
          gridClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" nothingLocal={`No food truck stops listed in ${community} ${today ? "today" : "yet"}.`}
          render={(s) => <FoodTruckStopCard key={s.id} stop={s} compact now={now} />} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stops.map((s) => <FoodTruckStopCard key={s.id} stop={s} compact now={now} />)}
        </div>
      )}
    </section>
  );
}

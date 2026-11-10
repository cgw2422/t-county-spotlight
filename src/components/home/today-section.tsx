import Link from "next/link";
import { ChevronRight, Moon } from "lucide-react";
import { todayWindow, tonightWindow } from "@/lib/events";
import { getUpcomingOccurrences } from "@/lib/queries";
import { EventCard } from "@/components/cards/event-card";
import { CommunityGroups } from "@/components/my-t-county/community-groups";
import { splitByCommunity } from "@/lib/my-t-county-shared";

/**
 * Homepage "What's Happening Today": events still to come (or in progress)
 * today and tonight, in America/New_York. Renders nothing when there are none.
 */
export async function TodaySection({ title, subtitle, limit, featuredIds, community = null }: { title?: string | null; subtitle?: string | null; limit: number; featuredIds: string[]; community?: string | null }) {
  const now = new Date();
  const today = todayWindow(now);
  const tonight = tonightWindow(now);
  const to = tonight.end > today.end ? tonight.end : today.end;
  const take = Math.max(1, limit || 4);
  // With a chosen community: its events first, countywide events still shown (sort, not filter).
  const items = await getUpcomingOccurrences({ from: now, to, limit: community ? undefined : take, featuredIds });
  if (!items.length) return null;
  const groups = community ? splitByCommunity(items, (e) => e.city, community, take) : null;
  return (
    <section className="container-page py-10" aria-labelledby="home-today">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h2 id="home-today" className="section-title">{title || "What’s Happening Today"}</h2>
          {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Link href="/events/?when=tonight" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-navy-800 hover:bg-slate-100"><Moon className="h-4 w-4" aria-hidden /> Tonight</Link>
          <Link href="/events/?when=today" className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-brand-700 hover:text-brand-600">See all today <ChevronRight className="h-4 w-4" aria-hidden /></Link>
        </div>
      </div>
      {groups && community ? (
        <CommunityGroups community={community} local={groups.local} rest={groups.rest} testId="home-today-groups"
          gridClassName="grid grid-cols-1 gap-3 lg:grid-cols-2" nothingLocal={`No ${community} events listed for the rest of today.`}
          render={(e) => <EventCard key={e.id} e={e} layout="row" />} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map((e) => <EventCard key={e.id} e={e} layout="row" />)}
        </div>
      )}
    </section>
  );
}

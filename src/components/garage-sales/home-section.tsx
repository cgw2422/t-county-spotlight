import Link from "next/link";
import { Plus } from "lucide-react";
import { addDaysKey, endOfNyDay } from "@/components/public/dates";
import { getUpcomingGarageSales, todayKey } from "@/lib/garage-sales";
import { SectionHeader } from "@/components/home/section-header";
import { GarageSaleCard } from "./garage-sale-card";
import { CommunityGroups } from "@/components/my-t-county/community-groups";
import { splitByCommunity } from "@/lib/my-t-county-shared";

/**
 * Homepage "Garage Sales": garage sales running in the next 7 days (America/New_York).
 * The homepage renders it only when getHomeAvailability finds a sale for the visitor's scope;
 * it also renders nothing on its own when the list is empty. Community markets are regular
 * events and appear in Upcoming Events instead (no separate markets list here).
 */
export async function GarageSalesHomeSection({ title, subtitle, limit, community = null }: { title: string; subtitle?: string | null; limit: number; community?: string | null }) {
  const now = new Date();
  const weekEnd = endOfNyDay(addDaysKey(todayKey(now), 6));
  const sales = (await getUpcomingGarageSales({ now, limit: 200 })).filter((s) => s.startDate <= weekEnd).slice(0, community ? undefined : limit || 4);
  if (!sales.length) return null;
  // With a chosen community: its sales first, countywide sales still shown.
  const groups = community ? splitByCommunity(sales, (s) => s.city, community, limit || 4) : null;
  return (
    <section className="container-page py-12" aria-labelledby="home-garage-sales" data-testid="home-garage-sales">
      <div id="home-garage-sales"><SectionHeader title={title || "Garage Sales"} subtitle={subtitle} href="/garage-sales/" linkLabel="All garage sales" /></div>
      {groups && community ? (
        <CommunityGroups community={community} local={groups.local} rest={groups.rest} testId="home-garage-sales-groups"
          gridClassName="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" nothingLocal={`No garage sales listed in ${community} this week yet.`}
          render={(s) => <GarageSaleCard key={s.id} s={s} compact />} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{sales.map((s) => <GarageSaleCard key={s.id} s={s} compact />)}</div>
      )}
      <p className="mt-6"><Link href="/garage-sales/submit/" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><Plus className="h-4 w-4" aria-hidden /> List your garage sale</Link></p>
    </section>
  );
}

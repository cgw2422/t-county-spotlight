import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { getUpcomingOccurrences } from "@/lib/queries";
import { addDaysKey, endOfNyDay } from "@/components/public/dates";
import { getUpcomingGarageSales, todayKey } from "@/lib/garage-sales";
import { SectionHeader } from "@/components/home/section-header";
import { EventCard } from "@/components/cards/event-card";
import { GarageSaleCard } from "./garage-sale-card";

/**
 * Homepage "Garage Sales & Community Markets": garage sales running in the
 * next 7 days, plus upcoming market events (category "markets" or tag
 * "market") as a small secondary list. Renders nothing when both are empty.
 */
export async function GarageSalesHomeSection({ title, subtitle, limit }: { title: string; subtitle?: string | null; limit: number }) {
  const now = new Date();
  const weekEnd = endOfNyDay(addDaysKey(todayKey(now), 6));
  const [sales, markets] = await Promise.all([
    getUpcomingGarageSales({ now, limit: 200 }).then((all) => all.filter((s) => s.startDate <= weekEnd).slice(0, limit || 4)),
    getUpcomingOccurrences({ from: now, to: weekEnd, limit: 3, where: { OR: [{ category: { slug: "markets" } }, { tags: { has: "market" } }] } }),
  ]);
  if (!sales.length && !markets.length) return null;
  return (
    <section className="container-page py-12" aria-labelledby="home-garage-sales">
      <div id="home-garage-sales"><SectionHeader title={title || "Garage Sales & Community Markets"} subtitle={subtitle} href="/garage-sales/" linkLabel="All garage sales" /></div>
      {sales.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{sales.map((s) => <GarageSaleCard key={s.id} s={s} compact />)}</div>
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">No garage sales listed for this week yet. <Link href="/garage-sales/submit/" className="font-semibold text-brand-700">List yours for free</Link>.</p>
      )}
      {markets.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-4">
            <h3 className="font-display text-lg font-semibold text-navy-900">Community markets this week</h3>
            <Link href="/events/?category=markets" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">All markets <ChevronRight className="h-4 w-4" aria-hidden /></Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">{markets.map((e) => <EventCard key={e.id} e={e} layout="row" />)}</div>
        </div>
      )}
      <p className="mt-6"><Link href="/garage-sales/submit/" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><Plus className="h-4 w-4" aria-hidden /> List your garage sale</Link></p>
    </section>
  );
}

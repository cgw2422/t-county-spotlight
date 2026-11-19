import Link from "next/link";
import { CalendarDays, ChevronRight, Plus, Sun } from "lucide-react";
import { EventCard } from "@/components/cards/event-card";
import { CommunityGroups } from "@/components/my-t-county/community-groups";
import type { UpcomingEvent } from "@/lib/home-feed";

/**
 * Homepage "Upcoming Events" (HomepageSection type "weekend" — the key is kept so the admin's
 * position/toggle carry over). Next 3–4 events by their next occurrence; with a chosen community,
 * that community's events first and countywide events filling in under "Around T County".
 */
export function UpcomingEventsSection({ title, subtitle, community, local, rest, items, hasEarlier, sponsor }: {
  title: string;
  subtitle?: string | null;
  community: string | null;
  items: UpcomingEvent[];
  local: UpcomingEvent[] | null;
  rest: UpcomingEvent[] | null;
  /** Some upcoming events are already shown higher on the page (e.g. Today). */
  hasEarlier?: boolean;
  sponsor?: React.ReactNode;
}) {
  const city = community ? `&city=${encodeURIComponent(community)}` : "";
  const chip = "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-semibold text-navy-800 hover:border-brand-300 hover:bg-slate-50";
  const grid = "grid gap-5 sm:grid-cols-2 lg:grid-cols-4";
  return (
    <section className="container-page py-10" aria-labelledby="home-upcoming-events" data-testid="home-upcoming-events">
      <div className="mb-5">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <span aria-hidden className="season-only"><span className="mb-2 block h-1 w-10 rounded-full bg-[var(--season-border)]" /></span>
            <h2 id="home-upcoming-events" className="section-title">{title}</h2>
            {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
          </div>
          <Link href="/events/" className="-my-2 flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600" data-testid="home-upcoming-all">
            View All Events <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="home-upcoming-chips">
          <Link href={`/events/?when=today${city}`} className={chip}><Sun className="h-4 w-4 text-sunset-600" aria-hidden /> Today</Link>
          <Link href={`/events/?when=weekend${city}`} className={chip}><CalendarDays className="h-4 w-4 text-hillside-700" aria-hidden /> This Weekend</Link>
        </div>
      </div>
      {sponsor}
      {!items.length ? (
        <p className="flex flex-wrap items-center gap-x-3 rounded-xl bg-slate-50 px-4 py-1 text-sm text-slate-600" data-testid="home-upcoming-empty">
          {hasEarlier ? "No other upcoming events are listed yet." : "No upcoming events are listed yet."}
          <Link href="/events/submit/" className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 hover:underline"><Plus className="h-4 w-4" aria-hidden /> Submit an Event</Link>
        </p>
      ) : community && local && rest ? (
        <CommunityGroups community={community} local={local} rest={rest} testId="home-upcoming-groups" gridClassName={grid}
          nothingLocal={`No upcoming ${community} events are listed yet.`} render={(e) => <EventCard key={e.id} e={e} />} />
      ) : (
        <div className={grid}>{items.map((e) => <EventCard key={e.id} e={e} />)}</div>
      )}
    </section>
  );
}

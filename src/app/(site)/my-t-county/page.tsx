import type { Metadata } from "next";
import Link from "next/link";
import { Bell, Bookmark, ChevronRight, LogIn, Sparkles, UserRound } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { todayWindow, tonightWindow, weekendWindow } from "@/lib/events";
import { getArticlesForSection, getUpcomingOccurrences } from "@/lib/queries";
import { getPublicStops } from "@/lib/food-trucks";
import { getUpcomingGarageSales, todayKey } from "@/lib/garage-sales";
import { addDaysKey, endOfNyDay } from "@/components/public/dates";
import { activeSignupCounts, openOpportunityWhere, opportunityCardSelect, spotsLeft } from "@/lib/gives/queries";
import {
  ALL_COUNTY_LABEL, getCommunityPreference, getPicks, getRecentlyAddedBusinesses, getSpecialsWithCity, interestByKey, prioritizeByCommunity, sameCity,
} from "@/lib/my-t-county";
import { CommunityBar } from "@/components/my-t-county/community-bar";
import { PreferencesForm } from "@/components/my-t-county/preferences-form";
import { GuestPicks } from "@/components/my-t-county/guest-picks";
import { GuestPrefsMerge } from "@/components/my-t-county/guest-prefs-merge";
import { PickList } from "@/components/my-t-county/pick-list";
import { MySavedPanel } from "@/components/my-t-county/my-saved-panel";
import { TrackView } from "@/components/public/track";
import { EventCard } from "@/components/cards/event-card";
import { BusinessCard } from "@/components/cards/business-card";
import { SpecialCard } from "@/components/cards/special-card";
import { ArticleCard } from "@/components/cards/article-card";
import { FoodTruckStopCard } from "@/components/food-trucks/stop-card";
import { GarageSaleCard } from "@/components/garage-sales/garage-sale-card";
import { OpportunityCard } from "@/components/gives/cards";
import { communityHref } from "@/lib/communities-shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My T County",
  description: "Your corner of Tuscarawas County: events, food trucks, garage sales, specials and community updates.",
  robots: { index: false, follow: true },
};

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter((e): e is [string, string] => !!e[1]));
  const s = p.toString();
  return s ? `?${s}` : "";
};

/** One "Around My Community" panel. Hidden entirely when `hideWhenEmpty` and empty. */
function Panel({ id, title, href, linkLabel, count, localCount, community, empty, children }: {
  id: string; title: string; href: string; linkLabel?: string; count: number; localCount?: number; community: string | null; empty: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`mtc-${id}`} data-testid={`panel-${id}`} className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`mtc-${id}`} className="font-display text-xl font-semibold text-navy-900">{title}</h2>
          {community && count > 0 && (
            <p className="text-sm text-slate-500" data-testid={`panel-${id}-note`}>
              {localCount ? `${community} first, then around T County` : `Nothing in ${community} right now · around T County`}
            </p>
          )}
        </div>
        <Link href={href} className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">{linkLabel ?? "See all"} <ChevronRight className="h-4 w-4" aria-hidden /></Link>
      </div>
      {count > 0 ? children : <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{empty}</p>}
    </section>
  );
}

export default async function MyTCountyPage() {
  const [pref, user] = await Promise.all([getCommunityPreference(), getCurrentUser()]);
  const c = pref.active;
  const order = [c, ...pref.extraCommunities];
  const prio = <T,>(items: T[], cityOf: (x: T) => string | null | undefined, n: number) => prioritizeByCommunity(items, cityOf, order).slice(0, n);
  const local = <T,>(items: T[], cityOf: (x: T) => string | null | undefined) => (c ? items.filter((x) => sameCity(cityOf(x), c)).length : 0);

  const now = new Date();
  const today = todayWindow(now);
  const tonight = tonightWindow(now);
  const wk = weekendWindow(now);
  const weekEnd = endOfNyDay(addDaysKey(todayKey(now), 6));

  const [todayEvents, weekendEvents, truckToday, recentBiz, specials, updates, opps, picks] = await Promise.all([
    getUpcomingOccurrences({ from: now, to: tonight.end > today.end ? tonight.end : today.end }),
    getUpcomingOccurrences({ from: wk.start, to: wk.end }),
    getPublicStops({ window: "today", now }),
    getRecentlyAddedBusinesses(c, 4),
    getSpecialsWithCity(60),
    getArticlesForSection({ kind: "ANNOUNCEMENT" }, [], 4),
    db.volunteerOpportunity.findMany({ where: openOpportunityWhere({}, now), select: opportunityCardSelect, orderBy: [{ isOngoing: "asc" }, { startAt: { sort: "asc", nulls: "last" } }], take: 40 }),
    user && pref.interests.length ? getPicks(pref.interests, order) : Promise.resolve([]),
  ]);
  const trucksAreToday = truckToday.length > 0;
  const [truckStops, sales] = await Promise.all([
    trucksAreToday ? truckToday : getPublicStops({ window: "upcoming", limit: 60, now }),
    getUpcomingGarageSales({ now, limit: 200 }).then((all) => all.filter((s) => s.startDate <= weekEnd)),
  ]);
  const oppCity = (o: (typeof opps)[number]) => o.city || o.organization.city;
  const oppList = prio(opps, oppCity, 3);
  const signups = await activeSignupCounts(oppList.map((o) => o.id));

  const cityQ = c ?? undefined;
  const linkLabel = c ? `See all in ${c}` : "See all";
  const quickInterests = pref.interests.map((k) => interestByKey(k)!).filter(Boolean);

  return (
    <div className="pb-12">
      <TrackView type="view_my_t_county" />
      {user && <GuestPrefsMerge userId={user.id} />}

      <header className="bg-gradient-to-b from-brand-50/70 to-white">
        <div className="container-page flex flex-col gap-4 pb-4 pt-8 sm:flex-row sm:items-end sm:justify-between sm:pt-10">
          <div className="min-w-0">
            <p className="eyebrow">Your corner of Tuscarawas County</p>
            <h1 className="font-display text-3xl font-semibold text-navy-900 sm:text-4xl">My T County</h1>
            <p className="mt-1 text-slate-600">{c ? `What’s happening in ${c}, with the rest of the county close by.` : `What’s happening across ${ALL_COUNTY_LABEL}.`}</p>
            {pref.community && communityHref(pref.community) && (
              <Link href={communityHref(pref.community)!} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline" data-testid="mtc-community-page-link">
                Visit the {pref.community} page <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {user ? (
              <Link href="/account/" className="btn-secondary btn-sm min-h-11" data-testid="mtc-account-link"><UserRound className="h-4 w-4" aria-hidden /> Account</Link>
            ) : (
              <>
                <Link href="/login/?next=%2Fmy-t-county%2F" className="btn-secondary btn-sm min-h-11" data-testid="mtc-signin-link"><LogIn className="h-4 w-4" aria-hidden /> Sign in</Link>
              </>
            )}
          </div>
        </div>
        <CommunityBar community={pref.community} active={pref.active} className="pb-6" />
        {!user && (
          <div className="container-page pb-6">
            <p className="text-sm text-slate-600" data-testid="mtc-guest-note">
              Your choices are saved in this browser. <Link href="/register/?next=%2Fmy-t-county%2F" className="font-semibold text-brand-700 hover:underline">Create a free account to sync across devices</Link>.
            </p>
          </div>
        )}
      </header>

      <div className="container-page space-y-12 pt-6">
        <section aria-labelledby="mtc-picks" data-testid="panel-picks">
          <h2 id="mtc-picks" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-navy-900"><Sparkles className="h-5 w-5 text-sunset-500" aria-hidden /> Picked for you</h2>
          {user ? (
            pref.interests.length === 0 ? (
              <p className="text-sm text-slate-600">Choose a few favorite categories under <a href="#my-preferences" className="font-semibold text-brand-700 hover:underline">My Preferences</a> to see suggestions here.</p>
            ) : picks.length ? (
              <PickList picks={picks} />
            ) : (
              <p className="text-sm text-slate-600" data-testid="picks-empty">Nothing matching your interests is listed for the next two weeks yet.</p>
            )
          ) : (
            <GuestPicks community={c} />
          )}
          {quickInterests.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {quickInterests.map((i) => <li key={i.key}><Link href={i.href} className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-navy-900 hover:border-brand-300">{i.label}</Link></li>)}
            </ul>
          )}
        </section>

        <div>
          <h2 className="section-title mb-6">Around {c ?? "T County"}</h2>
          <div className="space-y-10">
            <Panel id="today" title="Today’s events" href={`/events/${qs({ when: "today", city: local(todayEvents, (e) => e.city) ? cityQ : undefined })}`} linkLabel={local(todayEvents, (e) => e.city) ? linkLabel : "See all"}
              count={todayEvents.length} localCount={local(todayEvents, (e) => e.city)} community={c}
              empty={<>No more events listed for today. <Link href="/events/submit/" className="font-semibold text-brand-700">Submit an event</Link>.</>}>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{prio(todayEvents, (e) => e.city, 4).map((e) => <EventCard key={e.id} e={e} layout="row" />)}</div>
            </Panel>

            <Panel id="weekend" title="This weekend" href={`/events/${qs({ when: "weekend", city: local(weekendEvents, (e) => e.city) ? cityQ : undefined })}`} linkLabel={local(weekendEvents, (e) => e.city) ? linkLabel : "See all"}
              count={weekendEvents.length} localCount={local(weekendEvents, (e) => e.city)} community={c}
              empty="No events listed for this weekend yet.">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{prio(weekendEvents, (e) => e.city, 4).map((e) => <EventCard key={e.id} e={e} />)}</div>
            </Panel>

            <Panel id="food-trucks" title={trucksAreToday ? "Food trucks serving today" : "Food trucks: next scheduled stops"}
              href={`/food-trucks/${qs({ city: local(truckStops, (s) => s.city) ? cityQ : undefined })}`} linkLabel={local(truckStops, (s) => s.city) ? linkLabel : "See all"}
              count={truckStops.length} localCount={local(truckStops, (s) => s.city)} community={c}
              empty="No food truck stops are scheduled right now.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{prio(truckStops, (s) => s.city, 4).map((s) => <FoodTruckStopCard key={s.id} stop={s} compact now={now} />)}</div>
            </Panel>

            <Panel id="garage-sales" title="Garage sales this week" href={`/garage-sales/${qs({ city: local(sales, (s) => s.city) ? cityQ : undefined })}`} linkLabel={local(sales, (s) => s.city) ? linkLabel : "See all"}
              count={sales.length} localCount={local(sales, (s) => s.city)} community={c}
              empty={<>No garage sales listed for this week yet. <Link href="/garage-sales/submit/" className="font-semibold text-brand-700">List yours for free</Link>.</>}>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{prio(sales, (s) => s.city, 4).map((s) => <GarageSaleCard key={s.id} s={s} compact />)}</div>
            </Panel>

            {recentBiz.length > 0 && (
              <Panel id="recent-businesses" title="Recently added to T County Connect" href={`/businesses/${qs({ city: local(recentBiz, (b) => b.city) ? cityQ : undefined })}`} linkLabel="Browse businesses"
                count={recentBiz.length} localCount={local(recentBiz, (b) => b.city)} community={c} empty="">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{recentBiz.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
              </Panel>
            )}

            <Panel id="specials" title="Current local specials" href="/specials/" count={specials.length} localCount={local(specials, (p) => p.business.city)} community={c}
              empty="No specials are running right now.">
              <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{prio(specials, (p) => p.business.city, 4).map((p) => <SpecialCard key={p.id} p={p} />)}</div>
            </Panel>

            {updates.length > 0 && (
              <section aria-labelledby="mtc-updates" data-testid="panel-updates">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h2 id="mtc-updates" className="font-display text-xl font-semibold text-navy-900">Community updates</h2>
                  <Link href="/announcements/" className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">See all <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{updates.map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)}</div>
              </section>
            )}

            <Panel id="volunteer" title="Volunteer opportunities" href={`/gives/volunteer/${qs({ city: local(opps, oppCity) ? cityQ : undefined })}`} linkLabel={local(opps, oppCity) ? linkLabel : "See all"}
              count={oppList.length} localCount={local(opps, oppCity)} community={c}
              empty={<>No volunteer opportunities are listed right now. <Link href="/gives/" className="font-semibold text-brand-700">Explore T County Gives</Link>.</>}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{oppList.map((o) => <OpportunityCard key={o.id} o={o} left={spotsLeft(o.spots, signups.get(o.id) ?? 0)} />)}</div>
            </Panel>
          </div>
        </div>

        <section aria-labelledby="mtc-saved" data-testid="panel-saved">
          <h2 id="mtc-saved" className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-navy-900"><Bookmark className="h-5 w-5 text-brand-700" aria-hidden /> My Saved</h2>
          <MySavedPanel userId={user?.id ?? null} />
        </section>

        <section id="my-preferences" aria-labelledby="mtc-prefs" className="scroll-mt-24" data-testid="panel-preferences">
          <h2 id="mtc-prefs" className="mb-1 font-display text-xl font-semibold text-navy-900">My Preferences</h2>
          <p className="mb-5 text-sm text-slate-600">{user ? "Saved to your account, so they follow you to any device." : "Saved in this browser. Create a free account to keep them on every device."}</p>
          <div className="card p-5 sm:p-6">
            <PreferencesForm member={!!user} community={pref.community} extraCommunities={pref.extraCommunities} interests={pref.interests} />
          </div>
          <div className="card mt-4 flex items-start gap-3 p-5" data-testid="mtc-notifications">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
            {user ? (
              <p className="text-sm text-slate-700">
                Email and push updates are optional and off unless you turn them on. <Link href="/account/notifications/" className="font-semibold text-brand-700 hover:underline">Manage notification preferences</Link>.
              </p>
            ) : (
              <p className="text-sm text-slate-700">
                Email updates need a free account so you can choose exactly what you get and unsubscribe any time. <Link href="/register/?next=%2Fmy-t-county%2F" className="font-semibold text-brand-700 hover:underline">Create an account</Link> or <Link href="/newsletter/" className="font-semibold text-brand-700 hover:underline">sign up for the weekly newsletter</Link>.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

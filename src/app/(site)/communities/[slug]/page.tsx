import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Compass, Send } from "lucide-react";
import { getCommunityPreference } from "@/lib/my-t-county";
import { getCommunityPageData, loadCommunity } from "@/lib/communities";
import { spotsLeft } from "@/lib/gives/queries";
import { absoluteUrl } from "@/lib/utils";
import { ProfileCover } from "@/components/ui/profile-cover";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { buildMetadata } from "@/components/public/seo";
import { EventCard } from "@/components/cards/event-card";
import { BusinessCard } from "@/components/cards/business-card";
import { SpecialCard } from "@/components/cards/special-card";
import { ArticleCard } from "@/components/cards/article-card";
import { FoodTruckStopCard } from "@/components/food-trucks/stop-card";
import { GarageSaleCard } from "@/components/garage-sales/garage-sale-card";
import { ChurchCard, NeedCard, OpportunityCard, OrgCard } from "@/components/gives/cards";
import { OpeningCard } from "@/components/openings/opening-card";
import { SetCommunityButton } from "@/components/communities/set-community-button";
import { TrackView } from "@/components/public/track";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await loadCommunity(slug);
  if (!c) return { title: "Community not found", robots: { index: false } };
  return buildMetadata({
    title: `Things to do & local news in ${c.name}, Ohio`,
    description: c.profile?.intro || `Events, food trucks, garage sales, local businesses, restaurants, specials, churches, nonprofits and community news in ${c.name}, Tuscarawas County, Ohio.`,
    path: `/communities/${c.slug}/`,
    image: c.profile?.coverImageUrl,
  });
}

const q = (o: Record<string, string>) => `?${new URLSearchParams(o).toString()}`;

function Block({ id, title, subtitle, href, linkLabel = "See all", children }: { id: string; title: string; subtitle?: string | null; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-testid={`block-${id}`} className="scroll-mt-24">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="section-title">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">
            {linkLabel} <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const grid4 = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4";
const grid3 = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";

export default async function CommunityPage({ params }: Props) {
  const { slug } = await params;
  const c = await loadCommunity(slug);
  if (!c) notFound();
  const [d, pref] = await Promise.all([getCommunityPageData(c.name), getCommunityPreference()]);
  const city = { city: c.name };
  const cover = c.profile?.coverImageUrl;
  const intro = c.profile?.intro?.trim();

  const blocks = [
    { id: "events", label: "Events", show: d.events.length > 0 },
    { id: "food-trucks", label: "Food trucks", show: d.stops.length > 0 },
    { id: "garage-sales", label: "Garage sales", show: d.sales.length > 0 },
    { id: "new", label: "New & coming soon", show: d.openings.length > 0 },
    { id: "news", label: "News & updates", show: d.news.length > 0 },
    { id: "things-to-do", label: "Things to do", show: d.attractions.length > 0 || d.thingsArticles.length > 0 },
    { id: "restaurants", label: "Restaurants", show: d.restaurants.length > 0 },
    { id: "specials", label: "Specials", show: d.specials.length > 0 },
    { id: "businesses", label: "Businesses", show: d.businesses.length > 0 },
    { id: "churches", label: "Churches", show: d.churches.length > 0 },
    { id: "nonprofits", label: "Nonprofits", show: d.nonprofits.length > 0 },
    { id: "give", label: "Volunteer & give", show: d.opportunities.length > 0 || d.needs.length > 0 },
    { id: "stories", label: "Local stories", show: d.related.length > 0 },
  ].filter((b) => b.show);
  const empty = blocks.length === 0;

  return (
    <>
      <TrackView type="view_community" targetType="COMMUNITY" targetId={c.slug} />
      {cover && <ProfileCover src={cover} focusX={c.profile?.coverFocusX} focusY={c.profile?.coverFocusY} />}
      <header className={cover ? "border-b border-slate-200 bg-white" : "bg-gradient-to-br from-navy-900 to-navy-700"} data-testid="community-header">
        <div className="container-page py-6 sm:py-8">
          <Breadcrumbs items={[{ label: "Communities", href: "/communities/" }, { label: c.name }]} className="mb-3" invert={!cover} />
          <p className={cover ? "eyebrow" : "eyebrow text-sunset-300"}>Explore your community</p>
          <h1 className={`mt-1 font-display text-3xl font-bold leading-tight sm:text-4xl ${cover ? "text-navy-900" : "text-white"}`}>{c.name}, Ohio</h1>
          {intro ? (
            <p className={`mt-3 max-w-3xl whitespace-pre-line sm:text-lg ${cover ? "text-slate-700" : "text-white/85"}`} data-testid="community-intro">{intro}</p>
          ) : (
            <p className={`mt-2 max-w-3xl ${cover ? "text-slate-600" : "text-white/80"}`}>Events, local businesses, food, faith and community news in {c.name}, Tuscarawas County.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SetCommunityButton slug={c.slug} name={c.name} isCurrent={pref.community === c.name} />
            <Link href="/my-t-county/" className={cover ? "btn-ghost min-h-11" : "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-white hover:bg-white/10"}>My T County</Link>
          </div>
        </div>
      </header>

      {blocks.length > 1 && (
        <nav aria-label={`On this page: ${c.name}`} className="border-b border-slate-200 bg-white">
          <ul className="container-page flex gap-2 overflow-x-auto py-2 [scrollbar-width:none]">
            {blocks.map((b) => (
              <li key={b.id} className="shrink-0"><a href={`#${b.id}`} className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-navy-800 ring-1 ring-slate-200 hover:bg-slate-50">{b.label}</a></li>
            ))}
          </ul>
        </nav>
      )}

      <div className="container-page space-y-14 py-8 sm:py-10">
        {empty && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center" data-testid="community-empty">
            <Compass className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
            <p className="mt-3 font-semibold text-slate-800">We don&rsquo;t have listings for {c.name} yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
              As local businesses, events and organizations in {c.name} are added to T County Connect, they&rsquo;ll show up here automatically.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/submit/" className="btn-primary"><Send className="h-4 w-4" aria-hidden /> Share something</Link>
              <Link href="/communities/" className="btn-secondary">Other communities</Link>
            </div>
          </div>
        )}

        {d.events.length > 0 && (
          <Block id="events" title={`Upcoming events in ${c.name}`} subtitle={`Next ${30} days${d.eventCount > d.events.length ? ` · ${d.eventCount} events` : ""}`} href={`/events/${q(city)}`} linkLabel="All events">
            <div className={grid3}>{d.events.map((e) => <EventCard key={e.id} e={e} />)}</div>
          </Block>
        )}

        {d.stops.length > 0 && (
          <Block id="food-trucks" title="Food trucks" subtitle={`Upcoming scheduled stops in ${c.name}`} href={`/food-trucks/${q({ ...city, when: "upcoming" })}`}>
            <div className={grid3}>{d.stops.map((s) => <FoodTruckStopCard key={s.id} stop={s} />)}</div>
          </Block>
        )}

        {d.sales.length > 0 && (
          <Block id="garage-sales" title="Garage & yard sales" href={`/garage-sales/${q(city)}`}>
            <div className={grid3}>{d.sales.map((s) => <GarageSaleCard key={s.id} s={s} />)}</div>
          </Block>
        )}

        {d.openings.length > 0 && (
          <Block id="new" title="New & coming soon" href={`/new/${q({ city: c.slug })}`}>
            <div className={grid4}>{d.openings.map((o) => <OpeningCard key={o.id} o={o} />)}</div>
          </Block>
        )}

        {d.news.length > 0 && (
          <Block id="news" title={`${c.name} news & updates`} href="/articles/" linkLabel="All articles">
            <div className={grid3}>{d.news.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
          </Block>
        )}

        {(d.attractions.length > 0 || d.thingsArticles.length > 0) && (
          <Block id="things-to-do" title={`Things to do in ${c.name}`} href={d.attractions.length ? `/businesses/${q({ category: "attractions-recreation", ...city })}` : "/things-to-do/"} linkLabel={d.attractions.length ? "See all attractions" : "Things to Do"}>
            {d.thingsArticles.length > 0 && <div className={`${grid3} mb-6`}>{d.thingsArticles.map((a) => <ArticleCard key={a.id} a={a} />)}</div>}
            {d.attractions.length > 0 && <div className={grid4}>{d.attractions.map((b) => <BusinessCard key={b.id} b={b} />)}</div>}
          </Block>
        )}

        {d.restaurants.length > 0 && (
          <Block id="restaurants" title="Restaurants & food" subtitle={`${d.restaurantCount} listed in ${c.name}`} href={`/businesses/${q({ category: "food-dining", ...city })}`}>
            <div className={grid4}>{d.restaurants.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
          </Block>
        )}

        {d.specials.length > 0 && (
          <Block id="specials" title="Current specials" subtitle={`From businesses in ${c.name}`} href="/specials/" linkLabel="All specials">
            <div className={grid4}>{d.specials.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
          </Block>
        )}

        {d.businesses.length > 0 && (
          <Block id="businesses" title={`Local businesses in ${c.name}`} subtitle={`${d.businessCount} ${d.businessCount === 1 ? "business" : "businesses"} listed`} href={`/businesses/${q(city)}`} linkLabel={`See all ${d.businessCount}`}>
            <div className={grid4}>{d.businesses.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
          </Block>
        )}

        {d.churches.length > 0 && (
          <Block id="churches" title={`Churches in ${c.name}`} subtitle={d.churchCount > d.churches.length ? `${d.churchCount} churches listed` : null} href={`/churches/${q(city)}`}>
            <div className={grid4}>{d.churches.map((o) => <ChurchCard key={o.id} o={o} />)}</div>
          </Block>
        )}

        {d.nonprofits.length > 0 && (
          <Block id="nonprofits" title="Nonprofits & community groups" subtitle={d.nonprofitCount > d.nonprofits.length ? `${d.nonprofitCount} listed in ${c.name}` : null} href={`/gives/organizations/${q(city)}`}>
            <div className={grid3}>{d.nonprofits.map((o) => <OrgCard key={o.id} o={o} />)}</div>
          </Block>
        )}

        {(d.opportunities.length > 0 || d.needs.length > 0) && (
          <Block id="give" title="Volunteer & give" subtitle={`Ways to help in ${c.name}`}>
            {d.opportunities.length > 0 && (
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-navy-900">Volunteer opportunities</h3>
                  <Link href={`/gives/volunteer/${q(city)}`} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700">See all <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                </div>
                <div className={grid3}>{d.opportunities.map((o) => <OpportunityCard key={o.id} o={o} left={spotsLeft(o.spots, d.signups.get(o.id) ?? 0)} />)}</div>
              </div>
            )}
            {d.needs.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-navy-900">Community needs</h3>
                  <Link href={`/gives/needs/${q(city)}`} className="flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700">See all <ChevronRight className="h-4 w-4" aria-hidden /></Link>
                </div>
                <div className={grid3}>{d.needs.map((n) => <NeedCard key={n.id} n={n} pledged={d.pledged.get(n.id)} />)}</div>
              </div>
            )}
          </Block>
        )}

        {d.related.length > 0 && (
          <Block id="stories" title={`Stories from ${c.name}`} subtitle="Articles featuring local businesses">
            <div className={grid3}>{d.related.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
          </Block>
        )}

        <p className="text-sm text-slate-600">
          Something happening in {c.name}? <Link href="/submit/" className="font-semibold text-brand-700">Share it with T County Connect</Link> · <Link href="/communities/" className="font-semibold text-brand-700">All communities</Link>
        </p>
      </div>

      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Place",
            name: `${c.name}, Ohio`,
            url: absoluteUrl(`/communities/${c.slug}/`),
            ...(intro ? { description: intro } : {}),
            ...(cover ? { image: absoluteUrl(cover) } : {}),
            address: { "@type": "PostalAddress", addressLocality: c.name, addressRegion: "OH", addressCountry: "US" },
            containedInPlace: { "@type": "AdministrativeArea", name: "Tuscarawas County, Ohio" },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Communities", item: absoluteUrl("/communities/") },
              { "@type": "ListItem", position: 2, name: c.name, item: absoluteUrl(`/communities/${c.slug}/`) },
            ],
          },
        ]}
      />
    </>
  );
}

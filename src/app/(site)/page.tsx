import Link from "next/link";
import { JsonLd } from "@/components/public/json-ld";
import { getBrandAssetUrls } from "@/lib/brand-assets";
import { absoluteUrl } from "@/lib/utils";
import { permanentRedirect } from "next/navigation";
import { Store } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getHeroAppearance } from "@/lib/hero-appearance";
import { getSeasonalHero } from "@/lib/seasonal-theme";
import { SeasonalSection } from "@/components/home/seasonal-section";
import { getActivePlacements, getActiveSpecials, getArticlesForSection, getFeaturedBusinesses } from "@/lib/queries";
import { getHomeAvailability, getUpcomingEventsForHome, sectionSubtitle, sectionTitle, type HomeAvailability } from "@/lib/home-feed";
import { UpcomingEventsSection } from "@/components/home/upcoming-events-section";
import { Hero } from "@/components/home/hero";
import { ExploreGrid } from "@/components/home/explore-grid";
import { SectionHeader } from "@/components/home/section-header";
import { getTodayItems, TodaySection, type TodayItems } from "@/components/home/today-section";
import { FoodTrucksHomeSection } from "@/components/food-trucks/home-section";
import { GarageSalesHomeSection } from "@/components/garage-sales/home-section";
import { BusinessCard } from "@/components/cards/business-card";
import { ArticleCard } from "@/components/cards/article-card";
import { StoryCard } from "@/components/cards/story-card";
import { getStoryCardExtras } from "@/lib/story-cards";
import { SpecialCard } from "@/components/cards/special-card";
import { EmptyState } from "@/components/ui/empty-state";
import { GivesHomeSection } from "@/components/gives/home-section";
import { NewsletterSignup, signupAvailable } from "@/components/newsletter/newsletter-signup";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { getFeaturedPulse, getRecentPulses } from "@/lib/pulse";
import { PulseHeroCard } from "@/components/pulse/pulse-hero-card";
import { PulseCard } from "@/components/pulse/pulse-card";
import { getCommunityPreference, getSpecialsWithCity, splitByCommunity } from "@/lib/my-t-county";
import { CommunityBar } from "@/components/my-t-county/community-bar";
import { CommunityGroups } from "@/components/my-t-county/community-groups";
import { OpeningsHomeSection } from "@/components/openings/home-section";
import { JoinSection } from "@/components/home/join-section";
import { AccountSignupSection } from "@/components/home/account-signup-section";
import { getHomepageAnnouncements } from "@/lib/announcements";

export const dynamic = "force-dynamic";

type Section = Awaited<ReturnType<typeof db.homepageSection.findMany>>[number];

type HomeContext = {
  settings: Awaited<ReturnType<typeof getSettings>>;
  /** The visitor's chosen town, or null for All of Tuscarawas County. */
  community: string | null;
  hasJoin: boolean;
  hasAccountSignup: boolean;
  /** Food trucks / garage sales scheduled in the next 7 days (visitor's scope) — sections + shortcuts. */
  availability: HomeAvailability;
  today: TodayItems | null;
  upcoming: Awaited<ReturnType<typeof getUpcomingEventsForHome>> | null;
  /** Event ids already shown by Today / Upcoming Events — later event lists skip them. */
  shownEventIds: string[];
};

/**
 * `community` only reorders the today / upcoming events / food trucks / garage sales / specials
 * sections — local items first, countywide items still shown. With null, every section renders as
 * before. Event-carrying sections are deduplicated: no event card appears twice on the homepage.
 */
async function renderSection(s: Section, ctx: HomeContext) {
  const { settings, community, hasJoin, hasAccountSignup, availability } = ctx;
  switch (s.type) {
    case "hero": {
      // Right side (Admin → Homepage → "Right Side of Homepage Hero"):
      //   pulse (default): the featured, published Community Pulse; the newsletter card when none is active.
      //   newsletter: always the newsletter card (Community Pulse elsewhere is unaffected).
      // Nothing displayable (e.g. beehiiv mode without beehiiv credentials on the server) → full-width headline, no empty column.
      const wantPulse = settings.heroAside !== "newsletter";
      const [pulse, appearance, seasonal, nl] = await Promise.all([wantPulse ? getFeaturedPulse() : null, getHeroAppearance(), getSeasonalHero(), getNewsletterConfig()]);
      const aside = pulse ? <PulseHeroCard pulse={pulse} /> : signupAvailable(nl) ? <NewsletterSignup source="homepage" variant="hero" /> : null;
      // Seasonal photo when the active season has one; otherwise the normal hero appearance (never blank).
      return <Hero key={s.id} headline={s.title || settings.heroHeadline} sub={s.subtitle || settings.heroSubheadline} appearance={seasonal?.appearance ?? appearance} season={seasonal} aside={aside} availability={availability} />;
    }
    case "explore":
      return <ExploreGrid key={s.id} title={s.title} availability={availability} />;
    case "today":
      return ctx.today ? <TodaySection key={s.id} title={s.title} subtitle={s.subtitle} data={ctx.today} community={community} /> : null;
    case "weekend": {
      // "Upcoming Events" — the type key stays "weekend" so the section keeps its position, toggle and pins.
      const up = ctx.upcoming;
      if (!up) return null;
      const placements = await getActivePlacements("weekend_guide");
      const sponsor = placements[0];
      return (
        <UpcomingEventsSection key={s.id} title={sectionTitle(s)} subtitle={sectionSubtitle(s)} community={community}
          items={up.items} local={up.local} rest={up.rest} hasEarlier={!!ctx.today?.items.length}
          sponsor={sponsor && (
            <p className="mb-4 text-sm text-slate-600"><span className="badge-sponsored mr-2">{settings.sponsoredLabel}</span>Event guide presented by {sponsor.business ? <Link className="font-semibold text-brand-700" href={`/business/${sponsor.business.slug}/`}>{sponsor.business.name}</Link> : sponsor.title}</p>
          )} />
      );
    }
    case "events":
      // Retired: merged into Upcoming Events (type "weekend"). The row is kept so nothing breaks; it renders nothing.
      return null;
    case "businesses": {
      // Featured Local Businesses: admin-pinned → isFeatured → other published listings. No sponsored placements here.
      const list = await getFeaturedBusinesses(s.featuredIds, s.limit);
      if (!list.length) {
        return (
          <section key={s.id} className="container-page py-10">
            <SectionHeader title={s.title} subtitle={s.subtitle} />
            <EmptyState icon={Store} title="The business directory is being built">Own a business in Tuscarawas County? <Link href="/list-your-business/" className="font-semibold text-brand-700">Add your free listing</Link>.</EmptyState>
          </section>
        );
      }
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/businesses/" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((b) => <BusinessCard key={b.id} b={b} />)}
          </div>
        </section>
      );
    }
    case "spotlights": {
      const items = await getArticlesForSection({ kind: "SPOTLIGHT" }, s.featuredIds, s.limit);
      const list = items.length ? items : await getArticlesForSection({}, s.featuredIds, s.limit);
      if (!list.length) return null;
      // The Spotlight title only applies when a Business Spotlight story is actually shown.
      const hasSpotlight = list.some((a) => a.kind === "SPOTLIGHT");
      const title = hasSpotlight ? s.title : "Local Stories";
      const subtitle = hasSpotlight || !s.subtitle || !/spotlight|business|owner/i.test(s.subtitle) ? s.subtitle : "Stories from around Tuscarawas County";
      const extras = await getStoryCardExtras(list);
      // Compact horizontal story cards: 1 → one card at half width (sm+), 2 → two side by side, 3+ → 3 columns on lg.
      const grid = list.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
      return (
        <section key={s.id} className="container-page py-10" data-testid="home-spotlights">
          <SectionHeader title={title} subtitle={subtitle} href={hasSpotlight ? "/spotlights/" : "/articles/"} linkLabel={hasSpotlight ? "View All Spotlights" : "View all"} />
          <ul className={`grid grid-cols-1 gap-4 ${grid}`} data-count={list.length}>
            {list.map((a) => (
              <li key={a.id} className="min-w-0"><StoryCard a={a} fit={extras[a.id]?.fit} excerpt={extras[a.id]?.excerpt} sizes="(min-width:640px) 112px, 80px" /></li>
            ))}
          </ul>
        </section>
      );
    }
    case "specials": {
      if (community) {
        const all = await getSpecialsWithCity(60, s.featuredIds);
        if (!all.length) return null;
        const groups = splitByCommunity(all, (p) => p.business.city, community, s.limit || 4);
        return (
          <section key={s.id} className="container-page py-12">
            <SectionHeader title={s.title} subtitle={s.subtitle} href="/specials/" />
            <CommunityGroups community={community} local={groups.local} rest={groups.rest} testId="home-specials-groups"
              gridClassName="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4" nothingLocal={`No current specials from ${community} businesses yet.`}
              render={(p) => <SpecialCard key={p.id} p={p} />} />
          </section>
        );
      }
      const items = await getActiveSpecials(s.limit, s.featuredIds);
      if (!items.length) return null;
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/specials/" />
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">{items.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
        </section>
      );
    }
    case "things_to_do": {
      const items = await getArticlesForSection({ kind: "THINGS_TO_DO" }, s.featuredIds, s.limit);
      if (!items.length) return null;
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/things-to-do/" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{items.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
        </section>
      );
    }
    case "announcements": {
      // Expired community updates (expiresAt passed) leave the homepage; the visitor's community comes first.
      const items = await getHomepageAnnouncements(s.featuredIds, s.limit, [community]);
      if (!items.length) return null;
      return (
        <section key={s.id} className="container-page py-12" data-testid="home-announcements">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/announcements/" />
          <div className="grid gap-5 sm:grid-cols-2">{items.map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)}</div>
        </section>
      );
    }
    case "newsletter":
      // Type key kept for existing ordering/toggles; it now invites visitors to a free My T County account
      // (fixed copy — the section's stored title/subtitle were newsletter wording). The newsletter itself
      // stays an optional checkbox handed to /register/. See AccountSignupSection.
      return <AccountSignupSection key={s.id} joinShowsLink={hasJoin} />;
    case "gives":
      return <GivesHomeSection key={s.id} title={s.title} subtitle={s.subtitle} limit={s.limit} featuredIds={s.featuredIds} community={community} />;
    case "cta":
      return (
        <section key={s.id} className="container-page py-12">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 to-brand-700 px-6 py-10 text-white sm:px-12 sm:py-14">
            <h2 className="font-display text-3xl font-semibold">{s.title}</h2>
            {s.subtitle && <p className="mt-2 max-w-xl text-white/85">{s.subtitle}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/list-your-business/" className="btn bg-white text-navy-900 hover:bg-slate-100">List your business</Link>
              <Link href="/add-your-business/" className="btn border border-white/40 text-white hover:bg-white/10">Learn more</Link>
            </div>
          </div>
        </section>
      );
    case "community_pulse": {
      const items = await getRecentPulses(s.limit || 3);
      if (!items.length) return null;
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/community-pulse/" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((p) => <PulseCard key={p.id} p={p} />)}</div>
        </section>
      );
    }
    case "food_trucks":
      // Only when a stop is scheduled in the next 7 days for the visitor's scope (no empty state).
      return availability.foodTrucks ? <FoodTrucksHomeSection key={s.id} title={s.title} subtitle={s.subtitle} limit={s.limit} community={community} /> : null;
    case "garage_sales":
      // Only when a sale runs in the next 7 days for the visitor's scope (no empty state).
      return availability.garageSales ? <GarageSalesHomeSection key={s.id} title={sectionTitle(s)} subtitle={sectionSubtitle(s)} limit={s.limit} community={community} /> : null;
    case "join":
      // With the bottom My T County signup card enabled, signed-out visitors see only that one invitation.
      return <JoinSection key={s.id} title={s.title} subtitle={s.subtitle} hideForGuests={hasAccountSignup} />;
    case "seasonal":
      return <SeasonalSection key={s.id} title={s.title} subtitle={s.subtitle} excludeEventIds={ctx.shownEventIds} />;
    case "new_coming_soon":
      return <OpeningsHomeSection key={s.id} title={s.title} subtitle={s.subtitle} limit={s.limit} community={community} />;
    default:
      return null;
  }
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // WordPress shortlinks (/?p=123, /?page_id=45) → migrated content
  const sp = await searchParams;
  for (const key of ["p", "page_id"]) {
    const v = sp[key];
    if (typeof v === "string" && /^\d+$/.test(v)) {
      const r = await db.redirect.findUnique({ where: { fromPath: `/?${key}=${v}` } });
      if (r) {
        await db.redirect.update({ where: { id: r.id }, data: { hits: { increment: 1 } } });
        permanentRedirect(r.toPath);
      }
    }
  }
  const [settings, sections, pref, brand] = await Promise.all([
    getSettings(),
    db.homepageSection.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } }),
    getCommunityPreference(),
    getBrandAssetUrls(),
  ]);
  // The enabled "join" section already shows signed-in visitors the "Go to My T County" link.
  const hasJoin = sections.some((s) => s.type === "join");
  // The enabled bottom "My T County signup" card (type "newsletter") is the only account invitation for guests.
  const hasAccountSignup = sections.some((s) => s.type === "newsletter");
  const community = pref.active;
  // Event lists are computed before rendering so later lists can skip events already shown:
  // Today keeps its events; Upcoming Events skips them; seasonal picks skip both.
  const todaySec = sections.find((s) => s.type === "today");
  const upcomingSec = sections.find((s) => s.type === "weekend");
  const [availability, today] = await Promise.all([
    getHomeAvailability(community),
    todaySec ? getTodayItems({ limit: todaySec.limit, featuredIds: todaySec.featuredIds, community }) : null,
  ]);
  const todayIds = today?.items.map((e) => e.id) ?? [];
  const upcoming = upcomingSec ? await getUpcomingEventsForHome({ limit: upcomingSec.limit, community, featuredIds: upcomingSec.featuredIds, excludeIds: todayIds }) : null;
  const shownEventIds = [...todayIds, ...(upcoming?.items.map((e) => e.id) ?? [])];
  const ctx: HomeContext = { settings, community, hasJoin, hasAccountSignup, availability, today, upcoming, shownEventIds };
  const rendered = await Promise.all(sections.map((s) => renderSection(s, ctx)));
  // Community prompt / switcher sits right below the hero (or at the top when there is no hero).
  const heroAt = sections.findIndex((s) => s.type === "hero");
  rendered.splice(heroAt + 1, 0, <CommunityBar key="community-bar" community={pref.community} active={pref.active} showPrompt={pref.showPrompt} className="pt-6" />);
  const socials = Object.values(settings.socials || {}).filter((v): v is string => typeof v === "string" && /^https?:\/\//.test(v));
  return (
    <>
      {rendered}
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: settings.siteName,
            alternateName: "TCountySpotlight",
            url: absoluteUrl("/"),
            ...(brand.logo ? { logo: absoluteUrl(brand.logo) } : {}),
            areaServed: { "@type": "AdministrativeArea", name: "Tuscarawas County, Ohio" },
            ...(socials.length ? { sameAs: socials } : {}),
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: settings.siteName,
            url: absoluteUrl("/"),
            potentialAction: { "@type": "SearchAction", target: `${absoluteUrl("/search/")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
          },
        ]}
      />
    </>
  );
}

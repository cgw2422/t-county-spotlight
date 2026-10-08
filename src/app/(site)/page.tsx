import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { CalendarDays, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { weekendWindow } from "@/lib/events";
import { getActivePlacements, getActiveSpecials, getArticlesForSection, getFeaturedBusinesses, getUpcomingOccurrences } from "@/lib/queries";
import { Hero } from "@/components/home/hero";
import { ExploreGrid } from "@/components/home/explore-grid";
import { SectionHeader } from "@/components/home/section-header";
import { EventCard } from "@/components/cards/event-card";
import { BusinessCard } from "@/components/cards/business-card";
import { ArticleCard } from "@/components/cards/article-card";
import { SpecialCard } from "@/components/cards/special-card";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

type Section = Awaited<ReturnType<typeof db.homepageSection.findMany>>[number];

async function renderSection(s: Section, settings: Awaited<ReturnType<typeof getSettings>>) {
  switch (s.type) {
    case "hero":
      return <Hero key={s.id} headline={s.title || settings.heroHeadline} sub={s.subtitle || settings.heroSubheadline} imageUrl={settings.heroImageUrl} />;
    case "explore":
      return <ExploreGrid key={s.id} title={s.title} />;
    case "weekend": {
      const { start, end } = weekendWindow();
      const items = await getUpcomingOccurrences({ from: start, to: end, limit: s.limit, featuredIds: s.featuredIds });
      const sponsor = (await getActivePlacements("weekend_guide"))[0];
      return (
        <section key={s.id} className="container-page py-10">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/events/?when=weekend" />
          {sponsor && (
            <p className="mb-4 text-sm text-slate-600"><span className="badge-sponsored mr-2">{settings.sponsoredLabel}</span>Weekend guide presented by {sponsor.business ? <Link className="font-semibold text-brand-700" href={`/business/${sponsor.business.slug}/`}>{sponsor.business.name}</Link> : sponsor.title}</p>
          )}
          {items.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{items.map((e) => <EventCard key={e.id} e={e} />)}</div>
          ) : (
            <EmptyState icon={CalendarDays} title="No events listed for this weekend yet">Know of something happening? <Link href="/events/submit/" className="font-semibold text-brand-700">Submit an event</Link>.</EmptyState>
          )}
        </section>
      );
    }
    case "events": {
      const items = await getUpcomingOccurrences({ limit: s.limit, featuredIds: s.featuredIds });
      if (!items.length) return null;
      return (
        <section key={s.id} className="bg-slate-50 py-12">
          <div className="container-page">
            <SectionHeader title={s.title} subtitle={s.subtitle} href="/events/" />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((e) => <EventCard key={e.id} e={e} />)}</div>
          </div>
        </section>
      );
    }
    case "businesses": {
      const [items, sponsored] = await Promise.all([getFeaturedBusinesses(s.featuredIds, s.limit), getActivePlacements("homepage_featured")]);
      if (!items.length && !sponsored.length) {
        return (
          <section key={s.id} className="container-page py-10">
            <SectionHeader title={s.title} subtitle={s.subtitle} />
            <EmptyState icon={Store} title="The business directory is being built">Own a business in Tuscarawas County? <Link href="/list-your-business/" className="font-semibold text-brand-700">Add your free listing</Link>.</EmptyState>
          </section>
        );
      }
      const sponsoredIds = new Set(sponsored.map((p) => p.businessId));
      const sponsoredCards = sponsored.filter((p) => p.business).map((p) => p.business!);
      const list = [...sponsoredCards, ...items.filter((b) => !sponsoredIds.has(b.id))].slice(0, s.limit);
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/businesses/" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {list.map((b) => <BusinessCard key={b.id} b={b} sponsored={sponsoredIds.has(b.id)} sponsoredLabel={settings.sponsoredLabel} />)}
          </div>
        </section>
      );
    }
    case "spotlights": {
      const items = await getArticlesForSection({ kind: "SPOTLIGHT" }, s.featuredIds, s.limit);
      const list = items.length ? items : await getArticlesForSection({}, s.featuredIds, s.limit);
      if (!list.length) return null;
      const [first, ...rest] = list;
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/spotlights/" />
          <div className="grid gap-6 lg:grid-cols-2">
            <ArticleCard a={first} variant="feature" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1 lg:gap-5">
              {rest.slice(0, 4).map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)}
            </div>
          </div>
        </section>
      );
    }
    case "specials": {
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
      const items = await getArticlesForSection({ kind: "ANNOUNCEMENT" }, s.featuredIds, s.limit);
      if (!items.length) return null;
      return (
        <section key={s.id} className="container-page py-12">
          <SectionHeader title={s.title} subtitle={s.subtitle} href="/announcements/" />
          <div className="grid gap-5 sm:grid-cols-2">{items.map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)}</div>
        </section>
      );
    }
    case "cta":
      return (
        <section key={s.id} className="container-page py-12">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 to-brand-700 px-6 py-10 text-white sm:px-12 sm:py-14">
            <h2 className="font-display text-3xl font-semibold">{s.title}</h2>
            {s.subtitle && <p className="mt-2 max-w-xl text-white/85">{s.subtitle}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/list-your-business/" className="btn bg-white text-navy-900 hover:bg-slate-100">List your business</Link>
              <Link href="/memberships/" className="btn border border-white/40 text-white hover:bg-white/10">See memberships</Link>
            </div>
          </div>
        </section>
      );
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
  const [settings, sections] = await Promise.all([
    getSettings(),
    db.homepageSection.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const rendered = await Promise.all(sections.map((s) => renderSection(s, settings)));
  return <>{rendered}</>;
}

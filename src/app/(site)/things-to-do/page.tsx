import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import { db } from "@/lib/db";
import { weekendWindow } from "@/lib/events";
import { articleCardSelect, businessCardSelect, getUpcomingOccurrences, publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { ArticleCard } from "@/components/cards/article-card";
import { BusinessCard } from "@/components/cards/business-card";
import { EventCard } from "@/components/cards/event-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/home/section-header";
import { PageHeader } from "@/components/public/page-header";
import { StoryFeature } from "@/components/public/story-feature";
import { buildMetadata } from "@/components/public/seo";

export const dynamic = "force-dynamic";

const FUN_EVENT_CATEGORIES = ["family-kids", "arts-culture", "sports-outdoors", "festivals-fairs", "live-music", "markets", "food-drink"];
const ATTRACTION_CATEGORIES = ["attractions-recreation", "arts-entertainment"];

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Things to Do in Tuscarawas County",
    description: "Family fun, festivals, live music, outdoor adventures, attractions and local guides — find things to do in Tuscarawas County, Ohio.",
    path: "/things-to-do/",
  });
}

export default async function ThingsToDoPage() {
  const { start, end } = weekendWindow();
  const [guides, weekend, upcoming, attractions] = await Promise.all([
    db.article.findMany({ where: publishedArticleWhere({ kind: "THINGS_TO_DO" }), select: articleCardSelect, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: 7 }),
    getUpcomingOccurrences({ from: start, to: end, limit: 4, where: { category: { slug: { in: FUN_EVENT_CATEGORIES } } } }),
    getUpcomingOccurrences({ limit: 6, where: { category: { slug: { in: FUN_EVENT_CATEGORIES } } } }),
    db.business.findMany({ where: publicBusinessWhere({ categories: { some: { slug: { in: ATTRACTION_CATEGORIES } } } }), select: businessCardSelect, orderBy: [{ isFeatured: "desc" }, { isSpotlighted: "desc" }, { name: "asc" }], take: 8 }),
  ]);
  const weekendIds = new Set(weekend.map((e) => e.id));
  const later = upcoming.filter((e) => !weekendIds.has(e.id)).slice(0, 6);
  const [lead, ...moreGuides] = guides;
  const nothing = !guides.length && !weekend.length && !later.length && !attractions.length;

  return (
    <>
      <PageHeader
        eyebrow="Explore"
        title="Things to Do"
        subtitle="Festivals, family days, live music, trails and hidden gems across Tuscarawas County."
        crumbs={[{ label: "Things to Do" }]}
      >
        <Link href="/events/?when=weekend" className="btn-primary">This weekend</Link>
      </PageHeader>
      <div className="container-page space-y-14 py-8 sm:py-10">
        {nothing && (
          <EmptyState icon={Compass} title="Our things-to-do guide is coming together">
            Events and local guides will appear here soon. Hosting something? <Link href="/events/submit/" className="font-semibold text-brand-700">Submit an event</Link>.
          </EmptyState>
        )}

        {lead && <StoryFeature a={lead} eyebrow="Local guide" />}

        {weekend.length > 0 && (
          <section>
            <SectionHeader title="This weekend" subtitle="Family-friendly fun, music, markets and more." href="/events/?when=weekend" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{weekend.map((e) => <EventCard key={e.id} e={e} />)}</div>
          </section>
        )}

        {later.length > 0 && (
          <section>
            <SectionHeader title="Coming up" href="/events/" linkLabel="All events" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{later.map((e) => <EventCard key={e.id} e={e} />)}</div>
          </section>
        )}

        {moreGuides.length > 0 && (
          <section>
            <SectionHeader title="Local guides" subtitle="Ideas and itineraries from our editors." />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{moreGuides.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
          </section>
        )}

        {attractions.length > 0 && (
          <section>
            <SectionHeader title="Attractions & recreation" href="/businesses/?category=attractions-recreation" />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{attractions.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}

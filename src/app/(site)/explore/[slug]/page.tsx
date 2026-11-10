import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { absoluteUrl } from "@/lib/utils";
import { communityHref } from "@/lib/communities-shared";
import { collectionHref, collectionItemSelect, resolveCollectionItems, type CollectionItemRow, type ResolvedItem } from "@/lib/explore-collections";
import { ProfileCover } from "@/components/ui/profile-cover";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { buildMetadata } from "@/components/public/seo";
import { BusinessCard } from "@/components/cards/business-card";
import { ArticleCard } from "@/components/cards/article-card";
import { EventCard } from "@/components/cards/event-card";
import { OrgCard } from "@/components/gives/cards";
import { PulseCard } from "@/components/pulse/pulse-card";
import { PlaceCard } from "@/components/explore/collection-cards";
import { TrackView } from "@/components/public/track";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/**
 * Loads a collection for the public page. Drafts are visible to staff only (as
 * a preview). Returns null when the collection is missing, not public, or has
 * no publicly visible items — empty collections are never shown.
 */
const loadCollection = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const c = await db.exploreCollection.findUnique({ where: { slug }, include: { items: { select: collectionItemSelect } } });
  if (!c) return null;
  const published = c.status === "PUBLISHED";
  if (!published && !isStaff(await getCurrentUser())) return null;
  const items = await resolveCollectionItems(c.items as CollectionItemRow[]);
  if (published && !items.length) return null;
  return { c, items, preview: !published };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadCollection(slug);
  if (!data) return { title: "Collection not found", robots: { index: false } };
  const { c, preview } = data;
  return buildMetadata({
    title: `${c.title} | Explore T County`,
    description: c.description || `${c.title}: local picks from across Tuscarawas County, Ohio.`,
    path: collectionHref(c),
    image: c.coverImageUrl,
    noindex: preview,
  });
}

function ItemCard({ it }: { it: ResolvedItem }) {
  switch (it.kind) {
    case "BUSINESS": return <BusinessCard b={it.business} />;
    case "ARTICLE": return <ArticleCard a={it.article} />;
    case "EVENT": return <EventCard e={it.event} />;
    case "ORGANIZATION": return <OrgCard o={it.org} />;
    case "PULSE": return <PulseCard p={it.pulse} />;
    case "PLACE": return <PlaceCard p={it.place} />;
  }
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const data = await loadCollection(slug);
  if (!data) notFound();
  const { c, items, preview } = data;
  const url = absoluteUrl(collectionHref(c));

  return (
    <>
      {!preview && <TrackView type="view_collection" targetType="COLLECTION" targetId={c.id} />}
      {preview && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-900" role="status">
          Draft preview — only staff can see this page. {items.length === 0 && "It has no publicly visible items yet."}
        </div>
      )}
      {c.coverImageUrl ? (
        <ProfileCover src={c.coverImageUrl} focusX={c.coverFocusX} focusY={c.coverFocusY} />
      ) : null}
      <div className={c.coverImageUrl ? "border-b border-slate-200 bg-white" : "border-b border-slate-200 bg-gradient-to-b from-cream to-white"}>
        <div className="container-page py-6 sm:py-8">
          <Breadcrumbs items={[{ label: "Explore", href: "/explore/" }, { label: c.title }]} className="mb-3" />
          <p className="eyebrow">Explore T County</p>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{c.title}</h1>
          {c.description && <p className="mt-2 max-w-3xl whitespace-pre-line text-slate-600 sm:text-lg">{c.description}</p>}
        </div>
      </div>

      <div className="container-page py-8 sm:py-10">
        <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="collection-items">
          {items.map((it) => {
            const town = communityHref(it.city);
            return (
              <li key={it.itemId} className="flex flex-col gap-2" data-testid={`collection-item-${it.kind.toLowerCase()}`}>
                <div className="flex-1"><ItemCard it={it} /></div>
                {(it.note || (town && it.kind !== "PLACE")) && (
                  <div className="space-y-1 px-1 text-sm">
                    {town && it.kind !== "PLACE" && (
                      <p className="flex items-center gap-1 text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden /> <Link href={town} className="font-medium text-brand-700 hover:underline">{it.city}</Link></p>
                    )}
                    {it.note && <p className="text-slate-700"><span className="font-semibold">Good to know:</span> {it.note}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-10 text-sm text-slate-600">
          Know a place that belongs here? <Link href="/submit/" className="font-semibold text-brand-700">Share it with us</Link> · <Link href="/explore/" className="font-semibold text-brand-700">More ways to explore T County</Link>
        </p>
      </div>

      {!preview && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: c.title,
            description: c.description || undefined,
            url,
            numberOfItems: items.length,
            itemListElement: items.map((it, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: it.name,
              ...(it.href ? { url: it.href.startsWith("http") ? it.href : absoluteUrl(it.href) } : {}),
            })),
          }}
        />
      )}
    </>
  );
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { articleCardSelect, businessCardSelect, getUpcomingOccurrences, publicBusinessWhere, publishedArticleWhere } from "./queries";
import { orgCardSelect, publicOrgWhere } from "./gives/queries";
import { orgHref } from "./gives/constants";
import { publicPulseWhere, pulseCardSelect, pulseHref, type PulseCardData } from "./pulse";
import { articleHref, businessHref, eventHref } from "./links";
import { safeHttpUrl } from "./food-trucks";
import { communityName } from "./my-t-county-shared";
import { mapsSearchUrl } from "./communities-shared";
import type { BusinessCardData } from "@/components/cards/business-card";
import type { ArticleCardData } from "@/components/cards/article-card";
import type { EventCardData } from "@/components/cards/event-card";
import type { OrgCardData } from "@/components/gives/cards";

export const COLLECTION_ITEM_TYPES = ["BUSINESS", "ARTICLE", "EVENT", "ORGANIZATION", "PULSE", "PLACE"] as const;
export type CollectionItemTypeValue = (typeof COLLECTION_ITEM_TYPES)[number];
export const LINKED_ITEM_TYPES = ["BUSINESS", "ARTICLE", "EVENT", "ORGANIZATION", "PULSE"] as const;
export type LinkedItemType = (typeof LINKED_ITEM_TYPES)[number];

export const ITEM_TYPE_LABEL: Record<CollectionItemTypeValue, string> = {
  BUSINESS: "Business", ARTICLE: "Article", EVENT: "Event", ORGANIZATION: "Nonprofit / church", PULSE: "Community Pulse", PLACE: "Place",
};

/**
 * Starter ideas from the brief. Staff can start one as an EMPTY draft — nothing
 * is ever filled in automatically.
 */
export const SUGGESTED_COLLECTIONS = [
  { title: "Free Things to Do in Tuscarawas County", description: "Parks, trails, museums and community events that don't cost a thing." },
  { title: "Family-Friendly Activities", description: "Places and events the whole family can enjoy around Tuscarawas County." },
  { title: "Places to Explore This Weekend", description: "Ideas for getting out and exploring Tuscarawas County this weekend." },
  { title: "Rainy Day Activities", description: "Indoor things to do around Tuscarawas County when the weather doesn't cooperate." },
] as const;

export function collectionHref(c: { slug: string }) {
  return `/explore/${c.slug}/`;
}

export type CollectionItemRow = {
  id: string; itemType: CollectionItemTypeValue; targetId: string | null; title: string | null; description: string | null; imageUrl: string | null;
  address: string | null; city: string | null; websiteUrl: string | null; note: string | null; sortOrder: number;
};

export const collectionItemSelect = {
  id: true, itemType: true, targetId: true, title: true, description: true, imageUrl: true, address: true, city: true, websiteUrl: true, note: true, sortOrder: true,
} satisfies Prisma.ExploreCollectionItemSelect;

export type PlaceData = {
  title: string; description: string | null; imageUrl: string | null; address: string | null; city: string | null;
  directionsUrl: string; websiteUrl: string | null;
};

type Base = { itemId: string; name: string; href: string | null; city: string | null; note: string | null };
export type ResolvedItem =
  | (Base & { kind: "BUSINESS"; business: BusinessCardData })
  | (Base & { kind: "ARTICLE"; article: ArticleCardData })
  | (Base & { kind: "EVENT"; event: EventCardData })
  | (Base & { kind: "ORGANIZATION"; org: OrgCardData })
  | (Base & { kind: "PULSE"; pulse: PulseCardData })
  | (Base & { kind: "PLACE"; place: PlaceData });

const ids = (items: CollectionItemRow[], t: CollectionItemTypeValue) => [...new Set(items.filter((i) => i.itemType === t && i.targetId).map((i) => i.targetId!))];

/**
 * Resolves collection items into public cards, in sortOrder. Linked records are
 * included only when they are public right now (published, not deleted; events
 * only with an upcoming occurrence). Staff overrides (title/description/photo)
 * replace the record's own values.
 */
export async function resolveCollectionItems(items: CollectionItemRow[], now = new Date()): Promise<ResolvedItem[]> {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const [bIds, aIds, eIds, oIds, pIds] = (["BUSINESS", "ARTICLE", "EVENT", "ORGANIZATION", "PULSE"] as const).map((t) => ids(sorted, t));
  const [businesses, articles, events, orgs, pulses] = await Promise.all([
    bIds.length ? db.business.findMany({ where: publicBusinessWhere({ id: { in: bIds } }), select: businessCardSelect() }) : [],
    aIds.length ? db.article.findMany({ where: publishedArticleWhere({ id: { in: aIds } }), select: { ...articleCardSelect, city: true } }) : [],
    eIds.length ? getUpcomingOccurrences({ from: now, to: new Date(now.getTime() + 400 * 86400_000), where: { id: { in: eIds } } }) : [],
    oIds.length ? db.organization.findMany({ where: publicOrgWhere({ id: { in: oIds } }), select: orgCardSelect }) : [],
    pIds.length ? db.communityPulse.findMany({ where: publicPulseWhere({ id: { in: pIds } }), select: pulseCardSelect }) : [],
  ]);
  const B = new Map(businesses.map((x) => [x.id, x]));
  const A = new Map(articles.map((x) => [x.id, x]));
  const E = new Map(events.map((x) => [x.id, x]));
  const O = new Map(orgs.map((x) => [x.id, x]));
  const P = new Map(pulses.map((x) => [x.id, x]));

  const out: ResolvedItem[] = [];
  const seen = new Set<string>();
  for (const it of sorted) {
    const key = `${it.itemType}:${it.targetId ?? it.id}`;
    if (seen.has(key)) continue;
    const base = { itemId: it.id, note: it.note };
    switch (it.itemType) {
      case "BUSINESS": {
        const b = B.get(it.targetId ?? "");
        if (!b) continue;
        const card = { ...b, name: it.title || b.name, tagline: it.description || b.tagline, ...(it.imageUrl ? { coverUrl: it.imageUrl, coverFocusX: 50, coverFocusY: 50 } : {}) };
        out.push({ ...base, kind: "BUSINESS", name: card.name, href: businessHref(b), city: b.city, business: card });
        break;
      }
      case "ARTICLE": {
        const a = A.get(it.targetId ?? "");
        if (!a) continue;
        const card = { ...a, title: it.title || a.title, excerpt: it.description || a.excerpt, featuredImageUrl: it.imageUrl || a.featuredImageUrl };
        out.push({ ...base, kind: "ARTICLE", name: card.title, href: articleHref(a), city: a.city, article: card });
        break;
      }
      case "EVENT": {
        const e = E.get(it.targetId ?? "");
        if (!e) continue;
        const card = { ...e, title: it.title || e.title, imageUrl: it.imageUrl || e.imageUrl };
        out.push({ ...base, kind: "EVENT", name: card.title, href: eventHref(e), city: e.city, event: card });
        break;
      }
      case "ORGANIZATION": {
        const o = O.get(it.targetId ?? "");
        if (!o) continue;
        const card = { ...o, name: it.title || o.name, tagline: it.description || o.tagline, ...(it.imageUrl ? { coverUrl: it.imageUrl, coverFocusX: 50, coverFocusY: 50 } : {}) };
        out.push({ ...base, kind: "ORGANIZATION", name: card.name, href: orgHref(o), city: o.city, org: card });
        break;
      }
      case "PULSE": {
        const p = P.get(it.targetId ?? "");
        if (!p) continue;
        const card = { ...p, title: it.title || p.title, description: it.description || p.description, featuredImageUrl: it.imageUrl || p.featuredImageUrl };
        out.push({ ...base, kind: "PULSE", name: card.title, href: pulseHref(p), city: null, pulse: card });
        break;
      }
      case "PLACE": {
        if (!it.title) continue;
        const city = communityName(it.city) ?? it.city;
        const websiteUrl = safeHttpUrl(it.websiteUrl);
        out.push({
          ...base, kind: "PLACE", name: it.title, href: websiteUrl, city,
          place: { title: it.title, description: it.description, imageUrl: it.imageUrl, address: it.address, city, websiteUrl, directionsUrl: mapsSearchUrl([it.address ? null : it.title, it.address, city]) },
        });
        break;
      }
    }
    seen.add(key);
  }
  return out;
}

const listSelect = {
  id: true, slug: true, title: true, description: true, coverImageUrl: true, coverFocusX: true, coverFocusY: true, isFeatured: true, sortOrder: true,
  items: { select: collectionItemSelect },
} satisfies Prisma.ExploreCollectionSelect;

export type PublicCollectionSummary = {
  id: string; slug: string; title: string; description: string | null; coverImageUrl: string | null; coverFocusX: number; coverFocusY: number;
  isFeatured: boolean; itemCount: number; previewImage: string | null; updatedAt?: Date;
};

/** Published collections with at least one publicly visible item (featured first, then sortOrder). Empty collections are never returned. */
export async function getPublicCollections(now = new Date()): Promise<PublicCollectionSummary[]> {
  const rows = await db.exploreCollection.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ isFeatured: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: { ...listSelect, updatedAt: true },
  });
  const resolved = await Promise.all(rows.map((r) => resolveCollectionItems(r.items as CollectionItemRow[], now)));
  return rows
    .map((r, i) => ({ r, items: resolved[i] }))
    .filter((x) => x.items.length > 0)
    .map(({ r, items }) => ({
      id: r.id, slug: r.slug, title: r.title, description: r.description, coverImageUrl: r.coverImageUrl, coverFocusX: r.coverFocusX, coverFocusY: r.coverFocusY,
      isFeatured: r.isFeatured, itemCount: items.length, previewImage: r.coverImageUrl || firstImage(items), updatedAt: r.updatedAt,
    }));
}

function firstImage(items: ResolvedItem[]): string | null {
  for (const it of items) {
    const img =
      it.kind === "PLACE" ? it.place.imageUrl
      : it.kind === "BUSINESS" ? it.business.coverUrl
      : it.kind === "ARTICLE" ? it.article.featuredImageUrl
      : it.kind === "EVENT" ? it.event.imageUrl
      : it.kind === "ORGANIZATION" ? it.org.coverUrl
      : it.pulse.featuredImageUrl;
    if (img) return img;
  }
  return null;
}

/** Count of publicly visible items for one collection (used to block publishing an empty collection). */
export async function visibleItemCount(collectionId: string) {
  const items = await db.exploreCollectionItem.findMany({ where: { collectionId }, select: collectionItemSelect });
  return (await resolveCollectionItems(items as CollectionItemRow[])).length;
}

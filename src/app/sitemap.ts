import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { publicPromotionWhere } from "@/lib/promotions";
import { upcomingEventWhere } from "@/lib/events";
import { publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { articleHref, businessHref, eventHref, jobHref, pageHref, specialHref } from "@/lib/links";
import { absoluteUrl } from "@/lib/utils";
import { givesSitemapEntries } from "@/lib/gives/sitemap";
import { publicPulseWhere, pulseHref } from "@/lib/pulse";
import { activeSaleWhere, garageSaleHref } from "@/lib/garage-sales";
import { openingHref, publicOpeningsWhere } from "@/lib/openings";
import { collectionHref, getPublicCollections } from "@/lib/explore-collections";
import { COMMUNITIES, getCommunityCounts, hasCommunityContent } from "@/lib/communities";

export const dynamic = "force-dynamic";

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/businesses/", priority: 0.9, changeFrequency: "daily" },
  { path: "/events/", priority: 0.9, changeFrequency: "daily" },
  { path: "/specials/", priority: 0.8, changeFrequency: "daily" },
  { path: "/articles/", priority: 0.8, changeFrequency: "daily" },
  { path: "/spotlights/", priority: 0.8, changeFrequency: "weekly" },
  { path: "/things-to-do/", priority: 0.8, changeFrequency: "weekly" },
  { path: "/announcements/", priority: 0.6, changeFrequency: "weekly" },
  { path: "/jobs/", priority: 0.6, changeFrequency: "daily" },
  { path: "/community-pulse/", priority: 0.7, changeFrequency: "weekly" },
  { path: "/explore/", priority: 0.5, changeFrequency: "weekly" },
  { path: "/communities/", priority: 0.6, changeFrequency: "weekly" },
  { path: "/food-trucks/", priority: 0.8, changeFrequency: "daily" },
  { path: "/list-your-business/", priority: 0.6, changeFrequency: "monthly" },
  { path: "/events/submit/", priority: 0.4, changeFrequency: "monthly" },
  { path: "/garage-sales/", priority: 0.8, changeFrequency: "daily" },
  { path: "/garage-sales/submit/", priority: 0.4, changeFrequency: "monthly" },
  { path: "/submit/", priority: 0.4, changeFrequency: "monthly" },
  { path: "/new/", priority: 0.7, changeFrequency: "daily" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  try {
    const [articles, businesses, pages, events, specials, jobs, categories, pulses] = await Promise.all([
      db.article.findMany({ where: publishedArticleWhere(), select: { slug: true, legacyPath: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 45000 }),
      db.business.findMany({ where: publicBusinessWhere(), select: { slug: true, updatedAt: true } }),
      db.page.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { slug: true, legacyPath: true, updatedAt: true } }),
      db.event.findMany({ where: upcomingEventWhere(now), select: { slug: true, updatedAt: true } }),
      db.promotion.findMany({ where: await publicPromotionWhere(now), select: { slug: true, updatedAt: true } }),
      db.job.findMany({ where: { status: "PUBLISHED", deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }, select: { slug: true, updatedAt: true } }),
      db.businessCategory.findMany({ where: { businesses: { some: publicBusinessWhere() } }, select: { slug: true } }),
      db.communityPulse.findMany({ where: publicPulseWhere({}, { includeArchived: true }), select: { slug: true, updatedAt: true, resultsUpdatedAt: true }, orderBy: { publishedAt: "desc" } }),
    ]);
    const staticPaths = new Set(STATIC_ROUTES.map((r) => r.path));
    return [
      ...STATIC_ROUTES.map((r) => ({ url: absoluteUrl(r.path), lastModified: now, changeFrequency: r.changeFrequency, priority: r.priority })),
      ...categories.map((c) => ({ url: absoluteUrl(`/businesses/?category=${c.slug}`), changeFrequency: "weekly" as const, priority: 0.6 })),
      ...businesses.map((b) => ({ url: absoluteUrl(businessHref(b)), lastModified: b.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
      ...articles.map((a) => ({ url: absoluteUrl(articleHref(a)), lastModified: a.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
      ...pages.filter((p) => !staticPaths.has(pageHref(p))).map((p) => ({ url: absoluteUrl(pageHref(p)), lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
      ...events.map((e) => ({ url: absoluteUrl(eventHref(e)), lastModified: e.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
      ...specials.map((p) => ({ url: absoluteUrl(specialHref(p)), lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
      ...pulses.map((p) => ({ url: absoluteUrl(pulseHref(p)), lastModified: p.resultsUpdatedAt && p.resultsUpdatedAt > p.updatedAt ? p.resultsUpdatedAt : p.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
      ...jobs.map((j) => ({ url: absoluteUrl(jobHref(j)), lastModified: j.updatedAt, changeFrequency: "weekly" as const, priority: 0.4 })),
      ...(await givesSitemapEntries()),
      // Explore collections: published and with at least one visible item (never empty ones).
      ...(await getPublicCollections(now)).map((c) => ({ url: absoluteUrl(collectionHref(c)), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
      // Community pages that have at least some listed content (empty ones still render, but are left out here).
      ...(await getCommunityCounts(now).then((m) => COMMUNITIES.filter((c) => hasCommunityContent(m.get(c.slug))))).map((c) => ({ url: absoluteUrl(`/communities/${c.slug}/`), changeFrequency: "daily" as const, priority: 0.7 })),
      ...(await db.businessUpdate.findMany({ where: await publicOpeningsWhere(), select: { id: true, updatedAt: true }, take: 5000 })).map((o) => ({ url: absoluteUrl(openingHref(o)), lastModified: o.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
      ...(await db.garageSale.findMany({ where: activeSaleWhere(now), select: { slug: true, updatedAt: true } })).map((g) => ({ url: absoluteUrl(garageSaleHref(g)), lastModified: g.updatedAt, changeFrequency: "daily" as const, priority: 0.5 })),
    ];
  } catch (e) {
    console.error("[sitemap]", e);
    return STATIC_ROUTES.map((r) => ({ url: absoluteUrl(r.path), lastModified: now }));
  }
}

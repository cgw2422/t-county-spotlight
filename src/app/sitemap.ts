import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { activePromotionWhere } from "@/lib/promotions";
import { upcomingEventWhere } from "@/lib/events";
import { publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { articleHref, businessHref, eventHref, jobHref, pageHref, specialHref } from "@/lib/links";
import { absoluteUrl } from "@/lib/utils";

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
  { path: "/explore/", priority: 0.5, changeFrequency: "weekly" },
  { path: "/list-your-business/", priority: 0.6, changeFrequency: "monthly" },
  { path: "/events/submit/", priority: 0.4, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  try {
    const [articles, businesses, pages, events, specials, jobs, categories] = await Promise.all([
      db.article.findMany({ where: publishedArticleWhere(), select: { slug: true, legacyPath: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 45000 }),
      db.business.findMany({ where: publicBusinessWhere(), select: { slug: true, updatedAt: true } }),
      db.page.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { slug: true, legacyPath: true, updatedAt: true } }),
      db.event.findMany({ where: upcomingEventWhere(now), select: { slug: true, updatedAt: true } }),
      db.promotion.findMany({ where: activePromotionWhere(now), select: { slug: true, updatedAt: true } }),
      db.job.findMany({ where: { status: "PUBLISHED", deletedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }, select: { slug: true, updatedAt: true } }),
      db.businessCategory.findMany({ where: { businesses: { some: publicBusinessWhere() } }, select: { slug: true } }),
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
      ...jobs.map((j) => ({ url: absoluteUrl(jobHref(j)), lastModified: j.updatedAt, changeFrequency: "weekly" as const, priority: 0.4 })),
    ];
  } catch (e) {
    console.error("[sitemap]", e);
    return STATIC_ROUTES.map((r) => ({ url: absoluteUrl(r.path), lastModified: now }));
  }
}

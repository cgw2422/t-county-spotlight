import "server-only";
import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/utils";
import { needHref, opportunityHref, orgHref } from "./constants";
import { openNeedWhere, openOpportunityWhere, publicOrgWhere } from "./queries";

/** Public T-County Gives URLs for the sitemap (never includes pledge/volunteer data). */
export async function givesSitemapEntries(): Promise<MetadataRoute.Sitemap> {
  const [orgs, needs, opps] = await Promise.all([
    db.organization.findMany({ where: publicOrgWhere(), select: { slug: true, kind: true, updatedAt: true } }),
    db.communityNeed.findMany({ where: openNeedWhere(), select: { slug: true, updatedAt: true }, take: 5000 }),
    db.volunteerOpportunity.findMany({ where: openOpportunityWhere(), select: { slug: true, updatedAt: true }, take: 5000 }),
  ]);
  const now = new Date();
  return [
    { url: absoluteUrl("/gives/"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/gives/organizations/"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/gives/needs/"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/gives/volunteer/"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/gives/register/"), lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: absoluteUrl("/churches/"), lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    ...orgs.map((o) => ({ url: absoluteUrl(orgHref(o)), lastModified: o.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...needs.map((n) => ({ url: absoluteUrl(needHref(n)), lastModified: n.updatedAt, changeFrequency: "daily" as const, priority: 0.5 })),
    ...opps.map((o) => ({ url: absoluteUrl(opportunityHref(o)), lastModified: o.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}

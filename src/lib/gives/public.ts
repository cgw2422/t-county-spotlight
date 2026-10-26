import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getUpcomingOccurrences } from "@/lib/queries";
import { activeSignupCounts, needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect, pledgedTotals, publicOrgWhere } from "./queries";

export const loadPublicOrg = cache(async (slug: string) => {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch {}
  return db.organization.findFirst({ where: publicOrgWhere({ slug: s.toLowerCase() }) });
});

/** Everything public an organization page shows below the header. No PII. */
export async function loadOrgActivity(orgId: string) {
  const [needs, opps, updates, events] = await Promise.all([
    db.communityNeed.findMany({ where: openNeedWhere({ organizationId: orgId }), select: needCardSelect, orderBy: [{ isWishList: "asc" }, { deadline: { sort: "asc", nulls: "last" } }], take: 24 }),
    db.volunteerOpportunity.findMany({ where: openOpportunityWhere({ organizationId: orgId }), select: opportunityCardSelect, orderBy: [{ startAt: { sort: "asc", nulls: "last" } }], take: 12 }),
    db.organizationUpdate.findMany({ where: { organizationId: orgId, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 6 }),
    getUpcomingOccurrences({ where: { organizationId: orgId }, limit: 6, to: new Date(Date.now() + 365 * 86400_000) }),
  ]);
  const [pledged, signups] = await Promise.all([pledgedTotals(needs.map((n) => n.id)), activeSignupCounts(opps.map((o) => o.id))]);
  return {
    needs: needs.filter((n) => !n.isWishList),
    wishList: needs.filter((n) => n.isWishList),
    opps,
    updates,
    events,
    pledged,
    signups,
  };
}

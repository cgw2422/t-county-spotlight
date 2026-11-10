import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { db } from "@/lib/db";
import { GIVES_TAGLINE } from "@/lib/gives/constants";
import { activeSignupCounts, needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect, orgCardSelect, pledgedTotals, publicOrgWhere, spotsLeft } from "@/lib/gives/queries";
import { needCityWhere, opportunityCityWhere } from "@/lib/gives";
import { SectionHeader } from "@/components/home/section-header";
import { NeedCard, OpportunityCard, OrgCard } from "./cards";

function localFirst<T extends { id: string }>(local: T[], all: T[], take: number) {
  const seen = new Set(local.map((x) => x.id));
  return [...local, ...all.filter((x) => !seen.has(x.id))].slice(0, take);
}

/**
 * Homepage "gives" section: current (non-expired) needs, upcoming volunteer
 * opportunities and featured organizations. With a chosen community, items in
 * that community (need city, else the organization's town) come first; the rest
 * of the county still fills the section. Renders nothing when empty.
 */
export async function GivesHomeSection({ title, subtitle, limit = 6, featuredIds = [], community = null }: { title: string; subtitle?: string | null; limit?: number; featuredIds?: string[]; community?: string | null }) {
  const per = Math.max(2, Math.min(6, Math.ceil(limit / 2)));
  const needOrder = [{ urgency: "desc" as const }, { deadline: { sort: "asc" as const, nulls: "last" as const } }];
  const oppOrder = [{ isOngoing: "asc" as const }, { startAt: { sort: "asc" as const, nulls: "last" as const } }];
  const [allNeeds, localNeeds, allOpps, localOpps, pinned, orgs] = await Promise.all([
    db.communityNeed.findMany({ where: openNeedWhere(), select: needCardSelect, orderBy: needOrder, take: per }),
    community ? db.communityNeed.findMany({ where: openNeedWhere(needCityWhere(community)), select: needCardSelect, orderBy: needOrder, take: per }) : Promise.resolve([]),
    db.volunteerOpportunity.findMany({ where: openOpportunityWhere(), select: opportunityCardSelect, orderBy: oppOrder, take: per }),
    community ? db.volunteerOpportunity.findMany({ where: openOpportunityWhere(opportunityCityWhere(community)), select: opportunityCardSelect, orderBy: oppOrder, take: per }) : Promise.resolve([]),
    featuredIds.length ? db.organization.findMany({ where: publicOrgWhere({ id: { in: featuredIds } }), select: orgCardSelect }) : Promise.resolve([]),
    db.organization.findMany({ where: publicOrgWhere(), select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { verifiedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }], take: 3 }),
  ]);
  const needs = localFirst(localNeeds, allNeeds, per);
  const opps = localFirst(localOpps, allOpps, per);
  const seen = new Set(pinned.map((o) => o.id));
  const featured = [...pinned, ...orgs.filter((o) => !seen.has(o.id))].slice(0, 3);
  if (!needs.length && !opps.length && !featured.length) return null;
  const [pledged, signups] = await Promise.all([pledgedTotals(needs.map((n) => n.id)), activeSignupCounts(opps.map((o) => o.id))]);
  return (
    <section className="bg-gradient-to-b from-orange-50/70 to-white py-12">
      <div className="container-page">
        <p className="eyebrow flex items-center gap-1.5"><HeartHandshake className="h-4 w-4" aria-hidden /> {GIVES_TAGLINE}</p>
        <SectionHeader title={title || "T County Gives"} subtitle={subtitle || "Local nonprofits, churches and community groups need your help."} href="/gives/" linkLabel="Explore T County Gives" />
        {needs.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Needs right now{localNeeds.length ? ` · ${community} first` : ""}</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{needs.map((n) => <NeedCard key={n.id} n={n} pledged={pledged.get(n.id)} />)}</div>
          </div>
        )}
        {opps.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Volunteer soon{localOpps.length ? ` · ${community} first` : ""}</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{opps.map((o) => <OpportunityCard key={o.id} o={o} left={spotsLeft(o.spots, signups.get(o.id) ?? 0)} />)}</div>
          </div>
        )}
        {featured.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Organizations making a difference</h3>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((o) => <OrgCard key={o.id} o={o} />)}</div>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-600">Run a nonprofit, church or community group? <Link href="/gives/register/" className="font-semibold text-brand-700 hover:underline">Register free</Link>.</p>
      </div>
    </section>
  );
}

import Link from "next/link";
import { CalendarClock, HeartHandshake, MapPin, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { GIVES_TAGLINE, NEED_CATEGORY_LABEL, needHref, opportunityHref, orgHref } from "@/lib/gives/constants";
import { orgCardSelect, publicOrgWhere } from "@/lib/gives/queries";
import { getWaysToHelp, type HelpItem } from "@/lib/gives/help";
import { endsSoonLabel, givesCity } from "@/lib/gives";
import { SectionHeader } from "@/components/home/section-header";
import { OrgCard } from "./cards";
import { UrgencyBadge, VerifiedBadge } from "./badges";

function localFirst<T extends { id: string; kind?: string }>(local: T[], all: T[], take: number) {
  const key = (x: T) => `${x.kind ?? ""}-${x.id}`;
  const seen = new Set(local.map(key));
  return [...local, ...all.filter((x) => !seen.has(key(x)))].slice(0, take);
}

/**
 * One cause on the homepage: the card links to the need / opportunity detail
 * page (stretched title link) and the "Organized by" credit links to the
 * organization's profile (churches → /churches/<slug>/ via `orgHref`).
 */
function HelpCauseCard({ item }: { item: HelpItem }) {
  const isNeed = item.kind === "need";
  const c = isNeed ? item.need : item.opp;
  const href = isNeed ? needHref(item.need) : opportunityHref(item.opp);
  const city = givesCity(c);
  const soon = isNeed ? endsSoonLabel(item.need.deadline) : !item.opp.isOngoing ? endsSoonLabel(item.opp.endAt) : null;
  const when = isNeed
    ? item.need.deadline ? `By ${formatDate(item.need.deadline, { month: "short", day: "numeric" })}` : null
    : item.opp.isOngoing ? "Ongoing" : item.opp.startAt ? formatDate(item.opp.startAt, { weekday: "short", month: "short", day: "numeric" }) : null;
  return (
    <article className="card card-hover group relative flex h-full flex-col p-4" data-testid="home-help-item" data-kind={item.kind}>
      <div className="flex flex-wrap items-center gap-1.5">
        {isNeed ? (
          <>
            <span className="badge-blue">Need · {NEED_CATEGORY_LABEL[item.need.category] ?? item.need.category}</span>
            {(item.need.urgency === "HIGH" || item.need.urgency === "CRITICAL") && <UrgencyBadge urgency={item.need.urgency} />}
          </>
        ) : (
          <span className="badge-green inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" aria-hidden />Volunteer opportunity</span>
        )}
        {soon && <span className="badge-amber">{soon}</span>}
        {!isNeed && item.left === 0 && <span className="badge-amber">Full — waitlist</span>}
      </div>
      <h4 className="mt-2 font-semibold leading-snug text-navy-900 group-hover:text-brand-700">
        <Link href={href} className="after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none">{c.title}</Link>
      </h4>
      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-slate-600" data-testid="home-help-org">
        <span className="shrink-0">Organized by</span>
        <Link href={orgHref(c.organization)} className="relative z-10 truncate font-semibold text-brand-700 hover:underline">{c.organization.name}</Link>
        {c.organization.verifiedAt && <VerifiedBadge className="relative z-10 !px-1.5 !py-0" />}
      </p>
      {(when || city) && (
        <p className="mt-auto flex flex-wrap gap-x-3 pt-3 text-sm text-slate-500">
          {when && <span className="inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" aria-hidden />{when}</span>}
          {city && <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" aria-hidden />{city}</span>}
        </p>
      )}
    </article>
  );
}

/**
 * Homepage "gives" section.
 *
 * 1. "Ways to help" — current needs (OPEN / PARTIALLY_FULFILLED, deadline not
 *    passed) and volunteer opportunities (PUBLISHED, not ended) from ANY public
 *    organization, churches included (`getWaysToHelp` → `openNeedWhere` /
 *    `openOpportunityWhere`, which require `publicOrgWhere`). Each item credits
 *    "Organized by <org>". A church listing or its service times never count —
 *    only CommunityNeed / VolunteerOpportunity rows.
 * 2. "Organizations making a difference" — nonprofits and community groups only;
 *    churches are excluded here (they have the /churches/ directory). The row is
 *    omitted when empty.
 *
 * With a chosen community, causes in that community come first; the rest of the
 * county still fills the list. Renders nothing when both parts are empty.
 */
export async function GivesHomeSection({ title, subtitle, limit = 6, featuredIds = [], community = null }: { title: string; subtitle?: string | null; limit?: number; featuredIds?: string[]; community?: string | null }) {
  const take = 2 * Math.max(2, Math.min(6, Math.ceil(limit / 2)));
  const orgWhere = (extra = {}) => publicOrgWhere({ kind: { not: "CHURCH" }, ...extra });
  const [all, local, pinned, orgs] = await Promise.all([
    getWaysToHelp({ take }),
    community ? getWaysToHelp({ city: community, take }) : Promise.resolve(null),
    featuredIds.length ? db.organization.findMany({ where: orgWhere({ id: { in: featuredIds } }), select: orgCardSelect }) : Promise.resolve([]),
    db.organization.findMany({ where: orgWhere(), select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { verifiedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }], take: 3 }),
  ]);
  const localItems = local?.items ?? [];
  const causes = localFirst(localItems, all.items, take);
  const seen = new Set(pinned.map((o) => o.id));
  const featured = [...pinned, ...orgs.filter((o) => !seen.has(o.id))].slice(0, 3);
  if (!causes.length && !featured.length) return null;
  return (
    <section className="bg-gradient-to-b from-orange-50/70 to-white py-12" data-testid="home-gives">
      <div className="container-page">
        <p className="eyebrow flex items-center gap-1.5"><HeartHandshake className="h-4 w-4" aria-hidden /> {GIVES_TAGLINE}</p>
        <SectionHeader title={title || "T County Gives"} subtitle={subtitle || "Local nonprofits, churches and community groups need your help."} href="/gives/" linkLabel="Explore T County Gives" />
        {causes.length > 0 && (
          <div data-testid="home-ways-to-help">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Ways to help{localItems.length ? ` · ${community} first` : ""}</h3>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {causes.map((i) => <li key={`${i.kind}-${i.id}`} className="flex min-w-0"><div className="w-full min-w-0"><HelpCauseCard item={i} /></div></li>)}
            </ul>
          </div>
        )}
        {featured.length > 0 && (
          <div className={causes.length ? "mt-8" : undefined} data-testid="home-gives-orgs">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Organizations making a difference</h3>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((o) => <OrgCard key={o.id} o={o} />)}</div>
          </div>
        )}
        <p className="mt-6 text-sm text-slate-600">Run a nonprofit, church or community group? <Link href="/gives/register/" className="font-semibold text-brand-700 hover:underline">Register free</Link>.</p>
      </div>
    </section>
  );
}

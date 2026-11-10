import Link from "next/link";
import { HandHelping, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { HELP_TYPES, type HelpTypeKey } from "@/lib/gives";
import type { HelpSort, getWaysToHelp } from "@/lib/gives/help";
import { COMMUNITIES, communitySlug } from "@/lib/my-t-county-shared";
import { qs } from "@/components/public/seo";
import { EmptyState } from "@/components/ui/empty-state";
import { NeedCard, OpportunityCard } from "./cards";

type Data = Awaited<ReturnType<typeof getWaysToHelp>>;

/**
 * "Ways to help" browser on /gives/: needs and volunteer opportunities together,
 * filtered by community and type. Plain GET links/forms (works without JS).
 */
export function WaysToHelp({ data, community, type, sort, myCommunity }: {
  data: Data; community: string | null; type: HelpTypeKey | null; sort: HelpSort; myCommunity: string | null;
}) {
  const href = (o: { community?: string | null; type?: string | null; sort?: string | null }) =>
    `/gives/${qs({
      community: o.community === undefined ? communitySlug(community) : o.community,
      type: o.type === undefined ? type : o.type,
      sort: (o.sort === undefined ? sort : o.sort) === "deadline" ? "deadline" : undefined,
    })}#ways-to-help`;
  const chip = (active: boolean) => cn("inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", active ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50");
  const count = (active: boolean, n: number) => <span className={active ? "text-white/70" : "text-slate-400"}>{n}</span>;
  const typeLabel = HELP_TYPES.find((t) => t.key === type)?.label;
  const needsHref = `/gives/needs/${qs({ city: community ?? undefined, sort: sort === "deadline" ? "deadline" : undefined })}`;
  const volunteerHref = `/gives/volunteer/${qs({ city: community ?? undefined })}`;

  return (
    <section id="ways-to-help" className="container-page scroll-mt-20 py-12" aria-labelledby="wth-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="wth-title" className="section-title">Ways to help{community ? ` in ${community}` : ""}</h2>
          <p className="mt-1 text-slate-600">Current needs and volunteer opportunities from local organizations. Past deadlines are hidden automatically.</p>
        </div>
      </div>

      <form action="/gives/" className="mt-5 flex flex-wrap items-end gap-3" aria-label="Filter ways to help">
        {type && <input type="hidden" name="type" value={type} />}
        <div className="w-full min-w-0 sm:w-auto">
          <label htmlFor="wth-community" className="label">Community</label>
          <select id="wth-community" name="community" defaultValue={communitySlug(community) ?? ""} className="input sm:w-64">
            <option value="">All of Tuscarawas County</option>
            {COMMUNITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div className="min-w-0 flex-1 sm:flex-none">
          <label htmlFor="wth-sort" className="label">Sort</label>
          <select id="wth-sort" name="sort" defaultValue={sort} className="input sm:w-56">
            <option value="urgency">Most urgent first</option>
            <option value="deadline">Ending soonest</option>
          </select>
        </div>
        <button className="btn-primary">Show</button>
        {myCommunity && community !== myCommunity && (
          <Link href={href({ community: communitySlug(myCommunity) })} className="btn-ghost"><MapPin className="h-4 w-4" aria-hidden /> Only {myCommunity}</Link>
        )}
      </form>

      <nav aria-label="Ways to help by type" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <ul className="flex gap-2 pb-1 sm:flex-wrap">
          <li><Link href={href({ type: null })} aria-current={!type ? "page" : undefined} className={chip(!type)}>All {count(!type, data.total)}</Link></li>
          {HELP_TYPES.map((t) => (
            <li key={t.key}><Link href={href({ type: t.key })} aria-current={type === t.key ? "page" : undefined} className={chip(type === t.key)}>{t.label} {count(type === t.key, data.counts[t.key])}</Link></li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        {data.items.length ? (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((i) => (
              <li key={`${i.kind}-${i.id}`} className="flex">
                <div className="w-full">{i.kind === "need" ? <NeedCard n={i.need} pledged={i.pledged} /> : <OpportunityCard o={i.opp} left={i.left} />}</div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={HandHelping} title={`No current ${typeLabel ? typeLabel.toLowerCase() : "needs or volunteer opportunities"}${community ? ` in ${community}` : ""}`}>
            {community || type ? (
              <>Nothing is listed for that right now. <Link href={href({ community: null, type: null })} className="font-semibold text-brand-700">See everything across T County</Link>.</>
            ) : (
              <>Local organizations post needs and volunteer shifts here as they come up. Run one? <Link href="/gives/register/" className="font-semibold text-brand-700">Register for free</Link>.</>
            )}
          </EmptyState>
        )}
        {data.matching > data.items.length && (
          <p className="mt-4 text-sm text-slate-600">
            Showing {data.items.length} of {data.matching}.{" "}
            {type !== "volunteer" && <Link href={needsHref} className="font-semibold text-brand-700 hover:underline">See all needs</Link>}
            {!type && " · "}
            {(!type || type === "volunteer") && <Link href={volunteerHref} className="font-semibold text-brand-700 hover:underline">See all volunteer opportunities</Link>}
          </p>
        )}
      </div>
    </section>
  );
}

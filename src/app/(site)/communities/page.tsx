import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, MapPin } from "lucide-react";
import { COMMUNITIES, getCommunityCounts } from "@/lib/communities";
import { getCommunityPreference } from "@/lib/my-t-county";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata } from "@/components/public/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Explore Your Community",
    description: "Community pages for every town in Tuscarawas County, Ohio: events, food trucks, garage sales, local businesses, churches, nonprofits and news.",
    path: "/communities/",
  });
}

function countLine(c: { events: number; businesses: number }) {
  const parts: string[] = [];
  if (c.events > 0) parts.push(`${c.events} upcoming ${c.events === 1 ? "event" : "events"}`);
  if (c.businesses > 0) parts.push(`${c.businesses} ${c.businesses === 1 ? "business" : "businesses"}`);
  return parts.join(" · ");
}

function Item({ slug, name, counts, mine }: { slug: string; name: string; counts: Map<string, { events: number; businesses: number }>; mine: boolean }) {
  const line = countLine(counts.get(slug) ?? { events: 0, businesses: 0 });
  return (
    <li>
      <Link href={`/communities/${slug}/`} className="card card-hover flex h-full min-h-16 items-center gap-3 p-4" data-testid={`community-${slug}`}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-navy-900"><MapPin className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-navy-900">{name}{mine && <span className="badge-green ml-2 align-middle">Your community</span>}</span>
          {line && <span className="block truncate text-xs text-slate-500">{line}</span>}
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      </Link>
    </li>
  );
}

export default async function CommunitiesPage() {
  const [counts, pref] = await Promise.all([getCommunityCounts(), getCommunityPreference()]);
  const main = COMMUNITIES.filter((c) => c.main);
  const other = COMMUNITIES.filter((c) => !c.main);

  return (
    <>
      <PageHeader
        eyebrow="Explore"
        title="Explore Your Community"
        subtitle="Every town in Tuscarawas County has its own page with events, food trucks, garage sales, local businesses, churches, nonprofits and news."
        crumbs={[{ label: "Explore", href: "/explore/" }, { label: "Communities" }]}
      />
      <div className="container-page space-y-10 py-8 sm:py-10">
        <section aria-labelledby="main-towns">
          <h2 id="main-towns" className="section-title">Main towns</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{main.map((c) => <Item key={c.slug} slug={c.slug} name={c.name} counts={counts} mine={pref.community === c.name} />)}</ul>
        </section>
        <section aria-labelledby="other-towns">
          <h2 id="other-towns" className="section-title">Villages & other communities</h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{other.map((c) => <Item key={c.slug} slug={c.slug} name={c.name} counts={counts} mine={pref.community === c.name} />)}</ul>
        </section>
      </div>
    </>
  );
}

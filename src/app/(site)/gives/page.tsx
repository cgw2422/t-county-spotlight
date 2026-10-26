import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Church, HandHelping, HeartHandshake, Search, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { GIVES_TAGLINE } from "@/lib/gives/constants";
import { activeSignupCounts, givesStats, needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect, orgCardSelect, pledgedTotals, publicOrgWhere, spotsLeft } from "@/lib/gives/queries";
import { NeedCard, OpportunityCard, OrgCard } from "@/components/gives/cards";
import { SectionHeader } from "@/components/home/section-header";
import { buildMetadata } from "@/components/public/seo";
import { Breadcrumbs } from "@/components/public/breadcrumbs";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: `T-County Gives — ${GIVES_TAGLINE}`,
    description: "Support Tuscarawas County nonprofits, churches and community groups. See urgent needs, pledge supplies, find volunteer opportunities and donate directly.",
    path: "/gives/",
  });
}

export default async function GivesLanding() {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400_000);
  const [stats, urgent, thisWeek, featured, causes] = await Promise.all([
    givesStats(),
    db.communityNeed.findMany({ where: openNeedWhere({ urgency: { in: ["CRITICAL", "HIGH"] } }), select: needCardSelect, orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { urgency: "desc" }], take: 6 }),
    db.volunteerOpportunity.findMany({ where: openOpportunityWhere({ OR: [{ startAt: { lte: weekEnd } }, { isOngoing: true }] }), select: opportunityCardSelect, orderBy: [{ isOngoing: "asc" }, { startAt: { sort: "asc", nulls: "last" } }], take: 6 }),
    db.organization.findMany({ where: publicOrgWhere(), select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { verifiedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }], take: 6 }),
    db.organization.groupBy({ by: ["orgType"], where: publicOrgWhere({ orgType: { not: null }, kind: { not: "CHURCH" } }), _count: { _all: true }, orderBy: { _count: { orgType: "desc" } }, take: 16 }),
  ]);
  const [pledged, signups] = await Promise.all([pledgedTotals(urgent.map((n) => n.id)), activeSignupCounts(thisWeek.map((o) => o.id))]);
  const statItems = [
    { n: stats.orgs, label: stats.orgs === 1 ? "nonprofit & group" : "nonprofits & groups", href: "/gives/organizations/", icon: Building2 },
    { n: stats.churches, label: stats.churches === 1 ? "church" : "churches", href: "/churches/", icon: Church },
    { n: stats.needs, label: stats.needs === 1 ? "open need" : "open needs", href: "/gives/needs/", icon: HandHelping },
    { n: stats.opportunities, label: stats.opportunities === 1 ? "volunteer opportunity" : "volunteer opportunities", href: "/gives/volunteer/", icon: UsersRound },
  ].filter((s) => s.n > 0);
  const empty = !urgent.length && !thisWeek.length && !featured.length;

  return (
    <>
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(247,162,75,0.45),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(47,123,240,0.4),transparent_60%)]" />
        <div className="container-page relative py-12 sm:py-16 lg:py-20">
          <Breadcrumbs items={[{ label: "T-County Gives" }]} invert className="mb-6" />
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-sunset-400"><HeartHandshake className="h-4 w-4" aria-hidden /> T-County Gives</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight text-balance sm:text-5xl lg:text-6xl">{GIVES_TAGLINE}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/85">Nonprofits, churches and community groups across Tuscarawas County share what they need. You choose how to help.</p>
          <form action="/gives/organizations/" role="search" className="mt-8 flex max-w-2xl items-center gap-2 rounded-xl bg-white p-1.5 shadow-lg">
            <label htmlFor="gives-q" className="sr-only">Search causes and organizations</label>
            <Search className="ml-2 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <input id="gives-q" name="q" type="search" placeholder="Food pantry, animal rescue, church…" className="min-h-11 w-full min-w-0 bg-transparent px-1 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none" />
            <button className="btn-accent shrink-0">Search</button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/gives/needs/" className="btn border border-white/30 text-white hover:bg-white/10"><HandHelping className="h-4 w-4" aria-hidden /> Meet a need</Link>
            <Link href="/gives/volunteer/" className="btn border border-white/30 text-white hover:bg-white/10"><UsersRound className="h-4 w-4" aria-hidden /> Volunteer</Link>
            <Link href="/churches/" className="btn border border-white/30 text-white hover:bg-white/10"><Church className="h-4 w-4" aria-hidden /> Find a church</Link>
          </div>
          {statItems.length > 0 && (
            <ul className="mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {statItems.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="block rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 transition hover:bg-white/15">
                    <s.icon className="h-5 w-5 text-sunset-400" aria-hidden />
                    <span className="mt-2 block text-3xl font-bold tabular-nums">{s.n.toLocaleString()}</span>
                    <span className="block text-sm text-white/80">{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {urgent.length > 0 && (
        <section className="container-page py-12">
          <SectionHeader title="Urgent needs" subtitle="High-priority requests from local organizations — the soonest deadlines first." href="/gives/needs/" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{urgent.map((n) => <NeedCard key={n.id} n={n} pledged={pledged.get(n.id)} />)}</div>
          <p className="mt-4 text-sm"><Link href="/gives/needs/" className="font-semibold text-brand-700 hover:underline">See every open need →</Link></p>
        </section>
      )}

      {thisWeek.length > 0 && (
        <section className="bg-slate-50 py-12">
          <div className="container-page">
            <SectionHeader title="Volunteer this week" subtitle="Shifts and projects happening soon, plus ongoing ways to help." href="/gives/volunteer/" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{thisWeek.map((o) => <OpportunityCard key={o.id} o={o} left={spotsLeft(o.spots, signups.get(o.id) ?? 0)} />)}</div>
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section className="container-page py-12">
          <SectionHeader title="Organizations making a difference" subtitle="Nonprofits, churches and community groups serving Tuscarawas County." href="/gives/organizations/" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{featured.map((o) => <OrgCard key={o.id} o={o} />)}</div>
        </section>
      )}

      {causes.length > 0 && (
        <section className="container-page pb-12">
          <h2 className="section-title">Browse by cause</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {causes.filter((c) => c.orgType).map((c) => (
              <li key={c.orgType}>
                <Link href={`/gives/organizations/?type=${encodeURIComponent(c.orgType!)}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-orange-50 hover:ring-sunset-400">
                  {c.orgType} <span className="text-slate-400">{c._count._all}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty && (
        <section className="container-page py-12">
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
            <HeartHandshake className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
            <p className="mt-3 font-semibold text-slate-800">T-County Gives is just getting started</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Local organizations are joining now. Check back soon for needs, volunteer opportunities and ways to help.</p>
          </div>
        </section>
      )}

      <section className="container-page pb-14">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sunset-500 to-sunset-600 px-6 py-10 text-white sm:px-12 sm:py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-display text-3xl font-semibold">Is your organization listed?</h2>
              <p className="mt-2 max-w-xl text-white/90">Nonprofits, churches and community groups join T-County Gives for free — always. Share your needs, find volunteers and promote your events.</p>
            </div>
            <Link href="/gives/register/" className="btn shrink-0 bg-white text-base text-navy-900 hover:bg-orange-50">Register free <ArrowRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>
    </>
  );
}

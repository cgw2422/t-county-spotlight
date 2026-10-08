import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, CalendarDays, ChevronRight, Star, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { publicBusinessWhere } from "@/lib/queries";
import { ExploreGrid } from "@/components/home/explore-grid";
import { SearchBox } from "@/components/public/search-box";
import { buildMetadata } from "@/components/public/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: "Explore T-County", description: "Find local businesses, events, specials, jobs and stories across Tuscarawas County, Ohio.", path: "/explore/" });
}

const QUICK = [
  { href: "/events/?when=weekend", label: "This weekend", desc: "Events Fri–Sun", icon: CalendarDays, color: "bg-red-50 text-red-600" },
  { href: "/specials/", label: "Specials", desc: "Deals & coupons", icon: Tag, color: "bg-orange-50 text-orange-600" },
  { href: "/spotlights/", label: "Spotlights", desc: "Local stories", icon: Star, color: "bg-amber-50 text-amber-600" },
  { href: "/jobs/", label: "Jobs", desc: "Work local", icon: Briefcase, color: "bg-sky-50 text-sky-700" },
];

export default async function ExplorePage() {
  const categories = await db.businessCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, _count: { select: { businesses: { where: publicBusinessWhere() } } } },
  });
  return (
    <>
      <div className="bg-gradient-to-br from-navy-900 to-navy-700">
        <div className="container-page py-8 sm:py-12">
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Explore T-County</h1>
          <p className="mt-1 text-white/80">Businesses, events, deals and stories — all in one place.</p>
          <div className="mt-5 max-w-2xl"><SearchBox action="/search/" placeholder="Search businesses, events, stories…" label="Search T-County" id="explore-q" size="lg" /></div>
        </div>
      </div>

      <section aria-labelledby="quick-title" className="container-page pt-8">
        <h2 id="quick-title" className="sr-only">Quick links</h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {QUICK.map(({ href, label, desc, icon: Icon, color }) => (
            <li key={href}>
              <Link href={href} className="card card-hover flex h-full items-center gap-3 p-4">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0"><span className="block font-semibold text-navy-900">{label}</span><span className="block truncate text-xs text-slate-500">{desc}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ExploreGrid title="Explore by topic" />

      <section aria-labelledby="cats-title" className="container-page pb-6">
        <h2 id="cats-title" className="section-title">Business categories</h2>
        <ul className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.id} className="sm:border-b sm:border-slate-100">
              <Link href={`/businesses/?category=${c.slug}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                <span className="font-medium text-navy-900">{c.name}</span>
                <span className="flex items-center gap-1 text-sm text-slate-500">{c._count.businesses > 0 ? c._count.businesses : ""}<ChevronRight className="h-4 w-4" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-slate-600">Don&rsquo;t see your business? <Link href="/list-your-business/" className="font-semibold text-brand-700">Add your free listing</Link>.</p>
      </section>
    </>
  );
}

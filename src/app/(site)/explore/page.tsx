import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, CalendarDays, ChevronRight, MapPinned, MessagesSquare, Send, ShoppingBag, Sparkles, Star, Tag, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { publicBusinessWhere } from "@/lib/queries";
import { ExploreGrid } from "@/components/home/explore-grid";
import { SearchBox } from "@/components/public/search-box";
import { buildMetadata } from "@/components/public/seo";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { getPublicCollections } from "@/lib/explore-collections";
import { CollectionCard } from "@/components/explore/collection-cards";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: "Explore T County", description: "Find local businesses, events, specials, jobs and stories across Tuscarawas County, Ohio.", path: "/explore/" });
}

const QUICK = [
  { href: "/events/?when=weekend", label: "This weekend", desc: "Events Fri–Sun", icon: CalendarDays, color: "bg-red-50 text-red-600" },
  { href: "/specials/", label: "Specials", desc: "Deals & coupons", icon: Tag, color: "bg-orange-50 text-orange-600" },
  { href: "/spotlights/", label: "Spotlights", desc: "Local stories", icon: Star, color: "bg-amber-50 text-amber-600" },
  { href: "/jobs/", label: "Jobs", desc: "Work local", icon: Briefcase, color: "bg-sky-50 text-sky-700" },
  { href: "/food-trucks/", label: "Food Trucks", desc: "Where trucks are serving", icon: Truck, color: "bg-brand-50 text-navy-900" },
  { href: "/garage-sales/", label: "Garage Sales", desc: "Yard & rummage sales", icon: ShoppingBag, color: "bg-hillside-50 text-hillside-700" },
  { href: "/communities/", label: "Communities", desc: "Your town's page", icon: MapPinned, color: "bg-sky-50 text-navy-900" },
  { href: "/new/", label: "New & Coming Soon", desc: "Openings & moves", icon: Sparkles, color: "bg-orange-50 text-sunset-600" },
  { href: "/submit/", label: "Share something", desc: "Events, sales & more", icon: Send, color: "bg-orange-50 text-sunset-600" },
];

export default async function ExplorePage() {
  const [categories, collections] = await Promise.all([
    db.businessCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, _count: { select: { businesses: { where: publicBusinessWhere() } } } },
    }),
    // Only published collections with at least one visible item (never empty ones).
    getPublicCollections(),
  ]);
  return (
    <>
      <div className="bg-gradient-to-br from-navy-900 to-navy-700">
        <div className="container-page py-8 sm:py-12">
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Explore T County</h1>
          <p className="mt-1 text-white/80">Businesses, events, deals and stories — all in one place.</p>
          <div className="mt-5 max-w-2xl"><SearchBox action="/search/" placeholder="Search businesses, events, stories…" label="Search T County" id="explore-q" size="lg" /></div>
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

      <section aria-label="Community Pulse" className="container-page pt-4">
        <Link href="/community-pulse/" className="card card-hover flex items-center gap-4 p-4 sm:p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-hillside-50 text-hillside-700"><MessagesSquare className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-navy-900">Community Pulse</span>
            <span className="block text-sm text-slate-600">Local favorites, recommendations and conversations from across Tuscarawas County.</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        </Link>
      </section>

      {collections.length > 0 && (
        <section aria-labelledby="collections-title" className="container-page pt-10" data-testid="explore-collections">
          <h2 id="collections-title" className="section-title">Collections</h2>
          <p className="mt-1 text-slate-600">Hand-picked places, events and local favorites across Tuscarawas County.</p>
          <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => <li key={c.id}><CollectionCard c={c} /></li>)}
          </ul>
        </section>
      )}

      <ExploreGrid title="Explore by topic" />

      <section aria-label="T County Connect Weekly newsletter" className="container-page pb-10">
        <NewsletterSignup source="pwa" variant="card" />
      </section>

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

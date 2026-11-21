import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, CalendarDays, ChevronRight, Church, Clock, HeartHandshake, Lightbulb, MapPin, Newspaper, Search, Sparkles, Store, ThumbsUp } from "lucide-react";
import { buildMetadata } from "@/components/public/seo";
import { ADD_YOUR_BUSINESS_PATH, RECOMMEND_PATH } from "@/lib/business-leads-shared";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getUpgradeableListings, membershipTabPath } from "@/lib/membership-eligibility";
import { decodePlainText } from "@/lib/text";

export const dynamic = "force-dynamic";

const INTRO = "Help local customers discover your business. Join our growing directory of Tuscarawas County businesses and make it easier for residents to find what you offer.";

export async function generateMetadata(): Promise<Metadata> {
  // buildMetadata sets the canonical URL (https://tcountyconnect.com/add-your-business/) and Open Graph tags.
  return buildMetadata({ title: "Get Your Business Listed", description: INTRO, path: ADD_YOUR_BUSINESS_PATH });
}

/** What a free listing gives a business — every point is something the free listing actually includes. */
const BENEFITS = [
  { icon: Search, title: "Get found by local customers", text: "Appear in the T County Connect business directory and search, organized by category and community." },
  { icon: MapPin, title: "Everything in one place", text: "Your hours, phone, website, directions and photos, easy to find on any phone." },
  { icon: CalendarDays, title: "Promote your events", text: "Add your events to the Tuscarawas County community calendar." },
  { icon: ThumbsUp, title: "Earn local recommendations", text: "Residents can recommend your business with a thumbs-up for others to see." },
] as const;

/** Nonprofits and churches share one registration form; ?kind= preselects the type. */
const CARDS = [
  { key: "business", icon: Store, title: "Business", text: "Share your hours, contact information, photos, and what makes your business worth visiting.", href: "/list-your-business/", cta: "List Your Business for Free" },
  { key: "nonprofit", icon: HeartHandshake, title: "Nonprofit", text: "Help residents discover your mission, find volunteer opportunities, and see how they can support your work. Nonprofit listings are always free.", href: "/gives/register/?kind=nonprofit", cta: "List Your Nonprofit for Free" },
  { key: "church", icon: Church, title: "Church", text: "Share your service times, location, ministries, and community outreach. Church listings are always free.", href: "/gives/register/?kind=church", cta: "List Your Church for Free" },
] as const;

/**
 * "Get Your Business Listed" at /add-your-business/ (/memberships/ 301-redirects here). Not a pricing page: the public offer is a free
 * listing for businesses, nonprofits and churches. Paid plans and prices are never shown here — optional upgrades
 * live in each approved listing's Membership dashboard tab, and owners of approved listings get a quiet link to it.
 */
export default async function AddYourBusinessPage() {
  const [settings, user] = await Promise.all([getSettings(), getCurrentUser()]);
  const [upgradeable, pending] = user
    ? await Promise.all([
        getUpgradeableListings(user.id),
        db.businessApplication.findMany({ where: { userId: user.id, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, businessName: true } }),
      ])
    : [[], []];

  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="container-page pb-20 pt-14 text-center sm:pb-24 sm:pt-20">
          <h1 className="font-display text-4xl font-bold text-balance sm:text-5xl">Get Your Business Listed on T County Connect</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200" data-testid="get-listed-intro">{INTRO}</p>
          <p className="mt-4 text-xl font-semibold text-sunset-400 sm:text-2xl" data-testid="get-listed-tagline">Free to list. Free to stay listed.</p>
          <p className="mt-1 text-sm text-slate-300">No credit card or paid membership is required.</p>
        </div>
      </section>

      <div className="container-page -mt-12 pb-12 sm:-mt-14">
        {/* Lead with what a listing does for a business. */}
        <section aria-labelledby="why-listed" className="mx-auto mb-12 max-w-6xl rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200 sm:p-8" data-testid="listing-benefits">
          <h2 id="why-listed" className="font-display text-2xl font-bold text-navy-900">Why get listed?</h2>
          <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3 lg:flex-col">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hillside-50 text-hillside-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <span><span className="block font-semibold text-navy-900">{title}</span><span className="mt-0.5 block text-sm text-slate-600">{text}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mx-auto mb-5 max-w-6xl text-center">
          <h2 className="font-display text-2xl font-bold text-navy-900 sm:text-3xl">Choose your listing</h2>
          <p className="mt-2 text-slate-600" data-testid="free-for-orgs">Every listing starts free. <strong className="text-navy-900">Churches and nonprofits are always listed free.</strong></p>
        </div>
        {/* Three equal cards in one row on desktop; stacked on narrow screens. Buttons are pinned to the bottom of each card. */}
        <ul className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3" data-testid="get-listed-cards">
          {CARDS.map(({ key, icon: Icon, title, text, href, cta }) => (
            <li key={key} className="flex flex-col rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200 sm:p-7" data-testid={`get-listed-${key}`}>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-navy-800 text-white"><Icon className="h-6 w-6" aria-hidden /></span>
              <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">{title}</h2>
              <p className="mt-2 flex-1 text-slate-700">{text}</p>
              <Link href={href} className="btn-primary mt-6 min-h-12 w-full text-base" data-testid={`get-listed-${key}-button`}>{cta}</Link>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-6 max-w-6xl space-y-4">
          <p className="flex items-center justify-center gap-2 text-center text-sm text-slate-600" data-testid="get-listed-claim">
            <Search className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
            <span>Already listed? <Link href="/businesses/" className="font-semibold text-brand-700 underline-offset-2 hover:underline">Find your listing in the directory.</Link></span>
          </p>
          <p className="flex items-center justify-center gap-2 text-center text-sm text-slate-600" data-testid="add-business-recommend">
            <Lightbulb className="h-4 w-4 shrink-0 text-sunset-600" aria-hidden />
            <span>Not your business? <Link href={RECOMMEND_PATH} className="font-semibold text-brand-700 underline-offset-2 hover:underline">Recommend a Business</Link> you&apos;d love to see listed.</span>
          </p>

          {pending.map((a) => (
            <p key={a.id} className="mx-auto flex max-w-3xl items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="memberships-approval-pending">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <span><strong>Business approval pending</strong> for {decodePlainText(a.businessName)}. We&apos;ll email you when your free listing is live. <Link href="/my-t-county/" className="font-semibold underline">View in My T County</Link></span>
            </p>
          ))}

          {/* Approved owners only: a quiet link to their listing's Membership tab — no plans or prices here. */}
          {upgradeable.length > 0 && (
            <div className="mx-auto max-w-3xl rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200" data-testid="upgrade-your-listing">
              <p className="flex items-center gap-2"><Sparkles className="h-4 w-4 shrink-0 text-sunset-500" aria-hidden /> Want to add more photos, list your services, or post more events? Optional upgrades are in your business dashboard.</p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {upgradeable.map((b) => (
                  <li key={b.id}>
                    <Link href={membershipTabPath(b.id)} className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 hover:underline" data-testid="upgrade-link">
                      {upgradeable.length === 1 ? "View membership options" : `Membership options for ${decodePlainText(b.name)}`}<ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section className="container-page pb-12">
        <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
          {[
            { icon: Newspaper, title: "Editorial is never for sale", text: "Listings never buy news coverage or a Business Spotlight story. Our editors choose those independently." },
            { icon: BadgeCheck, title: "Sponsored is always labeled", text: `Any paid placement is clearly marked “${settings.sponsoredLabel}” so readers always know.` },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl bg-cream p-5">
              <Icon className="h-6 w-6 text-sunset-600" aria-hidden />
              <h2 className="mt-3 font-semibold text-navy-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-slate-600">
          Questions? {settings.contactEmail ? <a href={`mailto:${settings.contactEmail}`} className="font-semibold text-brand-700 hover:underline">Email us</a> : <Link href="/contact/" className="font-semibold text-brand-700 hover:underline">Contact us</Link>} — we&apos;re happy to help.
        </p>
      </section>
    </>
  );
}

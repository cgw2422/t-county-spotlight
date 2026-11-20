import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronRight, Church, Clock, HeartHandshake, Newspaper, Search, Sparkles, Store } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getUpgradeableListings, membershipTabPath } from "@/lib/membership-eligibility";
import { decodePlainText } from "@/lib/text";

export const metadata: Metadata = {
  title: "Get Listed",
  description: "Free to list. Free to stay listed. Help people across Tuscarawas County find your business, nonprofit, or church.",
};
export const dynamic = "force-dynamic";

/** Nonprofits and churches share one registration form; ?kind= preselects the type. */
const CARDS = [
  { key: "business", icon: Store, title: "Business", text: "Share your hours, contact information, photos, and what makes your business worth visiting.", href: "/list-your-business/", cta: "List Your Business for Free" },
  { key: "nonprofit", icon: HeartHandshake, title: "Nonprofit", text: "Help residents discover your mission, find volunteer opportunities, and see how they can support your work.", href: "/gives/register/?kind=nonprofit", cta: "List Your Nonprofit for Free" },
  { key: "church", icon: Church, title: "Church", text: "Share your service times, location, ministries, and community outreach.", href: "/gives/register/?kind=church", cta: "List Your Church for Free" },
] as const;

/**
 * "Get Listed" (URL kept as /memberships/ so existing links work). Not a pricing page: the public offer is a free
 * listing for businesses, nonprofits and churches. Paid plans and prices are never shown here — optional upgrades
 * live in each approved listing's Membership dashboard tab, and owners of approved listings get a quiet link to it.
 */
export default async function GetListedPage() {
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
          <h1 className="font-display text-4xl font-semibold text-balance sm:text-5xl">Get Listed on T County Connect</h1>
          <p className="mt-4 text-xl font-semibold text-sunset-400 sm:text-2xl" data-testid="get-listed-tagline">Free to list. Free to stay listed.</p>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-200" data-testid="get-listed-intro">Help people across Tuscarawas County find your business, nonprofit, or church. No credit card or paid membership is required.</p>
        </div>
      </section>

      <div className="container-page -mt-12 pb-12 sm:-mt-14">
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

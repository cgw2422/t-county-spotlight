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
        <div className="container-page py-14 text-center sm:py-20">
          <h1 className="font-display text-4xl font-semibold text-balance sm:text-5xl">Get Listed on T County Connect</h1>
          <p className="mt-4 text-xl font-semibold text-sunset-400 sm:text-2xl" data-testid="get-listed-tagline">Free to list. Free to stay listed.</p>
          <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-200">Help people across Tuscarawas County find your business, nonprofit, or church.</p>
        </div>
      </section>

      <div className="container-page -mt-8 pb-12 sm:-mt-10">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Main action: the business application (existing Sign In / Create a Free Account flow). */}
          <section aria-labelledby="list-business" className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200 sm:p-8" data-testid="get-listed-business">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-navy-800 text-white"><Store className="h-6 w-6" aria-hidden /></span>
            <h2 id="list-business" className="mt-4 font-display text-2xl font-semibold text-navy-900 sm:text-3xl">List Your Business</h2>
            <p className="mt-3 text-lg text-slate-700">
              Create a free business profile with your contact details, hours, photos, and more. Your standard listing stays free after approval. No credit card or paid membership is required.
            </p>
            <Link href="/list-your-business/" className="btn-primary mt-6 min-h-12 w-full px-6 text-base sm:w-auto" data-testid="list-free-button">List Your Business for Free</Link>
            <p className="mt-6 flex gap-3 border-t border-slate-100 pt-5 text-slate-700" data-testid="get-listed-claim">
              <Search className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <span>
                <strong className="text-navy-900">Already listed?</strong>{" "}
                <Link href="/businesses/" className="font-semibold text-brand-700 underline-offset-2 hover:underline">Find your business in the directory</Link>{" "}
                and claim it if it hasn&apos;t been claimed yet.
              </span>
            </p>
          </section>

          {pending.map((a) => (
            <p key={a.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="memberships-approval-pending">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <span><strong>Business approval pending</strong> for {decodePlainText(a.businessName)}. We&apos;ll email you when your free listing is live. <Link href="/my-t-county/" className="font-semibold underline">View in My T County</Link></span>
            </p>
          ))}

          {/* Approved owners only: a quiet link to their listing's Membership tab — no plans or prices here. */}
          {upgradeable.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200" data-testid="upgrade-your-listing">
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

          {/* Nonprofits and churches share one registration form (the type is chosen in the form). */}
          <section aria-labelledby="list-org" className="rounded-3xl bg-white p-6 ring-1 ring-slate-200 sm:p-8" data-testid="get-listed-org">
            <span className="flex gap-2" aria-hidden>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-hillside-600 text-white"><HeartHandshake className="h-6 w-6" /></span>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-hillside-600 text-white"><Church className="h-6 w-6" /></span>
            </span>
            <h2 id="list-org" className="mt-4 font-display text-2xl font-semibold text-navy-900">List Your Nonprofit or Church</h2>
            <p className="mt-3 text-slate-700">Help residents find your organization, learn what you do, and get involved. Nonprofit and church listings are free too.</p>
            <Link href="/gives/register/" className="btn-secondary mt-6 min-h-12 w-full px-6 text-base sm:w-auto" data-testid="list-org-button">List Your Nonprofit or Church</Link>
          </section>
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

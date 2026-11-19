import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, Check, ChevronRight, Church, Clock, HeartHandshake, Newspaper, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { getUpgradeableListings, membershipTabPath } from "@/lib/membership-eligibility";
import { decodePlainText } from "@/lib/text";

export const metadata: Metadata = {
  title: "List your business free",
  description: "Every Tuscarawas County business can have a free T County Connect listing.",
};
export const dynamic = "force-dynamic";

const DEFAULT_FREE_FEATURES = ["Business profile and contact details", "Gallery photos", "Business description", "Event listings"];

/**
 * Public page (URL kept as /memberships/). The public offer is the FREE business listing only:
 * paid plans, prices and upgrade buttons live in each approved listing's Membership tab.
 * Signed-in owners of approved listings get a direct link to that tab (or a choice, if they own several).
 */
export default async function MembershipsPage() {
  const [freePlan, settings, user] = await Promise.all([
    db.membershipPlan.findFirst({ where: { isPublic: true, interval: "FREE" }, orderBy: { sortOrder: "asc" }, select: { name: true, description: true, features: true } }),
    getSettings(),
    getCurrentUser(),
  ]);
  const [upgradeable, pending] = user
    ? await Promise.all([
        getUpgradeableListings(user.id),
        db.businessApplication.findMany({ where: { userId: user.id, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, businessName: true } }),
      ])
    : [[], []];
  const features = freePlan?.features.length ? freePlan.features : DEFAULT_FREE_FEATURES;
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="container-page py-14 text-center sm:py-20">
          <p className="eyebrow text-sunset-400">For local businesses</p>
          <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">List Your Business for Free</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200">{settings.membershipIntro}</p>
          <p className="mx-auto mt-2 max-w-2xl text-slate-300">Every Tuscarawas County business can have a free listing on T County Connect.</p>
        </div>
      </section>

      <section className="container-page -mt-8 pb-4 sm:-mt-10">
        <div className="mx-auto grid max-w-3xl gap-5">
          {upgradeable.length > 0 && (
            <article className="card border-2 border-brand-200 p-6" data-testid="upgrade-your-listing">
              <p className="flex items-center gap-2 font-semibold text-navy-900"><Sparkles className="h-5 w-5 text-sunset-500" aria-hidden /> {upgradeable.length === 1 ? "Upgrade your listing" : "Upgrade one of your listings"}</p>
              <p className="mt-1 text-sm text-slate-600">Want to add more photos, list your services, or post more events? See the membership options for {upgradeable.length === 1 ? "your listing" : "the listing you choose"}.</p>
              {upgradeable.length === 1 ? (
                <Link href={membershipTabPath(upgradeable[0].id)} className="btn-primary mt-4" data-testid="upgrade-link">View membership options for {decodePlainText(upgradeable[0].name)}</Link>
              ) : (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {upgradeable.map((b) => (
                    <li key={b.id}>
                      <Link href={membershipTabPath(b.id)} className="flex min-h-12 items-center justify-between gap-2 rounded-xl px-4 py-2 font-semibold text-navy-900 ring-1 ring-slate-200 hover:bg-slate-50" data-testid="upgrade-link">
                        <span className="min-w-0 truncate">{decodePlainText(b.name)}</span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {pending.map((a) => (
            <p key={a.id} className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="memberships-approval-pending">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
              <span><strong>Business approval pending</strong> for {decodePlainText(a.businessName)}. We&apos;ll email you when your free listing is live. <Link href="/my-t-county/" className="font-semibold underline">View in My T County</Link></span>
            </p>
          ))}

          <article className="card flex flex-col p-6 sm:p-8" data-testid="free-listing-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-semibold text-navy-900">Free Business Listing</h2>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">Free</span>
            </div>
            {freePlan?.description && <p className="mt-3 text-slate-600">{freePlan.description}</p>}
            <ul className="mt-5 grid gap-2.5 text-slate-700 sm:grid-cols-2">
              {features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />{f}</li>)}
            </ul>
            <div className="mt-6">
              <Link href="/list-your-business/" className="btn-primary w-full sm:w-auto" data-testid="list-free-button">List Your Business for Free</Link>
            </div>
            <p className="mt-3 text-sm text-slate-500">Sign in or create a free account to apply. Our team reviews every listing, usually within a couple of business days.</p>
          </article>
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-slate-600">
          Eligible churches and nonprofits participate free.{" "}
          <a href="#giving-back" className="font-semibold text-brand-700 hover:underline">See Giving Back to T County</a>
        </p>
      </section>

      <section id="giving-back" aria-labelledby="giving-back-title" className="mt-12 scroll-mt-24 border-y border-brand-100 bg-brand-50/60">
        <div className="container-page py-14 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">T County Gives</p>
            <h2 id="giving-back-title" className="mt-2 font-display text-3xl font-semibold text-navy-900 sm:text-4xl">Giving Back to T County</h2>
            <p className="mt-3 text-lg text-slate-600">Supporting the organizations that make our community stronger.</p>
          </div>
          <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
            {[
              {
                icon: HeartHandshake,
                title: "Nonprofit Organizations",
                text: "Share your mission, events, volunteer opportunities, wish lists, and community needs with neighbors across Tuscarawas County.",
                href: "/gives/register/?kind=nonprofit",
                cta: "List Your Nonprofit",
              },
              {
                icon: Church,
                title: "Local Churches",
                text: "Share your worship times, ministries, upcoming events, and community outreach opportunities with people looking for a church home.",
                href: "/gives/register/?kind=church",
                cta: "List Your Church",
              },
            ].map(({ icon: Icon, title, text, href, cta }) => (
              <article key={title} className="flex flex-col rounded-2xl border border-brand-100 bg-white p-6 shadow-sm sm:p-7">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy-800 text-white"><Icon className="h-6 w-6" aria-hidden /></span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">Always Free</span>
                </div>
                <h3 className="mt-5 text-xl font-semibold text-navy-900">{title}</h3>
                <p className="mt-2 flex-1 text-slate-600">{text}</p>
                <Link href={href} className="btn-primary mt-6 w-full sm:w-auto sm:self-start">{cta}</Link>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center font-medium text-navy-900">No subscriptions. No setup fees. No paid upgrades required.</p>
        </div>
      </section>

      <section className="container-page py-12">
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

import type { Metadata } from "next";
import Link from "next/link";
import { Check, CreditCard, Info, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { getSettings } from "@/lib/settings";
import { stripeConfigured } from "@/lib/stripe";
import { SUBSCRIPTION_STATUS_LABEL, formatPlanPrice } from "@/lib/plans";
import { formatDate, formatMoney } from "@/lib/utils";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { SubmitButton } from "@/components/ui/submit-button";
import { buySponsorshipAction, setCancelAtPeriodEndAction, startCheckoutAction } from "../actions";

export const metadata: Metadata = { title: "Membership" };
export const dynamic = "force-dynamic";

const FLASH: Record<string, [string, string]> = {
  "checkout:unavailable": ["Online payments are not yet enabled for this plan. Please contact us and we'll get you set up.", "bg-amber-50 text-amber-900"],
  "checkout:already": ["You already have this membership.", "bg-brand-50 text-navy-900"],
  "checkout:canceled": ["Checkout was canceled — you haven't been charged.", "bg-slate-100 text-slate-800"],
  "checkout:error": ["We couldn't start checkout. Please try again in a moment or contact us.", "bg-red-50 text-red-800"],
  "billing:unavailable": ["Billing management isn't available for this membership. Please contact us for help.", "bg-amber-50 text-amber-900"],
  "billing:error": ["Something went wrong talking to our payment provider. Please try again.", "bg-red-50 text-red-800"],
  "billing:canceled": ["Your membership will end at the close of the current billing period. You keep all features until then.", "bg-brand-50 text-navy-900"],
  "billing:resumed": ["Great — your membership will keep renewing.", "bg-emerald-50 text-emerald-800"],
};

export default async function MembershipPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ checkout?: string; billing?: string }> }) {
  const { businessId } = await params;
  const sp = await searchParams;
  const { business } = await requireBusinessAccess(businessId);
  const [{ plan: currentPlan }, settings, plans, subs, products] = await Promise.all([
    getBusinessEntitlements(business.id),
    getSettings(),
    db.membershipPlan.findMany({ where: { isPublic: true }, orderBy: [{ sortOrder: "asc" }, { priceCents: "asc" }] }),
    db.subscription.findMany({ where: { businessId: business.id }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.sponsorshipProduct.findMany({ where: { isActive: true }, orderBy: { priceCents: "asc" } }),
  ]);
  const canPay = settings.paymentsEnabled && stripeConfigured();
  const visibleSubs = subs.filter((s) => s.status !== "CANCELED" || (s.updatedAt > new Date(Date.now() - 90 * 86400_000)));
  const hasStripeCustomer = subs.some((s) => s.stripeCustomerId);
  const flash = sp.checkout ? FLASH[`checkout:${sp.checkout}`] : sp.billing ? FLASH[`billing:${sp.billing}`] : null;
  const contact = settings.contactEmail;

  return (
    <>
      <PageHeader title="Membership" description="Optional upgrades that add tools to your listing." />
      {flash && <p role="status" className={`mb-6 rounded-xl p-4 text-sm ${flash[1]}`}>{flash[0]}</p>}

      <Panel title="Your plan" className="mb-6">
        <p className="text-2xl font-bold text-navy-900">{currentPlan?.name ?? "Free listing"}</p>
        {visibleSubs.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {visibleSubs.map((s) => {
              const live = ["ACTIVE", "TRIALING", "PAST_DUE"].includes(s.status);
              return (
                <li key={s.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-900">{s.plan.name} <span className="ml-1 badge-gray">{SUBSCRIPTION_STATUS_LABEL[s.status] ?? s.status}</span></p>
                    <p className="text-sm text-slate-500">
                      {s.source === "manual" ? "Arranged with our team" : "Paid online"}
                      {s.currentPeriodEnd && live && (s.cancelAtPeriodEnd ? ` · Ends ${formatDate(s.currentPeriodEnd)}` : ` · Renews ${formatDate(s.currentPeriodEnd)}`)}
                    </p>
                    {s.status === "PAST_DUE" && <p className="mt-1 text-sm text-red-700">Your last payment didn&apos;t go through. Please update your card under “Manage billing”.</p>}
                  </div>
                  {s.source === "stripe" && s.stripeSubscriptionId && live && stripeConfigured() && (
                    <form action={setCancelAtPeriodEndAction}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="subscriptionId" value={s.id} />
                      <input type="hidden" name="cancel" value={s.cancelAtPeriodEnd ? "0" : "1"} />
                      <SubmitButton className={s.cancelAtPeriodEnd ? "btn-primary btn-sm" : "btn-ghost btn-sm text-red-600 hover:bg-red-50"} pendingText="Updating…">
                        {s.cancelAtPeriodEnd ? "Keep my membership" : "Cancel at end of period"}
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-slate-600">Your basic listing is free, forever.</p>
        )}
        {hasStripeCustomer && stripeConfigured() && (
          <form action="/api/stripe/portal/" method="post" className="mt-4">
            <input type="hidden" name="businessId" value={business.id} />
            <button className="btn-secondary"><CreditCard className="h-4 w-4" aria-hidden /> Manage billing &amp; payment method</button>
          </form>
        )}
      </Panel>

      {!canPay && (
        <p className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Info className="h-5 w-5 shrink-0" aria-hidden />
          <span>Online payments are not yet enabled — contact us{contact ? <> at <a className="font-semibold underline" href={`mailto:${contact}`}>{contact}</a></> : null} to upgrade your membership.</span>
        </p>
      )}

      <h2 className="mb-3 text-lg font-semibold text-navy-900">Plans</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const price = formatPlanPrice(p);
          const isCurrent = currentPlan?.id === p.id || (!currentPlan && p.interval === "FREE");
          const purchasable = canPay && p.isActive && !!p.stripePriceId && p.interval !== "FREE";
          return (
            <div key={p.id} className={`card flex flex-col p-5 ${isCurrent ? "ring-2 ring-brand-500" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-navy-900">{p.name}</h3>
                {isCurrent && <span className="badge-blue">Current</span>}
                {!p.isActive && <span className="badge-gray">Coming soon</span>}
              </div>
              <p className="mt-2"><span className="text-3xl font-bold text-navy-900">{price.amount}</span><span className="text-slate-500">{price.per}</span></p>
              {p.description && <p className="mt-2 text-sm text-slate-600">{p.description}</p>}
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>)}
              </ul>
              <div className="mt-5">
                {isCurrent ? (
                  <span className="btn-secondary w-full cursor-default">Your current plan</span>
                ) : p.interval === "FREE" ? (
                  <span className="btn-ghost w-full cursor-default">Included with every listing</span>
                ) : purchasable ? (
                  <form action={startCheckoutAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="planId" value={p.id} />
                    <SubmitButton className="btn-primary w-full" pendingText="Opening secure checkout…"><Sparkles className="h-4 w-4" aria-hidden /> Upgrade to {p.name}</SubmitButton>
                  </form>
                ) : (
                  <span className="btn-secondary w-full cursor-default opacity-70" aria-disabled>{p.isActive ? "Contact us to upgrade" : "Coming soon"}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {products.length > 0 && (
        <>
          <h2 className="mb-1 mt-10 text-lg font-semibold text-navy-900">Sponsorship opportunities</h2>
          <p className="mb-3 text-sm text-slate-600">One-time placements, always labeled “{settings.sponsoredLabel}”. After purchase our team schedules your placement with you.</p>
          <ul className="card divide-y divide-slate-100">
            {products.map((pr) => (
              <li key={pr.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900">{pr.name}</p>
                  <p className="text-sm text-slate-500">{pr.description ?? `${pr.durationDays} days`}</p>
                </div>
                <span className="font-semibold text-navy-900">{pr.priceCents ? formatMoney(pr.priceCents) : ""}</span>
                {canPay && pr.stripePriceId ? (
                  <form action={buySponsorshipAction}>
                    <input type="hidden" name="businessId" value={business.id} />
                    <input type="hidden" name="productId" value={pr.id} />
                    <SubmitButton className="btn-secondary btn-sm" pendingText="Opening…">Buy</SubmitButton>
                  </form>
                ) : (
                  <span className="text-sm text-slate-500">Contact us</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-10 text-sm text-slate-500">
        Memberships add tools to your listing. They never buy editorial coverage — our Spotlight stories are chosen independently, and anything
        sponsored is always clearly labeled. <Link href="/memberships/" className="font-medium text-brand-700 hover:underline">Learn more</Link>
      </p>
    </>
  );
}

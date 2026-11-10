import Link from "next/link";
import { Check, Minus } from "lucide-react";
import type { Entitlements } from "@/lib/entitlements";

/** The listing's current plan and what it includes, with usage. Server component. */
export function PlanLimits({ businessId, planName, entitlements: e, photos, events, compact }: {
  businessId: string; planName: string; entitlements: Entitlements; photos: number; events: number; compact?: boolean;
}) {
  const root = `/dashboard/${businessId}/`;
  const rows: { label: string; value: React.ReactNode; href: string; warn?: boolean; ok?: boolean }[] = [
    { label: "Gallery photos", value: `${photos} of ${e.maxPhotos}`, href: `${root}photos/`, warn: photos > e.maxPhotos },
    { label: "Events", value: e.maxEvents === null ? `${events} · Unlimited` : `${events} of ${e.maxEvents}`, href: `${root}events/`, warn: e.maxEvents !== null && events >= e.maxEvents },
    { label: "Business description", value: `Up to ${e.descriptionLimit.toLocaleString("en-US")} characters`, href: `${root}profile/#basics` },
    { label: "Google reviews", value: e.googleReviews ? "Included" : "Premium", href: `${root}profile/#google`, ok: e.googleReviews },
    { label: "Services & menus", value: e.servicesMenus ? "Included" : "Premium", href: `${root}services/`, ok: e.servicesMenus },
  ];
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="plan-limits-title" data-testid="plan-limits">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your plan</p>
          <h2 id="plan-limits-title" className="text-lg font-semibold text-navy-900">{planName}</h2>
        </div>
        {e.tier === "FREE" && !compact && <Link href={`${root}membership/`} className="btn-secondary btn-sm">Upgrade to Premium</Link>}
      </div>
      <ul className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label}>
            <Link href={r.href} className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm hover:bg-slate-50">
              <span className="text-slate-600">{r.label}</span>
              <span className={`flex items-center gap-1 font-semibold ${r.warn ? "text-amber-700" : r.ok === false ? "text-slate-400" : "text-navy-900"}`}>
                {r.ok === true && <Check className="h-4 w-4 text-emerald-600" aria-hidden />}
                {r.ok === false && <Minus className="h-4 w-4" aria-hidden />}
                {r.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {e.tier === "FREE" && compact && (
        <p className="mt-3 text-sm text-slate-500">Premium adds up to 20 photos, unlimited events, a 2,000-character description, Google reviews and services &amp; menus. <Link href={`${root}membership/`} className="font-medium text-brand-700 hover:underline">Learn more</Link></p>
      )}
    </section>
  );
}

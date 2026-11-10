import Link from "next/link";
import { Bell, Bookmark, MapPin, Store, ThumbsUp } from "lucide-react";
import { MY_T_COUNTY_NAME, MY_T_COUNTY_PITCH, MY_T_COUNTY_TAGLINE, RESIDENT_BENEFITS, loginHref, registerHref } from "@/lib/resident-accounts";

const ICONS = { save: Bookmark, recommend: ThumbsUp, community: MapPin, reminders: Bell, follow: Store } as const;

/** Logged-out /my-t-county/: what a free account adds (only features that work today). Guest content follows below. */
export function BenefitsHero() {
  const next = "/my-t-county/";
  return (
    <section aria-labelledby="mtc-benefits-title" className="bg-gradient-to-b from-hillside-50 to-white" data-testid="mtc-benefits">
      <div className="container-page grid gap-8 pb-8 pt-8 sm:pt-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div className="min-w-0">
          <p className="eyebrow">{MY_T_COUNTY_NAME}</p>
          <h1 id="mtc-benefits-title" className="mt-1 font-display text-3xl font-bold text-navy-900 sm:text-4xl">{MY_T_COUNTY_TAGLINE}</h1>
          <p className="mt-3 max-w-xl text-slate-700">{MY_T_COUNTY_PITCH}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link href={registerHref("my_t_county", next)} className="btn-primary min-h-12 px-6 text-base" data-testid="mtc-register-link">Create free account</Link>
            <Link href={loginHref(next, "my_t_county")} className="btn-secondary min-h-12" data-testid="mtc-signin-link">Sign in</Link>
          </div>
          <p className="mt-3 text-sm text-slate-600">Free for every resident, and separate from business memberships. You can keep browsing without an account.</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {RESIDENT_BENEFITS.map((b) => {
            const Icon = ICONS[b.key];
            return (
              <li key={b.key} className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hillside-50 text-hillside-700"><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-navy-900">{b.title}</span>
                  <span className="block text-sm text-slate-600">{b.text}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

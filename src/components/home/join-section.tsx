import Link from "next/link";
import { ArrowRight, Bookmark, MapPin, ThumbsUp } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { MY_T_COUNTY_NAME, MY_T_COUNTY_TAGLINE, registerHref } from "@/lib/resident-accounts";

/**
 * Homepage "join" section (type "join"): invites visitors to create a free resident account.
 * Signed-in members see a compact link to My T County instead.
 */
export async function JoinSection({ title, subtitle }: { title?: string | null; subtitle?: string | null }) {
  const user = await getCurrentUser();
  if (user) {
    return (
      <section aria-label={MY_T_COUNTY_NAME} className="container-page py-6" data-testid="home-join-member">
        <Link href="/my-t-county/" className="card card-hover flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-hillside-50 text-hillside-700"><MapPin className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold text-navy-900">Go to {MY_T_COUNTY_NAME}</span>
            <span className="block truncate text-sm text-slate-600">Your saved places, recommendations and community, all in one spot.</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-brand-700" aria-hidden />
        </Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="home-join-title" className="container-page py-10 sm:py-12" data-testid="home-join">
      <div className="overflow-hidden rounded-3xl bg-hillside-50 px-5 py-8 ring-1 ring-hillside-100 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">{MY_T_COUNTY_NAME} · {MY_T_COUNTY_TAGLINE}</p>
            <h2 id="home-join-title" className="mt-1 font-display text-2xl font-bold text-navy-900 sm:text-3xl">{title || "Make T County Yours."}</h2>
            <p className="mt-2 text-slate-700">{subtitle || "Save your favorite places, recommend businesses, and stay connected to your community with a free account."}</p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-navy-900">
              <li className="flex items-center gap-1.5"><Bookmark className="h-4 w-4 text-hillside-600" aria-hidden /> Save favorites</li>
              <li className="flex items-center gap-1.5"><ThumbsUp className="h-4 w-4 text-hillside-600" aria-hidden /> Recommend businesses</li>
              <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-hillside-600" aria-hidden /> Follow your community</li>
            </ul>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            <Link href={registerHref("homepage")} className="btn-primary min-h-12 px-6 text-base" data-testid="home-join-register">Create Free Account</Link>
            <Link href="/login/?source=homepage" className="btn-secondary min-h-11">Sign in</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

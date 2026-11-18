import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { MY_T_COUNTY_NAME } from "@/lib/resident-accounts";

/**
 * The single "Go to My T County" link card signed-in visitors see on the homepage.
 * Shared by the "join" section and the bottom My T County signup section (which only
 * shows it when the join section is off), so the homepage never shows two.
 */
export function MyTCountyLinkCard({ testId = "home-join-member" }: { testId?: string }) {
  return (
    <section aria-label={MY_T_COUNTY_NAME} className="container-page py-6" data-testid={testId}>
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

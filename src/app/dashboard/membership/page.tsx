import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getUpgradeableListings, membershipTabPath } from "@/lib/membership-eligibility";
import { PlainShell } from "@/components/dashboard/shell";
import { decodePlainText } from "@/lib/text";

export const metadata: Metadata = { title: "Choose a listing to upgrade" };
export const dynamic = "force-dynamic";

/**
 * Stable "upgrade" link (used by /memberships/): goes to the Membership tab of the owner's approved listing.
 * Several approved listings → the owner chooses (we never guess). None → back to the public page (free listing).
 */
export default async function MembershipShortcut() {
  const user = await requireUser("/dashboard/membership/");
  const listings = await getUpgradeableListings(user.id);
  if (listings.length === 0) redirect("/memberships/");
  if (listings.length === 1) redirect(membershipTabPath(listings[0].id));
  return (
    <PlainShell>
      <h1 className="font-display text-3xl font-semibold text-navy-900">Which listing would you like to upgrade?</h1>
      <p className="mt-2 text-slate-600">Memberships apply to one listing at a time. Choose the business to see its plans and prices.</p>
      <ul className="mt-6 grid gap-3" data-testid="upgrade-chooser">
        {listings.map((b) => (
          <li key={b.id}>
            <Link href={membershipTabPath(b.id)} className="card card-hover flex min-h-16 items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-navy-800 text-white"><Sparkles className="h-6 w-6" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-navy-900">{decodePlainText(b.name)}</span>
                <span className="text-sm text-slate-500">{b.city || "Tuscarawas County"}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8"><Link href="/dashboard/" className="font-medium text-brand-700 hover:underline">Back to my businesses</Link></p>
    </PlainShell>
  );
}

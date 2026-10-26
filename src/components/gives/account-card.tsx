import Link from "next/link";
import { ChevronRight, HandHelping, HeartHandshake } from "lucide-react";
import { db } from "@/lib/db";
import { getUserOrganizations } from "@/lib/gives/access";

/** Account page links: organization dashboard (members) and the volunteer/pledge history. */
export async function GivesAccountCard({ user }: { user: { id: string; email: string; emailVerifiedAt: Date | null } }) {
  const mine = { OR: [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ email: user.email.toLowerCase() }] : [])] };
  const [orgs, signups, pledges] = await Promise.all([
    getUserOrganizations(user.id),
    db.volunteerSignup.count({ where: { ...mine, status: { in: ["REGISTERED", "CONFIRMED", "WAITLISTED"] } } }),
    db.needPledge.count({ where: { ...mine, status: "PLEDGED" } }),
  ]);
  const active = orgs.filter((o) => !["SUSPENDED", "ARCHIVED"].includes(o.status));
  if (!active.length && !signups && !pledges) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {active.length > 0 && (
        <Link href="/organization/" className="card card-hover flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sunset-500 text-white"><HeartHandshake className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-navy-900">{active.length === 1 ? `Manage ${active[0].name}` : "Organization dashboard"}</span>
            <span className="block text-sm text-slate-500">T-County Gives — needs, volunteers &amp; updates</span>
          </span>
          <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
        </Link>
      )}
      {(signups > 0 || pledges > 0) && (
        <Link href="/account/volunteering/" className="card card-hover flex items-center gap-3 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><HandHelping className="h-5 w-5" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-navy-900">My volunteering &amp; pledges</span>
            <span className="block text-sm text-slate-500">{[signups && `${signups} sign-up${signups === 1 ? "" : "s"}`, pledges && `${pledges} pledge${pledges === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
        </Link>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { HandHelping, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PLEDGE_STATUS_LABEL, SIGNUP_BADGE, SIGNUP_STATUS_LABEL, needHref, opportunityHref } from "@/lib/gives/constants";
import { EmptyState } from "@/components/ui/empty-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { cancelMyPledgeAction, cancelMySignupAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My volunteering & pledges", robots: { index: false } };

export default async function MyVolunteeringPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const mine = { OR: [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ email: user.email.toLowerCase() }] : [])] };
  const [signups, pledges] = await Promise.all([
    db.volunteerSignup.findMany({
      where: mine, orderBy: { createdAt: "desc" }, take: 100,
      include: { opportunity: { select: { slug: true, title: true, startAt: true, isOngoing: true, status: true, deletedAt: true, organization: { select: { name: true } } } } },
    }),
    db.needPledge.findMany({
      where: mine, orderBy: { createdAt: "desc" }, take: 100,
      include: { need: { select: { slug: true, title: true, unit: true, deletedAt: true, organization: { select: { name: true } } } } },
    }),
  ]);
  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-2xl font-semibold text-navy-900">My volunteering &amp; pledges</h2>
        <p className="mt-1 text-sm text-slate-600">Sign-ups and pledges made with {user.email}. <Link href="/gives/" className="font-semibold text-brand-700 hover:underline">Find more ways to help</Link></p>
      </div>
      <section aria-labelledby="my-signups">
        <h3 id="my-signups" className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><UsersRound className="h-4 w-4" aria-hidden /> Volunteer sign-ups <span className="badge-gray">{signups.length}</span></h3>
        {signups.length === 0 ? (
          <EmptyState icon={UsersRound} title="No sign-ups yet"><Link href="/gives/volunteer/" className="btn-primary btn-sm mt-3">Browse volunteer opportunities</Link></EmptyState>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {signups.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  {s.opportunity.deletedAt ? <p className="font-semibold text-navy-900">{s.opportunity.title}</p> : <Link href={opportunityHref(s.opportunity)} className="font-semibold text-navy-900 hover:text-brand-700">{s.opportunity.title}</Link>}
                  <p className="text-sm text-slate-500">{s.opportunity.organization.name} · {s.opportunity.isOngoing ? "Ongoing" : s.opportunity.startAt ? formatDateTime(s.opportunity.startAt) : "Date TBA"}</p>
                </div>
                <span className={SIGNUP_BADGE[s.status]}>{SIGNUP_STATUS_LABEL[s.status]}</span>
                {["REGISTERED", "CONFIRMED", "WAITLISTED"].includes(s.status) && (
                  <form action={cancelMySignupAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton className="btn-ghost btn-sm text-red-700" pendingText="Cancelling…">Cancel</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="my-pledges">
        <h3 id="my-pledges" className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><HandHelping className="h-4 w-4" aria-hidden /> Pledges <span className="badge-gray">{pledges.length}</span></h3>
        {pledges.length === 0 ? (
          <EmptyState icon={HandHelping} title="No pledges yet"><Link href="/gives/needs/" className="btn-primary btn-sm mt-3">See community needs</Link></EmptyState>
        ) : (
          <ul className="card divide-y divide-slate-100">
            {pledges.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  {p.need.deletedAt ? <p className="font-semibold text-navy-900">{p.need.title}</p> : <Link href={needHref(p.need)} className="font-semibold text-navy-900 hover:text-brand-700">{p.need.title}</Link>}
                  <p className="text-sm text-slate-500">{p.need.organization.name} · {p.quantity}{p.need.unit ? ` ${p.need.unit}` : ""} · {formatDate(p.createdAt, { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
                <span className={p.status === "PLEDGED" ? "badge-amber" : p.status === "CANCELLED" ? "badge-gray" : "badge-green"}>{PLEDGE_STATUS_LABEL[p.status]}</span>
                {p.status === "PLEDGED" && (
                  <form action={cancelMyPledgeAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <SubmitButton className="btn-ghost btn-sm text-red-700" pendingText="Withdrawing…">Withdraw</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

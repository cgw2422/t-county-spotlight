import Link from "next/link";
import { ChevronRight, HandHelping, HeartHandshake } from "lucide-react";
import { db } from "@/lib/db";
import { getUserOrganizations } from "@/lib/gives/access";
import { formatDate } from "@/lib/utils";
import { CLAIM_STATUS_BADGE, CLAIM_STATUS_LABEL, claimHref, daysAgo } from "@/lib/gives/constants";
import { ActionForm } from "@/components/account/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { withdrawClaimAction } from "@/app/(site)/gives/claim/actions";

/** Account page links: organization dashboard (members) and the volunteer/pledge history. */
export async function GivesAccountCard({ user }: { user: { id: string; email: string; emailVerifiedAt: Date | null } }) {
  const mine = { OR: [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ email: user.email.toLowerCase() }] : [])] };
  const [orgs, signups, pledges, claims] = await Promise.all([
    getUserOrganizations(user.id),
    db.volunteerSignup.count({ where: { ...mine, status: { in: ["REGISTERED", "CONFIRMED", "WAITLISTED"] } } }),
    db.needPledge.count({ where: { ...mine, status: "PLEDGED" } }),
    db.organizationClaim.findMany({
      where: { userId: user.id, OR: [{ status: "PENDING" }, { reviewedAt: { gte: daysAgo(90) } }] },
      orderBy: { createdAt: "desc" }, take: 10,
      select: { id: true, status: true, createdAt: true, reviewNote: true, emailVerifiedAt: true, organization: { select: { id: true, name: true, slug: true, deletedAt: true } } },
    }),
  ]);
  const active = orgs.filter((o) => !["SUSPENDED", "ARCHIVED"].includes(o.status));
  if (!active.length && !signups && !pledges && !claims.length) return null;
  return (
    <div className="space-y-3">
    {claims.length > 0 && (
      <section aria-labelledby="my-claims" className="card p-4">
        <h2 id="my-claims" className="text-sm font-bold uppercase tracking-wide text-slate-500">My organization claims</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {claims.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                {c.organization.deletedAt ? <span className="font-semibold text-navy-900">{c.organization.name}</span> : <Link href={c.status === "APPROVED" ? `/organization/${c.organization.id}/` : claimHref(c.organization)} className="font-semibold text-navy-900 hover:text-brand-700">{c.organization.name}</Link>}
                <span className="block text-slate-500">Sent {formatDate(c.createdAt, { month: "short", day: "numeric", year: "numeric" })}{c.status === "PENDING" && !c.emailVerifiedAt ? " · confirm your organization email" : ""}{c.status === "REJECTED" && c.reviewNote ? ` · ${c.reviewNote}` : ""}</span>
              </span>
              <span className={CLAIM_STATUS_BADGE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</span>
              {c.status === "PENDING" && (
                <ActionForm action={withdrawClaimAction} className="">
                  <input type="hidden" name="claimId" value={c.id} />
                  <SubmitButton className="btn-ghost btn-sm text-red-700" pendingText="…">Withdraw</SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>
    )}
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
    </div>
  );
}

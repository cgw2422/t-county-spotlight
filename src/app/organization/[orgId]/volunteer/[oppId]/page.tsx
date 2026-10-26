import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, ExternalLink, Mail, Phone, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime, toDateInput } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { SIGNUP_BADGE, SIGNUP_STATUS_LABEL, opportunityHref } from "@/lib/gives/constants";
import { OpportunityForm } from "@/components/gives/dashboard-forms";
import { PageHeader } from "@/components/dashboard/shell";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { deleteOpportunityAction, setSignupStatusAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer opportunity" };

const NEXT: Record<string, { status: string; label: string; cls: string }[]> = {
  REGISTERED: [{ status: "CONFIRMED", label: "Confirm", cls: "btn-primary btn-sm" }, { status: "WAITLISTED", label: "Waitlist", cls: "btn-secondary btn-sm" }, { status: "CANCELLED", label: "Cancel", cls: "btn-ghost btn-sm" }],
  CONFIRMED: [{ status: "ATTENDED", label: "Attended", cls: "btn-primary btn-sm" }, { status: "NO_SHOW", label: "No-show", cls: "btn-secondary btn-sm" }, { status: "CANCELLED", label: "Cancel", cls: "btn-ghost btn-sm" }],
  WAITLISTED: [{ status: "CONFIRMED", label: "Move off waitlist", cls: "btn-primary btn-sm" }, { status: "CANCELLED", label: "Cancel", cls: "btn-ghost btn-sm" }],
  CANCELLED: [{ status: "REGISTERED", label: "Restore", cls: "btn-secondary btn-sm" }],
  ATTENDED: [{ status: "NO_SHOW", label: "Mark no-show", cls: "btn-ghost btn-sm" }],
  NO_SHOW: [{ status: "ATTENDED", label: "Mark attended", cls: "btn-ghost btn-sm" }],
};

export default async function OpportunityDetailPage({ params, searchParams }: { params: Promise<{ orgId: string; oppId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { orgId, oppId } = await params;
  const { created } = await searchParams;
  const { org } = await requireOrgAccess(orgId);
  const opp = await db.volunteerOpportunity.findFirst({
    where: { id: oppId, organizationId: org.id, deletedAt: null },
    include: { signups: { orderBy: [{ createdAt: "asc" }] } },
  });
  if (!opp) notFound();
  const order = ["CONFIRMED", "REGISTERED", "WAITLISTED", "ATTENDED", "NO_SHOW", "CANCELLED"];
  const signups = [...opp.signups].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.createdAt.getTime() - b.createdAt.getTime());
  const active = opp.signups.filter((s) => s.status === "REGISTERED" || s.status === "CONFIRMED").length;
  const waitlisted = opp.signups.filter((s) => s.status === "WAITLISTED").length;

  return (
    <>
      <Link href={`/organization/${org.id}/volunteer/`} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700"><ChevronLeft className="h-4 w-4" aria-hidden /> Volunteer opportunities</Link>
      <PageHeader
        title={opp.title}
        description={org.status === "APPROVED" && opp.status !== "DRAFT" ? <Link href={opportunityHref(opp)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">View public page <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link> : "Not public yet."}
      />
      {created && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Opportunity saved.{org.status !== "APPROVED" && " It will appear publicly once your organization is approved."}</p>}

      <section className="card mb-6 overflow-hidden" aria-labelledby="reg-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div>
            <h2 id="reg-title" className="text-lg font-semibold text-navy-900">Registrations</h2>
            <p className="text-sm text-slate-600">{active}{opp.spots != null ? ` of ${opp.spots} spots filled` : " signed up"}{waitlisted ? ` · ${waitlisted} on the waitlist` : ""}</p>
          </div>
          {opp.signups.length > 0 && <a href={`/organization/${org.id}/volunteer/${opp.id}/export/`} className="btn-secondary btn-sm"><Download className="h-4 w-4" aria-hidden /> Download CSV</a>}
        </div>
        {signups.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">{opp.externalSignupUrl ? "Volunteers sign up on your own sign-up page." : "No one has signed up yet."}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {signups.map((s) => (
              <li key={s.id} className="p-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{s.name}{!s.isAdult && <span className="badge-amber ml-2">Under 18</span>}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <a href={`mailto:${s.email}`} className="inline-flex min-w-0 items-center gap-1 break-all text-brand-700 hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{s.email}</a>
                      {s.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{s.phone}</a>}
                    </p>
                    {s.notes && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{s.notes}</p>}
                    <p className="mt-1 text-xs text-slate-500">Signed up {formatDateTime(s.createdAt)}</p>
                  </div>
                  <span className={SIGNUP_BADGE[s.status]}>{SIGNUP_STATUS_LABEL[s.status]}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(NEXT[s.status] ?? []).map((n) => (
                    <ActionButton key={n.status} action={setSignupStatusAction} fields={{ orgId: org.id, signupId: s.id, status: n.status }} className={n.cls}>{n.label}</ActionButton>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <OpportunityForm
        orgId={org.id}
        opp={{
          id: opp.id, title: opp.title, description: opp.description, startAt: toDateInput(opp.startAt), endAt: toDateInput(opp.endAt), isOngoing: opp.isOngoing,
          locationName: opp.locationName, address: opp.address, city: opp.city, minAge: opp.minAge, ageNotes: opp.ageNotes, spots: opp.spots,
          requirements: opp.requirements, registrationOpen: opp.registrationOpen, externalSignupUrl: opp.externalSignupUrl, status: opp.status,
        }}
      />
      <div className="mt-8 border-t border-slate-200 pt-6">
        <ConfirmButton action={deleteOpportunityAction} fields={{ orgId: org.id, oppId: opp.id }} title="Delete this opportunity?" body="It is removed from your public page and your list. Volunteers are not emailed automatically — let them know if plans changed." confirmLabel="Delete">
          <Trash2 className="h-4 w-4" aria-hidden /> Delete opportunity
        </ConfirmButton>
      </div>
    </>
  );
}

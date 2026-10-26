import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, ExternalLink, Mail, Phone, Trash2, Undo2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime, toDateInput } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { isOrgPublic } from "@/lib/gives/queries";
import { PLEDGE_STATUS_LABEL, needHref } from "@/lib/gives/constants";
import { NeedProgress } from "@/components/gives/badges";
import { NeedForm } from "@/components/gives/dashboard-forms";
import { PageHeader } from "@/components/dashboard/shell";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { deleteNeedAction, updatePledgeAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Need" };

const TONE: Record<string, string> = { PLEDGED: "badge-amber", RECEIVED: "badge-green", PARTIALLY_RECEIVED: "badge-blue", CANCELLED: "badge-gray" };

export default async function NeedDetailPage({ params, searchParams }: { params: Promise<{ orgId: string; needId: string }>; searchParams: Promise<{ created?: string }> }) {
  const { orgId, needId } = await params;
  const { created } = await searchParams;
  const { org } = await requireOrgAccess(orgId);
  const need = await db.communityNeed.findFirst({
    where: { id: needId, organizationId: org.id, deletedAt: null },
    include: { pledges: { orderBy: [{ status: "asc" }, { createdAt: "desc" }] } },
  });
  if (!need) notFound();
  const pledgedQty = need.pledges.filter((p) => p.status !== "CANCELLED").reduce((n, p) => n + p.quantity, 0);
  const waiting = need.pledges.filter((p) => p.status === "PLEDGED");
  const fields = (pledgeId: string, status: string) => ({ orgId: org.id, pledgeId, status });

  return (
    <>
      <Link href={`/organization/${org.id}/needs/`} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700"><ChevronLeft className="h-4 w-4" aria-hidden /> Needs</Link>
      <PageHeader
        title={need.title}
        description={isOrgPublic(org) && need.status !== "DRAFT" ? <Link href={needHref(need)} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">View public page <ExternalLink className="h-3.5 w-3.5" aria-hidden /></Link> : "Not public yet."}
      />
      {created && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your need is posted.{!isOrgPublic(org) && " It will appear publicly once your organization is approved and published."}</p>}

      <section className="card mb-6 p-5 sm:p-6" aria-labelledby="pledges-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pledges-title" className="text-lg font-semibold text-navy-900">Pledges</h2>
          <span className="text-sm text-slate-500">{need.pledges.length} total · {waiting.length} waiting to be confirmed</span>
        </div>
        <p className="mt-1 text-sm text-slate-600">Contact details are private to your team. When something arrives, mark it received — that updates the progress people see.</p>
        <div className="mt-4"><NeedProgress received={need.quantityReceived} needed={need.quantityNeeded} unit={need.unit} pledged={pledgedQty} /></div>
        {need.pledges.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No pledges yet. Share the public page to get the word out.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {need.pledges.map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{p.name} <span className="font-normal text-slate-500">· pledged {p.quantity}{need.unit ? ` ${need.unit}` : ""}</span></p>
                    <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <a href={`mailto:${p.email}`} className="inline-flex min-w-0 items-center gap-1 break-all text-brand-700 hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{p.email}</a>
                      {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Phone className="h-3.5 w-3.5" aria-hidden />{p.phone}</a>}
                    </p>
                    {p.message && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">&ldquo;{p.message}&rdquo;</p>}
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(p.createdAt)}{p.receivedQuantity != null && ` · ${p.receivedQuantity} received`}</p>
                  </div>
                  <span className={TONE[p.status]}>{PLEDGE_STATUS_LABEL[p.status]}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.status !== "RECEIVED" && (
                    <ActionButton action={updatePledgeAction} fields={{ ...fields(p.id, "RECEIVED"), receivedQuantity: String(p.quantity) }} className="btn-primary btn-sm"><CheckCircle2 className="h-4 w-4" aria-hidden /> Received all ({p.quantity})</ActionButton>
                  )}
                  <ActionButton action={updatePledgeAction} fields={fields(p.id, "PARTIALLY_RECEIVED")} prompt={{ name: "receivedQuantity", label: "How many did you receive?", required: true, placeholder: "e.g. 3" }} className="btn-secondary btn-sm">Partly received…</ActionButton>
                  {p.status !== "CANCELLED" && <ActionButton action={updatePledgeAction} fields={fields(p.id, "CANCELLED")} className="btn-ghost btn-sm"><XCircle className="h-4 w-4" aria-hidden /> Didn&apos;t come</ActionButton>}
                  {p.status !== "PLEDGED" && <ActionButton action={updatePledgeAction} fields={fields(p.id, "PLEDGED")} className="btn-ghost btn-sm"><Undo2 className="h-4 w-4" aria-hidden /> Undo</ActionButton>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <NeedForm
        orgId={org.id}
        need={{
          id: need.id, title: need.title, description: need.description, category: need.category, urgency: need.urgency, status: need.status,
          quantityNeeded: need.quantityNeeded, unit: need.unit, deadline: need.deadline ? toDateInput(need.deadline).slice(0, 10) : "",
          instructions: need.instructions, dropoffLocation: need.dropoffLocation, isWishList: need.isWishList,
        }}
      />
      <div className="mt-8 border-t border-slate-200 pt-6">
        <ConfirmButton action={deleteNeedAction} fields={{ orgId: org.id, needId: need.id }} title="Delete this need?" body="It is removed from your public page and your needs list." confirmLabel="Delete need">
          <Trash2 className="h-4 w-4" aria-hidden /> Delete need
        </ConfirmButton>
      </div>
    </>
  );
}

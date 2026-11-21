import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, GitMerge, Link2, Link2Off, Plus, Search } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { Card, Notice, PageHeader } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { SelectField, TextArea } from "@/components/admin/form-field";
import { StatusBadge } from "@/components/admin/status-badge";
import { directoryMatches, similarLeads } from "@/lib/business-leads";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/business-leads-shared";
import { linkLeadAction, mergeLeadAction, saveLeadAction, unlinkLeadAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business recommendation" };

const BASE = "/admin/business-recommendations/";

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ find?: string; merged?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { find = "", merged } = await searchParams;
  const lead = await db.businessLead.findUnique({
    where: { id },
    include: { business: { select: { id: true, name: true, slug: true, status: true, city: true, deletedAt: true } }, submissions: { orderBy: { createdAt: "desc" } } },
  });
  if (!lead) notFound();
  const q = find.trim().slice(0, 100);
  const [matches, similar, found] = await Promise.all([
    lead.business ? [] : directoryMatches(lead),
    similarLeads(lead),
    q && !lead.business ? db.business.findMany({ where: { deletedAt: null, name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true, city: true, status: true }, orderBy: { name: "asc" }, take: 15 }) : [],
  ]);
  const people = new Set(lead.submissions.map((s) => s.submitterEmail || s.ipHash || s.id)).size;
  const linkedPublished = lead.business?.status === "PUBLISHED" && !lead.business.deletedAt;

  return (
    <>
      <PageHeader
        back={{ href: BASE, label: "Business recommendations" }}
        title={lead.name}
        description={<>{lead.city}{lead.category ? ` · ${lead.category}` : ""} · recommended <strong data-testid="lead-times">{lead.submissionCount}</strong> time{lead.submissionCount === 1 ? "" : "s"}{people !== lead.submissionCount ? ` by about ${people} ${people === 1 ? "person" : "people"}` : ""} · first {formatDateTime(lead.createdAt)}</>}
        actions={<StatusBadge status={lead.status} label={LEAD_STATUS_LABEL[lead.status]} />}
      />
      {merged && <div className="mb-4"><Notice tone="success">Merged. All submissions are kept on this recommendation.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Status & private notes" description="Notes are visible to staff only.">
          <ActionForm action={saveLeadAction} className="space-y-4">
            <input type="hidden" name="id" value={lead.id} />
            <SelectField name="status" label="Status" defaultValue={lead.status} options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] }))} data-testid="lead-status" />
            <TextArea name="adminNotes" label="Admin notes" rows={4} defaultValue={lead.adminNotes ?? ""} maxLength={5000} data-testid="lead-notes" />
            <p className="text-xs text-slate-500">“Added” needs a linked listing. Contacted and added recommendations are counted in the stats.{lead.contactedAt ? ` First contacted ${formatDateTime(lead.contactedAt)}.` : ""}{lead.addedAt ? ` Added ${formatDateTime(lead.addedAt)}.` : ""}</p>
            <Submit pendingText="Saving…" data-testid="lead-save">Save</Submit>
          </ActionForm>
        </Card>

        <Card title="In the directory?" description="Check for an existing listing before creating one.">
          {lead.business ? (
            <div className="space-y-3" data-testid="lead-linked">
              <p className="text-sm">Linked to <Link href={`/admin/businesses/${lead.business.id}/`} className="font-semibold text-brand-700 hover:underline">{lead.business.name}</Link> <StatusBadge status={lead.business.deletedAt ? "DELETED" : lead.business.status} />{lead.createdFromLead ? <span className="ml-1 text-xs text-slate-500">(created from this recommendation)</span> : <span className="ml-1 text-xs text-slate-500">(existing listing)</span>}</p>
              {linkedPublished && lead.status !== "ADDED" && <Notice tone="info">The linked listing is published. Set the status to Added if this recommendation led to it.</Notice>}
              <ActionButton action={unlinkLeadAction} fields={{ id: lead.id }} confirm={{ title: "Unlink this listing?", confirmLabel: "Unlink" }} reloadOnSuccess><Link2Off className="h-4 w-4" /> Unlink</ActionButton>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" data-testid="lead-matches">
                  {matches.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <span><Link href={`/admin/businesses/${m.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{m.name}</Link> <span className="text-slate-500">{m.city ?? ""}</span> <StatusBadge status={m.status} />{m.exact && <span className="ml-1 badge-amber">Likely the same business</span>}</span>
                      <ActionButton action={linkLeadAction} fields={{ id: lead.id, businessId: m.id }} reloadOnSuccess><Link2 className="h-4 w-4" /> Link</ActionButton>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-600" data-testid="lead-no-matches">No similar listings found in the directory.</p>}
              <form method="get" className="flex gap-2">
                <label htmlFor="find" className="sr-only">Find a listing</label>
                <input id="find" name="find" defaultValue={q} className="input min-w-0 flex-1" placeholder="Find another listing by name" />
                <button className="btn-secondary shrink-0"><Search className="h-4 w-4" aria-hidden /> Find</button>
              </form>
              {q && (
                found.length ? (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {found.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                        <span><span className="font-semibold">{m.name}</span> <span className="text-slate-500">{m.city ?? ""}</span> <StatusBadge status={m.status} /></span>
                        <ActionButton action={linkLeadAction} fields={{ id: lead.id, businessId: m.id }} reloadOnSuccess><Link2 className="h-4 w-4" /> Link</ActionButton>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-slate-600">No listings match “{q}”.</p>
              )}
              <div className="border-t border-slate-100 pt-4">
                <Link href={`/admin/businesses/new/?fromLead=${lead.id}`} className="btn-primary" data-testid="lead-create-listing"><Plus className="h-4 w-4" /> Create listing from this recommendation</Link>
                <p className="mt-2 text-xs text-slate-500">Opens the normal Add business form, prefilled and set to draft. No owner account is created.</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title={`Submissions (${lead.submissions.length})`} description="Each resident submission, exactly as entered. Contact details are private and only for following up about this recommendation." className="mt-6">
        <ul className="divide-y divide-slate-100" data-testid="lead-submissions">
          {lead.submissions.map((s) => (
            <li key={s.id} className="grid gap-2 py-4 text-sm sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="text-slate-500">{formatDateTime(s.createdAt)}</div>
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-slate-900">{s.businessName} <span className="font-normal text-slate-500">· {s.city}{s.category ? ` · ${s.category}` : ""}</span></p>
                {s.website && <p className="break-all"><a href={s.website} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 hover:underline">{s.website} <ExternalLink className="inline h-3 w-3" aria-hidden /></a></p>}
                {s.reason && <p className="whitespace-pre-line text-slate-700">“{s.reason}”</p>}
                <p className="text-xs text-slate-500">
                  From: {s.submitterFirstName || "(no name)"}{s.submitterEmail ? <> · <a href={`mailto:${s.submitterEmail}`} className="text-brand-700 hover:underline">{s.submitterEmail}</a></> : " · (no email)"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {similar.length > 0 && (
        <Card title="Similar recommendations" description="If one of these is the same business, merge this recommendation into it. Every submission is kept." className="mt-6">
          <ul className="divide-y divide-slate-100" data-testid="lead-similar">
            {similar.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span><Link href={`${BASE}${o.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{o.name}</Link> <span className="text-slate-500">· {o.city} · {o.submissionCount}×</span> <StatusBadge status={o.status} label={LEAD_STATUS_LABEL[o.status]} /></span>
                <ActionButton action={mergeLeadAction} fields={{ id: lead.id, into: o.id }} confirm={{ title: `Merge into “${o.name}”?`, confirmLabel: "Merge" }}><GitMerge className="h-4 w-4" /> Merge into this</ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Inbox, XCircle } from "lucide-react";
import type { ClaimStatus } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import {
  CLAIM_REVIEW_CHECKS, CLAIM_STATUS_BADGE, CLAIM_STATUS_LABEL, CLAIM_VERIFY_LABEL, claimRiskReasons, externalUrl, isPersonalEmailDomain, orgHref,
} from "@/lib/gives/constants";
import { isOrgPublic } from "@/lib/gives/queries";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { Pagination } from "@/components/admin/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KindBadge, OwnershipBadge, PublishBadge } from "@/components/gives/badges";
import { pageParams, spGet, type SP } from "../../_lib/list";
import { approveClaim, rejectClaim, saveClaimNote } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ownership claims" };

const TABS: { key: string; label: string; status: ClaimStatus }[] = [
  { key: "pending", label: "Pending", status: "PENDING" },
  { key: "approved", label: "Approved", status: "APPROVED" },
  { key: "rejected", label: "Rejected", status: "REJECTED" },
  { key: "withdrawn", label: "Withdrawn", status: "WITHDRAWN" },
];

export default async function ClaimsQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const { page, take, skip, perPage } = pageParams(sp, 20);
  const [counts, rows, total] = await Promise.all([
    Promise.all(TABS.map((t) => db.organizationClaim.count({ where: { status: t.status } }))),
    db.organizationClaim.findMany({
      where: { status: tab.status },
      orderBy: { createdAt: tab.status === "PENDING" ? "asc" : "desc" },
      skip, take,
      include: {
        user: { select: { id: true, email: true, name: true, emailVerifiedAt: true, createdAt: true } },
        organization: {
          select: {
            id: true, name: true, slug: true, kind: true, status: true, isPublished: true, deletedAt: true, ownershipStatus: true, website: true, phone: true, email: true,
            _count: { select: { members: true } },
            claims: { select: { id: true, status: true, applicantName: true } },
          },
        },
      },
    }),
    db.organizationClaim.count({ where: { status: tab.status } }),
  ]);
  const reviewerIds = [...new Set(rows.map((r) => r.reviewedById).filter((x): x is string => !!x))];
  const reviewers = new Map((await db.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, email: true, name: true } })).map((u) => [u.id, u.name || u.email]));

  return (
    <>
      <PageHeader title="Ownership claims" back={{ href: "/admin/organizations/", label: "Nonprofits & churches" }} description="Requests to manage organization listings. Every claim is reviewed by a person — nothing is approved automatically. Claim details are private (staff and the claimant only)." />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: `/admin/organizations/claims/?tab=${t.key}`, active: t.key === tab.key, count: counts[i] }))} />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Inbox} title={`No ${tab.label.toLowerCase()} claims`} /></div>
      ) : (
        <ul className="space-y-4">
          {rows.map((c) => {
            const o = c.organization;
            const site = externalUrl(o.website);
            const personal = isPersonalEmailDomain(c.email);
            const risk = claimRiskReasons(c);
            const others = o.claims.filter((x) => x.id !== c.id);
            const otherPending = others.filter((x) => x.status === "PENDING");
            const affLines = (c.evidence ?? "").split("\n");
            return (
              <li key={c.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <Link href={`/admin/organizations/${o.id}/`} className="text-base font-semibold text-slate-900 hover:text-brand-700">{o.name}</Link>
                    <div className="mt-1 flex flex-wrap gap-1.5"><KindBadge kind={o.kind} /><OwnershipBadge status={o.ownershipStatus} /><PublishBadge published={o.isPublished} />{o.deletedAt && <span className="badge-red">Deleted</span>}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={CLAIM_STATUS_BADGE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</span>
                    {isOrgPublic(o) && <a href={orgHref(o)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" /> Listing</a>}
                  </div>
                </div>
                <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-slate-500">Applicant</dt><dd className="min-w-0 font-medium text-slate-900">{c.applicantName}</dd>
                    <dt className="text-slate-500">Role</dt><dd>{c.role}</dd>
                    <dt className="text-slate-500">Org email</dt>
                    <dd className="min-w-0">
                      <span className="break-all">{c.email}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.emailVerifiedAt ? <span className="badge-green">Email verified</span> : <span className="badge-amber">Email not verified</span>}
                        {c.emailDomainMatches && <span className="badge-green">Domain matches website</span>}
                        {personal && <span className="badge-red" title="gmail, yahoo, outlook, icloud, aol, hotmail, proton, etc.">Personal email provider — not sufficient on its own</span>}
                      </span>
                    </dd>
                    <dt className="text-slate-500">Phone</dt><dd>{c.phone || "—"}</dd>
                    <dt className="text-slate-500">Verify via</dt><dd>{c.verificationMethod ? CLAIM_VERIFY_LABEL[c.verificationMethod] ?? c.verificationMethod : "—"}</dd>
                    <dt className="text-slate-500">Account</dt>
                    <dd className="min-w-0"><span className="break-all">{c.user.email}</span> {c.user.emailVerifiedAt ? <span className="badge-green">verified</span> : <span className="badge-amber">unverified</span>}<span className="block text-xs text-slate-500">Account since {formatDateTime(c.user.createdAt)}</span></dd>
                    <dt className="text-slate-500">Submitted</dt><dd>{formatDateTime(c.createdAt)}</dd>
                    <dt className="text-slate-500">Listing</dt>
                    <dd className="min-w-0 text-slate-700">{site ? <a href={site.toString()} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{site.hostname}</a> : "No website"}{o.phone ? ` · ${o.phone}` : ""} · {o._count.members} manager{o._count.members === 1 ? "" : "s"}</dd>
                  </dl>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">Publicly verifiable affiliation</p>
                      <div className="mt-1 whitespace-pre-line break-words rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                        {affLines.map((l, i) => {
                          const m = l.match(/^Link: (https?:\/\/\S+)$/);
                          return <p key={i}>{m ? <a href={m[1]} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-700 underline">{m[1]}</a> : l || "—"}</p>;
                        })}
                      </div>
                    </div>
                    {c.message && <div><p className="font-semibold text-slate-800">Message</p><p className="mt-1 whitespace-pre-line break-words text-slate-700">{c.message}</p></div>}
                    {others.length > 0 && (
                      <div><p className="font-semibold text-slate-800">Other claims for this organization</p>
                        <ul className="mt-1 space-y-0.5 text-slate-700">{others.map((x) => <li key={x.id}>{x.applicantName} · <span className={CLAIM_STATUS_BADGE[x.status]}>{CLAIM_STATUS_LABEL[x.status]}</span></li>)}</ul>
                      </div>
                    )}
                    {c.status !== "PENDING" && (
                      <p className="text-slate-600">{CLAIM_STATUS_LABEL[c.status]}{c.reviewedAt ? ` ${formatDateTime(c.reviewedAt)}` : ""}{c.reviewedById ? ` by ${reviewers.get(c.reviewedById) ?? "staff"}` : ""}{c.reviewNote ? ` — ${c.reviewNote}` : ""}</p>
                    )}
                  </div>
                </div>
                {c.status === "PENDING" && (
                  <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                    {o.ownershipStatus === "CLAIMED" && <Notice tone="warn">This listing already has {o._count.members} manager{o._count.members === 1 ? "" : "s"}. Approving adds another owner — consider checking with the current managers.</Notice>}
                    {otherPending.length > 0 && <Notice tone="warn">{otherPending.length} other pending claim{otherPending.length === 1 ? "" : "s"} for this organization ({otherPending.map((x) => x.applicantName).join(", ")}). They stay pending after this decision.</Notice>}
                    {risk.length > 0 && (
                      <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <p>Email evidence is weak: {risk.join("; ")}. Verify another way (call the organization&apos;s public number, review documentation). Approval requires an override note.</p>
                      </div>
                    )}
                    <div className="grid gap-4 lg:grid-cols-2">
                      <ActionForm action={approveClaim} className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                        <input type="hidden" name="claimId" value={c.id} />
                        <fieldset>
                          <legend className="label">Verification performed (required)</legend>
                          <div className="space-y-1">
                            {Object.entries(CLAIM_REVIEW_CHECKS).map(([k, label]) => (
                              <label key={k} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-800">
                                <input type="checkbox" name="check" value={k} disabled={k === "domain_email" && (!c.emailVerifiedAt || !c.emailDomainMatches)} className="h-4 w-4 accent-brand-600" />
                                {label}{k === "domain_email" && (!c.emailVerifiedAt || !c.emailDomainMatches) && <span className="text-xs text-slate-400">(not available for this claim)</span>}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div><label htmlFor={`note-${c.id}`} className="label">Verification note</label><textarea id={`note-${c.id}`} name="note" rows={2} maxLength={1000} className="input min-h-16" placeholder="e.g. Called 330-555-0100 (listed on website), spoke with office manager" /></div>
                        {risk.length > 0 && <div><label htmlFor={`ov-${c.id}`} className="label">Override note (required)</label><textarea id={`ov-${c.id}`} name="override" rows={2} maxLength={1000} required className="input min-h-16" placeholder="Why approval is safe despite the weak email evidence" /></div>}
                        <Submit className="btn-primary" pendingText="Approving…"><CheckCircle2 className="h-4 w-4" /> Approve &amp; make owner</Submit>
                      </ActionForm>
                      <div className="space-y-3">
                        <ActionForm action={saveClaimNote} className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                          <input type="hidden" name="claimId" value={c.id} />
                          <label htmlFor={`sn-${c.id}`} className="label">Staff note (internal)</label>
                          <textarea id={`sn-${c.id}`} name="note" rows={2} maxLength={1000} defaultValue={c.reviewNote ?? ""} className="input min-h-16" />
                          <Submit className="btn-secondary btn-sm" pendingText="Saving…">Save note</Submit>
                        </ActionForm>
                        <ActionButton action={rejectClaim} fields={{ claimId: c.id }} prompt={{ name: "reason", label: "Reason (emailed to the person)", required: true }} confirm={{ title: `Reject ${c.applicantName}'s claim?`, body: "The listing stays as it is (published and unchanged).", confirmLabel: "Reject and email", danger: true }}>
                          <XCircle className="h-4 w-4" /> Reject
                        </ActionButton>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4"><Pagination total={total} page={page} perPage={perPage} basePath="/admin/organizations/claims/" params={{ ...sp, tab: tab.key }} /></div>
    </>
  );
}

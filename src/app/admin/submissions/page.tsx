import Link from "next/link";
import { Check, ExternalLink, Inbox, X } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { setEventStatus } from "../events/actions";
import { setGarageSaleStatus } from "../garage-sales/actions";
import { rejectApplication } from "../applications/actions";
import { setOrgStatus } from "../organizations/actions";
import { rejectClaim } from "../organizations/claims/actions";
import { setPromotionStatus } from "../specials/actions";
import { moderateUpdate } from "../updates/actions";
import { setJobStatus } from "../jobs/actions";
import { setSuggestionStatus } from "../suggestions/actions";
import { spGet, type SP } from "../_lib/list";
import { pendingCounts, pendingSubmissions, SUBMISSION_TYPES, type SubmissionRow, type SubmissionType } from "./data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community submissions" };

const TYPE_LABEL: Record<SubmissionType, string> = {
  event: "Event", garage_sale: "Garage sale", application: "Business application", organization: "Nonprofit / church",
  claim: "Ownership claim", special: "Special", update: "Business update", job: "Job", article: "Article", suggestion: "Resident suggestion",
};

const rejectPrompt = (name: string) => ({ name, label: "Reason (emailed to the submitter)", required: true });
const rejectConfirm = (title: string) => ({ title: `Reject “${title}”?`, confirmLabel: "Reject", danger: true });

/** Inline approve/reject reusing each system's own server action. Types needing more input link to their review screen. */
function InlineActions({ r }: { r: SubmissionRow }) {
  const approve = (action: Parameters<typeof ActionButton>[0]["action"], fields: Record<string, string>) => (
    <ActionButton action={action} fields={fields} className="btn-primary btn-sm" reloadOnSuccess><Check className="h-4 w-4" /> Approve</ActionButton>
  );
  const reject = (action: Parameters<typeof ActionButton>[0]["action"], fields: Record<string, string>, prompt: string) => (
    <ActionButton action={action} fields={fields} prompt={rejectPrompt(prompt)} confirm={rejectConfirm(r.title)} reloadOnSuccess><X className="h-4 w-4" /> Reject</ActionButton>
  );
  switch (r.type) {
    case "event": return <>{approve(setEventStatus, { id: r.id, status: "PUBLISHED" })}{reject(setEventStatus, { id: r.id, status: "REJECTED" }, "reason")}</>;
    case "garage_sale": return <>{approve(setGarageSaleStatus, { id: r.id, status: "PUBLISHED" })}{reject(setGarageSaleStatus, { id: r.id, status: "REJECTED" }, "reason")}</>;
    case "application": return reject(rejectApplication, { id: r.id }, "note"); // approval needs categories + owner options
    case "organization": return <>{approve(setOrgStatus, { orgId: r.id, status: "APPROVED" })}{reject(setOrgStatus, { orgId: r.id, status: "REJECTED" }, "note")}</>;
    case "claim": return reject(rejectClaim, { claimId: r.id }, "reason"); // approval requires recording the verification performed
    case "special": return <>{approve(setPromotionStatus, { id: r.id, status: "APPROVED" })}{reject(setPromotionStatus, { id: r.id, status: "REJECTED" }, "reason")}</>;
    case "update": return <>{approve(moderateUpdate, { id: r.id, decision: "approve" })}{reject(moderateUpdate, { id: r.id, decision: "reject" }, "reason")}</>;
    case "job": return approve(setJobStatus, { id: r.id, status: "PUBLISHED" });
    case "suggestion": return reject(setSuggestionStatus, { id: r.id, status: "REJECTED" }, "reason"); // approval = create content or mark approved on the review screen
    default: return null;
  }
}

export default async function SubmissionsQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const typeParam = spGet(sp, "type");
  const type = SUBMISSION_TYPES.find((t) => t.key === typeParam)?.key;
  const [{ counts, total }, rows] = await Promise.all([pendingCounts(), pendingSubmissions(type)]);
  const tabs = [
    { label: "All", href: "/admin/submissions/", active: !type, count: total },
    ...SUBMISSION_TYPES.filter((t) => counts[t.key] > 0 || t.key === type).map((t) => ({ label: t.label, href: `/admin/submissions/?type=${t.key}`, active: t.key === type, count: counts[t.key] })),
  ];
  return (
    <>
      <PageHeader
        title="Community submissions"
        description="Everything waiting for review across events, garage sales, listings, organizations, claims, specials, updates, jobs, articles and resident suggestions — oldest first. Submitter contact details are private to staff."
        actions={<Link href="/admin/freshness/" className="btn-secondary">Content freshness</Link>}
      />
      <LinkTabs items={tabs} />
      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(r) => `${r.type}:${r.id}`}
          empty={<EmptyState icon={Inbox} title={type ? "Nothing of this type is waiting" : "All caught up — nothing is waiting for review"} />}
          columns={[
            { header: "Type", cell: (r) => <span className="badge-blue whitespace-nowrap">{TYPE_LABEL[r.type]}</span> },
            {
              header: "Submission", primary: true, className: "min-w-[220px]",
              cell: (r) => (
                <div>
                  <Link href={r.reviewHref} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                  {r.badge && <div className="mt-1"><span className={r.badge.tone === "amber" ? "badge-amber" : "badge-blue"} data-testid="submission-badge">{r.badge.label}</span></div>}
                  {r.detail && <div className="mt-0.5 text-xs text-slate-500">{r.detail}</div>}
                </div>
              ),
            },
            { header: "Submitted", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.submittedAt)}</span> },
            { header: "Submitter", hideOnMobile: true, cell: (r) => <span className="text-slate-600">{r.submitterName || "—"}{r.submitterEmail && <span className="block break-all text-xs text-slate-500">{r.submitterEmail}</span>}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          actions={(r) => (
            <>
              <InlineActions r={r} />
              <Link href={r.reviewHref} className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> Review</Link>
            </>
          )}
        />
      </div>
      {rows.length >= 100 && <p className="mt-3 text-sm text-slate-500">Showing the oldest 100 of each type. Open a type&apos;s review screen to see the rest.</p>}
    </>
  );
}

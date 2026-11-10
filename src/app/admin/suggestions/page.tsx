import Link from "next/link";
import { ExternalLink, Lightbulb, X } from "lucide-react";
import type { SuggestionStatus } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { SUGGESTION_KINDS, suggestionKindLabel } from "@/lib/suggestions-shared";
import { pageParams, spGet, type SP } from "../_lib/list";
import { setSuggestionStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resident suggestions" };

const TABS: { key: string; label: string; status: SuggestionStatus }[] = [
  { key: "pending", label: "Pending", status: "PENDING" },
  { key: "approved", label: "Approved", status: "APPROVED" },
  { key: "rejected", label: "Rejected", status: "REJECTED" },
  { key: "withdrawn", label: "Withdrawn", status: "WITHDRAWN" },
];

export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const kindParam = spGet(sp, "kind");
  const kind = (SUGGESTION_KINDS as readonly string[]).includes(kindParam) ? (kindParam as (typeof SUGGESTION_KINDS)[number]) : undefined;
  const where = { status: tab.status, ...(kind ? { kind } : {}) };
  const { page, take, skip, perPage } = pageParams(sp, 25);
  const [rows, total, counts] = await Promise.all([
    db.communitySuggestion.findMany({ where, skip, take, orderBy: { createdAt: tab.key === "pending" ? "asc" : "desc" }, select: { id: true, kind: true, title: true, city: true, status: true, createdAt: true, updatedAt: true, submitterName: true, submitterEmail: true, resultRef: true } }),
    db.communitySuggestion.count({ where }),
    Promise.all(TABS.map((t) => db.communitySuggestion.count({ where: { status: t.status } }))),
  ]);
  return (
    <>
      <PageHeader title="Resident suggestions" description="New business openings, community updates, attractions and volunteer opportunities suggested by residents. Nothing is published automatically; submitter details are private to staff." />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: `/admin/suggestions/?tab=${t.key}${kind ? `&kind=${kind}` : ""}`, active: t.key === tab.key, count: counts[i] }))} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/admin/suggestions/?tab=${tab.key}`} className={!kind ? "badge-blue" : "badge-gray"}>All kinds</Link>
        {SUGGESTION_KINDS.map((k) => <Link key={k} href={`/admin/suggestions/?tab=${tab.key}&kind=${k}`} className={kind === k ? "badge-blue" : "badge-gray"}>{suggestionKindLabel(k)}</Link>)}
      </div>
      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Lightbulb} title={tab.key === "pending" ? "Nothing waiting for review" : "No suggestions here"} />}
          columns={[
            { header: "Kind", cell: (r) => <span className="badge-blue whitespace-nowrap">{suggestionKindLabel(r.kind)}</span> },
            {
              header: "Suggestion", primary: true, className: "min-w-[220px]",
              cell: (r) => (
                <div>
                  <Link href={`/admin/suggestions/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                  <div className="mt-0.5 text-xs text-slate-500">{[r.city, r.resultRef ? "Content created" : null, r.updatedAt.getTime() - r.createdAt.getTime() > 60_000 && r.status === "PENDING" ? "Edited by submitter" : null].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              ),
            },
            { header: "Submitted", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</span> },
            { header: "Submitter (private)", hideOnMobile: true, cell: (r) => <span className="text-slate-600">{r.submitterName || "—"}<span className="block break-all text-xs text-slate-500">{r.submitterEmail}</span></span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          ]}
          actions={(r) => (
            <>
              {r.status === "PENDING" && <ActionButton action={setSuggestionStatus} fields={{ id: r.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the submitter)", required: true }} confirm={{ title: `Reject “${r.title}”?`, confirmLabel: "Reject", danger: true }} reloadOnSuccess><X className="h-4 w-4" /> Reject</ActionButton>}
              <Link href={`/admin/suggestions/${r.id}/`} className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> Review</Link>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/suggestions/" params={sp} />
      </div>
    </>
  );
}

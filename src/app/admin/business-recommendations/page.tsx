import Link from "next/link";
import { CheckCircle2, ExternalLink, Inbox, Lightbulb, PhoneCall, Store, Users } from "lucide-react";
import type { BusinessLeadStatus, Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { StatCard } from "@/components/admin/stat-card";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { EmptyState } from "@/components/ui/empty-state";
import { exactDirectoryHits, leadStats } from "@/lib/business-leads";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/business-leads-shared";
import { pageParams, spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business recommendations" };

const BASE = "/admin/business-recommendations/";

export default async function BusinessRecommendationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const statusParam = spGet(sp, "status").toUpperCase();
  const status = (LEAD_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as BusinessLeadStatus) : null;
  const q = spGet(sp, "q").trim().slice(0, 100);
  const { page, take, skip, perPage } = pageParams(sp, 30);
  const contains = { contains: q, mode: "insensitive" as const };
  const where: Prisma.BusinessLeadWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { name: contains }, { city: contains }, { category: contains }, { website: contains }, { adminNotes: contains },
      { submissions: { some: { OR: [{ businessName: contains }, { reason: contains }, { submitterFirstName: contains }, { submitterEmail: contains }] } } },
    ] } : {}),
  };
  const [rows, total, counts, all, stats] = await Promise.all([
    db.businessLead.findMany({
      where, skip, take, orderBy: [{ lastSubmittedAt: "desc" }],
      select: { id: true, name: true, city: true, category: true, website: true, status: true, submissionCount: true, lastSubmittedAt: true, createdAt: true, business: { select: { id: true, name: true, status: true } } },
    }),
    db.businessLead.count({ where }),
    db.businessLead.groupBy({ by: ["status"], _count: { _all: true } }),
    db.businessLead.count(),
    leadStats(),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const hits = await exactDirectoryHits(rows.filter((r) => !r.business));
  const tabHref = (s: string | null) => `${BASE}${s ? `?status=${s.toLowerCase()}` : ""}${q ? `${s ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Business recommendations"
        description="Businesses residents think should be listed (from Recommend a Business). Recommendations for the same business are grouped; every submission is kept. Nothing here creates a public listing — link an existing listing or create one for review. Submitter details are private to staff."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="lead-stats">
        <StatCard label="Recommendations received" value={stats.total} icon={Inbox} />
        <StatCard label="Unique businesses" value={stats.unique} icon={Store} tone="navy" />
        <StatCard label="New — awaiting review" value={stats.awaiting} icon={Lightbulb} tone="amber" href={tabHref("NEW")} />
        <StatCard label="Businesses contacted" value={stats.contacted} icon={PhoneCall} tone="orange" />
        <StatCard label="Added to the directory" value={stats.added} icon={CheckCircle2} tone="green" href={tabHref("ADDED")} />
      </div>
      <LinkTabs items={[
        { label: "All", href: tabHref(null), active: !status, count: all },
        ...LEAD_STATUSES.map((s) => ({ label: LEAD_STATUS_LABEL[s], href: tabHref(s), active: status === s, count: count(s) })),
      ]} />
      <div className="mb-4"><ListToolbar placeholder="Search business, town, notes, submitter…" /></div>
      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Lightbulb} title={q ? "No recommendations match that search" : "No recommendations here yet"} />}
          columns={[
            {
              header: "Business", primary: true, className: "min-w-[220px]",
              cell: (r) => (
                <div>
                  <Link href={`${BASE}${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700" data-testid="lead-link">{r.name}</Link>
                  <div className="mt-0.5 text-xs text-slate-500">{[r.city, r.category].filter(Boolean).join(" · ")}</div>
                  {r.website && <div className="mt-0.5 max-w-[260px] truncate text-xs text-slate-500">{r.website}</div>}
                </div>
              ),
            },
            { header: "Times recommended", cell: (r) => <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-navy-900" data-testid="lead-count"><Users className="h-4 w-4 text-slate-400" aria-hidden />{r.submissionCount}</span> },
            {
              header: "In directory?", hideOnMobile: true,
              cell: (r) => r.business
                ? <Link href={`/admin/businesses/${r.business.id}/`} className="text-sm font-medium text-hillside-700 hover:underline">Linked: {r.business.name}</Link>
                : hits.get(r.id)
                  ? <Link href={`/admin/businesses/${hits.get(r.id)!.id}/`} className="badge-amber hover:underline" data-testid="lead-possible-match">Possible match: {hits.get(r.id)!.name}</Link>
                  : <span className="text-sm text-slate-400">No match found</span>,
            },
            { header: "Last recommended", hideOnMobile: true, cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.lastSubmittedAt)}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} label={LEAD_STATUS_LABEL[r.status]} /> },
          ]}
          actions={(r) => <Link href={`${BASE}${r.id}/`} className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> Review</Link>}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath={BASE} params={sp} />
      </div>
    </>
  );
}

import Link from "next/link";
import { Newspaper, Plus } from "lucide-react";
import type { NewsletterStatus, Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../../_lib/list";
import { createCampaignAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter campaigns" };

const TABS: { key: string; label: string; statuses: NewsletterStatus[] }[] = [
  { key: "drafts", label: "Drafts & approved", statuses: ["DRAFT", "APPROVED"] },
  { key: "scheduled", label: "Scheduled & sending", statuses: ["SCHEDULED", "SENDING"] },
  { key: "sent", label: "Sent", statuses: ["SENT"] },
  { key: "other", label: "Canceled & failed", statuses: ["CANCELED", "FAILED"] },
];

type Stats = { sent?: number; delivered?: number; opened?: number; clicked?: number; bounced?: number; reported?: boolean };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const { page, take, skip, perPage } = pageParams(sp);
  const where: Prisma.NewsletterWhereInput = { status: { in: tab.statuses } };
  const [rows, total, counts] = await Promise.all([
    db.newsletter.findMany({ where, skip, take, orderBy: [{ sentAt: "desc" }, { scheduledFor: "asc" }, { updatedAt: "desc" }] }),
    db.newsletter.count({ where }),
    Promise.all(TABS.map((t) => db.newsletter.count({ where: { status: { in: t.statuses } } }))),
  ]);
  return (
    <>
      <PageHeader title="Campaigns" description="Build an issue from site content, preview it, send a test, approve it, then schedule or send." actions={<form action={createCampaignAction}><button className="btn-primary"><Plus className="h-4 w-4" /> New campaign</button></form>} />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: `/admin/newsletter/campaigns/?tab=${t.key}`, active: t.key === tab.key, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Newspaper} title="No campaigns here" />}
          columns={[
            { header: "Subject", primary: true, className: "min-w-[260px]", cell: (r) => <Link href={`/admin/newsletter/campaigns/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.subject}</Link> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "When", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.sentAt ? `Sent ${formatDateTime(r.sentAt)}` : r.scheduledFor ? formatDateTime(r.scheduledFor) : `Edited ${formatDateTime(r.updatedAt)}`}</span> },
            { header: "Recipients", align: "right", cell: (r) => <span className="tabular-nums">{r.recipientCount || "—"}</span> },
            { header: "Delivered / opened", hideOnMobile: true, cell: (r) => {
              const s = (r.stats ?? {}) as Stats;
              return s.reported ? <span className="tabular-nums text-slate-600">{s.delivered ?? 0} / {s.opened ?? 0}</span> : <span className="text-slate-400">—</span>;
            } },
          ]}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/newsletter/campaigns/" params={sp} />
      </div>
    </>
  );
}

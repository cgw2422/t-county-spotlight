import { ShieldBan } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppression list" };

const REASONS = ["unsubscribed", "bounced", "complained", "manual"];

export default async function SuppressionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = spGet(sp, "q"), reason = spGet(sp, "reason");
  const { page, take, skip, perPage } = pageParams(sp, 50);
  const where: Prisma.EmailSuppressionWhereInput = {
    ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
    ...(REASONS.includes(reason) ? { reason } : {}),
  };
  const [rows, total] = await Promise.all([
    db.emailSuppression.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    db.emailSuppression.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Suppression list" description="Addresses we never email: people who unsubscribed, hard bounces, spam complaints and manual removals. It's kept even if the subscriber record is deleted. A person can only come off this list by signing up again and confirming." />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search email…" filters={[{ name: "reason", label: "Reason", options: REASONS.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) })) }]} />
        <DataTable
          rows={rows}
          rowKey={(r) => r.email}
          empty={<EmptyState icon={ShieldBan} title="No suppressed addresses" />}
          columns={[
            { header: "Email", primary: true, cell: (r) => <span className="break-all font-medium text-slate-900">{r.email}</span> },
            { header: "Reason", cell: (r) => <StatusBadge status={r.reason === "unsubscribed" ? "Draft" : r.reason === "manual" ? "Hidden" : "REJECTED"} label={r.reason} /> },
            { header: "Since", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</span> },
          ]}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/newsletter/suppressions/" params={sp} />
      </div>
    </>
  );
}

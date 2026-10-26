import Link from "next/link";
import { Ban, ExternalLink, HandHelping, RotateCcw, Trash2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { NEED_CATEGORIES, NEED_CATEGORY_LABEL, NEED_STATUSES, NEED_STATUS_LABEL, NEED_URGENCIES, URGENCY_LABEL, needHref } from "@/lib/gives/constants";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { UrgencyBadge } from "@/components/gives/badges";
import { moderateNeed } from "../organizations/actions";
import { pageParams, spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community needs" };

export default async function AdminNeedsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), status = spGet(sp, "status"), category = spGet(sp, "category"), urgency = spGet(sp, "urgency");
  const { page, take, skip, perPage } = pageParams(sp);
  const removed = status === "removed";
  const where: Prisma.CommunityNeedWhereInput = {
    deletedAt: removed ? { not: null } : null,
    ...((NEED_STATUSES as readonly string[]).includes(status) ? { status: status as Prisma.EnumNeedStatusFilter["equals"] } : {}),
    ...((NEED_CATEGORIES as readonly string[]).includes(category) ? { category: category as Prisma.EnumNeedCategoryFilter["equals"] } : {}),
    ...((NEED_URGENCIES as readonly string[]).includes(urgency) ? { urgency: urgency as Prisma.EnumNeedUrgencyFilter["equals"] } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { organization: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.communityNeed.findMany({
      where, skip, take, orderBy: { createdAt: "desc" },
      include: { organization: { select: { id: true, name: true, status: true } }, pledges: { select: { status: true, quantity: true } } },
    }),
    db.communityNeed.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Community needs" description="Every need posted by organizations. Close or remove anything inappropriate. Pledge contact details are visible to staff on each organization's need page." />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search need or organization…"
          filters={[
            { name: "status", label: "Status", options: [...NEED_STATUSES.map((s) => ({ value: s, label: NEED_STATUS_LABEL[s] })), { value: "removed", label: "Removed" }] },
            { name: "category", label: "Category", options: NEED_CATEGORIES.map((c) => ({ value: c, label: NEED_CATEGORY_LABEL[c] })) },
            { name: "urgency", label: "Urgency", options: NEED_URGENCIES.map((u) => ({ value: u, label: URGENCY_LABEL[u] })) },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={HandHelping} title="No needs found" />}
          columns={[
            { header: "Need", primary: true, className: "min-w-[220px]", cell: (r) => (
              <div className="min-w-0">
                <Link href={`/organization/${r.organization.id}/needs/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                <p className="text-sm text-slate-500"><Link href={`/admin/organizations/${r.organization.id}/`} className="hover:underline">{r.organization.name}</Link>{r.organization.status !== "APPROVED" && ` (${r.organization.status.toLowerCase()})`}</p>
              </div>
            ) },
            { header: "Urgency", cell: (r) => <UrgencyBadge urgency={r.urgency} /> },
            { header: "Status", cell: (r) => <span className="badge-gray">{r.deletedAt ? "Removed" : NEED_STATUS_LABEL[r.status]}</span> },
            { header: "Pledges", cell: (r) => { const live = r.pledges.filter((p) => p.status !== "CANCELLED"); return `${live.length} (${live.reduce((n, p) => n + p.quantity, 0)} items)`; } },
            { header: "Received", cell: (r) => `${r.quantityReceived}${r.quantityNeeded ? ` / ${r.quantityNeeded}` : ""}`, hideOnMobile: true },
            { header: "Posted", cell: (r) => formatDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" }), hideOnMobile: true },
          ]}
          actions={(r) => r.deletedAt ? (
            <ActionButton action={moderateNeed} fields={{ needId: r.id, op: "reopen" }}><RotateCcw className="h-4 w-4" /> Restore</ActionButton>
          ) : (
            <>
              {r.organization.status === "APPROVED" && r.status !== "DRAFT" && <a href={needHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label="View"><ExternalLink className="h-4 w-4" /></a>}
              {["OPEN", "PARTIALLY_FULFILLED"].includes(r.status) ? (
                <ActionButton action={moderateNeed} fields={{ needId: r.id, op: "close" }}><Ban className="h-4 w-4" /> Close</ActionButton>
              ) : (
                <ActionButton action={moderateNeed} fields={{ needId: r.id, op: "reopen" }}><RotateCcw className="h-4 w-4" /> Reopen</ActionButton>
              )}
              <ConfirmButton action={moderateNeed} fields={{ needId: r.id, op: "remove" }} title="Remove this need?" body="It is hidden from the public site and from the organization's dashboard." confirmLabel="Remove"><Trash2 className="h-4 w-4" /> Remove</ConfirmButton>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/needs/" params={sp} />
      </div>
    </>
  );
}

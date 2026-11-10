import Link from "next/link";
import { Check, Eye, Plus, Tag, Trash2, X } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { activeSaleWhere, endedSaleWhere } from "@/lib/garage-sales";
import { formatHours, formatSaleDates, saleTypeLabel } from "@/lib/garage-sales-shared";
import { pageParams, spGet, type SP } from "../_lib/list";
import { setGarageSaleStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Garage sales" };

export default async function AdminGarageSalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const TABS: { key: string; label: string; where: Prisma.GarageSaleWhereInput; order: Prisma.GarageSaleOrderByWithRelationInput }[] = [
    { key: "pending", label: "Pending", where: { status: "PENDING" }, order: { createdAt: "asc" } },
    { key: "published", label: "Published", where: activeSaleWhere(), order: { startDate: "asc" } },
    { key: "ended", label: "Ended", where: endedSaleWhere(), order: { endDate: "desc" } },
    { key: "rejected", label: "Rejected", where: { status: "REJECTED" }, order: { updatedAt: "desc" } },
    { key: "removed", label: "Removed", where: { status: "REMOVED" }, order: { updatedAt: "desc" } },
  ];
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const q = spGet(sp, "q");
  const { page, take, skip, perPage } = pageParams(sp);
  const filters: Prisma.GarageSaleWhereInput = q
    ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { submitterEmail: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }] }
    : {};
  const where = { AND: [tab.where, filters] };
  const [rows, total, counts] = await Promise.all([
    db.garageSale.findMany({ where, skip, take, orderBy: tab.order }),
    db.garageSale.count({ where }),
    Promise.all(TABS.map((t) => db.garageSale.count({ where: { AND: [t.where, filters] } }))),
  ]);
  const href = (k: string) => `/admin/garage-sales/?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <>
      <PageHeader
        title="Garage sales"
        description="Resident-submitted garage, yard and rummage sales. Submitter name, email and (for general-location sales) street address are private — visible to staff only."
        actions={<Link href="/garage-sales/submit/" className="btn-primary"><Plus className="h-4 w-4" /> Add a sale</Link>}
      />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: href(t.key), active: t.key === tab.key, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search title, town, email or address…" />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Tag} title={tab.key === "pending" ? "No sales waiting for review" : "No sales here"} />}
          columns={[
            {
              header: "Sale", primary: true, className: "min-w-[240px]",
              cell: (r) => (
                <div>
                  <Link href={`/admin/garage-sales/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                  <div className="mt-0.5 text-xs text-slate-500">{saleTypeLabel(r.saleType)} · {r.addressVisibility === "EXACT" ? "Exact address shown" : "General location"}</div>
                </div>
              ),
            },
            { header: "When", cell: (r) => <span className="whitespace-nowrap text-slate-700">{formatSaleDates(r.startDate, r.endDate)}<span className="block text-xs text-slate-500">{formatHours(r.dailyStart, r.dailyEnd)}</span></span> },
            { header: "Where", cell: (r) => <span className="text-slate-600">{r.city || "—"}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Submitted", hideOnMobile: true, cell: (r) => <span className="text-slate-600">{r.submitterEmail}<span className="block text-xs text-slate-400">{formatDateTime(r.createdAt)}</span></span> },
          ]}
          actions={(r) => (
            <>
              {r.status === "PENDING" && (
                <>
                  <ActionButton action={setGarageSaleStatus} fields={{ id: r.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>
                  <ActionButton action={setGarageSaleStatus} fields={{ id: r.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the submitter)", required: true }} confirm={{ title: `Reject “${r.title}”?`, confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>
                </>
              )}
              {r.status === "PUBLISHED" && (
                <ActionButton action={setGarageSaleStatus} fields={{ id: r.id, status: "REMOVED" }} confirm={{ title: `Remove “${r.title}”?`, body: "It will no longer be listed publicly.", confirmLabel: "Remove", danger: true }}><Trash2 className="h-4 w-4" /> Remove</ActionButton>
              )}
              <Link href={`/admin/garage-sales/${r.id}/`} className="btn-secondary btn-sm"><Eye className="h-4 w-4" /> View</Link>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/garage-sales/" params={sp} />
      </div>
    </>
  );
}

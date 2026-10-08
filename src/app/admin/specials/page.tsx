import Link from "next/link";
import { Plus, BadgePercent, Pencil, Check, X, Star } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { promotionStatus } from "@/lib/promotions";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { setPromotionStatus, togglePromotionFlag } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Specials" };

const EFFECTIVE: Record<string, (now: Date) => Prisma.PromotionWhereInput> = {
  active: (now) => ({ status: "APPROVED", startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gte: now } }] }),
  scheduled: (now) => ({ status: "APPROVED", startsAt: { gt: now } }),
  expired: (now) => ({ status: "APPROVED", endsAt: { lt: now } }),
  PENDING: () => ({ status: "PENDING" }), DRAFT: () => ({ status: "DRAFT" }), REJECTED: () => ({ status: "REJECTED" }), UNPUBLISHED: () => ({ status: "UNPUBLISHED" }),
};

export default async function SpecialsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), status = spGet(sp, "status");
  const { page, take, skip, perPage } = pageParams(sp);
  const now = new Date();
  const where: Prisma.PromotionWhereInput = {
    deletedAt: null,
    ...(EFFECTIVE[status] ? EFFECTIVE[status](now) : {}),
    ...(q ? { AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { business: { name: { contains: q, mode: "insensitive" } } }] }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.promotion.findMany({ where, skip, take, orderBy: [{ status: "asc" }, { startsAt: "desc" }], include: { business: { select: { name: true, id: true } }, _count: { select: { redemptions: true } } } }),
    db.promotion.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Specials" description="Deals and offers from local businesses. Expired specials drop off the site automatically." actions={<Link href="/admin/specials/new/" className="btn-primary"><Plus className="h-4 w-4" /> Add special</Link>} />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search specials or businesses…"
          filters={[{ name: "status", label: "Status", options: [
            { value: "active", label: "Active" }, { value: "scheduled", label: "Scheduled" }, { value: "PENDING", label: "Pending approval" }, { value: "expired", label: "Expired" },
            { value: "DRAFT", label: "Draft" }, { value: "UNPUBLISHED", label: "Unpublished" }, { value: "REJECTED", label: "Rejected" },
          ] }]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={BadgePercent} title={q || status ? "No specials match your filters" : "No specials yet"} />}
          columns={[
            {
              header: "Special", primary: true, className: "min-w-[220px]",
              cell: (r) => (
                <div>
                  <Link href={`/admin/specials/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                    <span>{r.business.name}</span>
                    {r.isFeatured && <span className="badge-blue">Featured</span>}
                    {r.isSponsored && <span className="badge-sponsored">Sponsored</span>}
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <StatusBadge status={promotionStatus(r, now)} /> },
            { header: "Runs", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.startsAt, { month: "short", day: "numeric" })} – {r.endsAt ? formatDate(r.endsAt, { month: "short", day: "numeric", year: "numeric" }) : "ongoing"}</span> },
            { header: "Redemptions", cell: (r) => <span className="tabular-nums">{r._count.redemptions}{r.redemptionLimit ? ` / ${r.redemptionLimit}` : ""}</span> },
          ]}
          actions={(r) => (
            <>
              {r.status === "PENDING" && (
                <>
                  <ActionButton action={setPromotionStatus} fields={{ id: r.id, status: "APPROVED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>
                  <ActionButton action={setPromotionStatus} fields={{ id: r.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the business)", required: true }} confirm={{ title: `Reject “${r.title}”?`, confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>
                </>
              )}
              {r.status === "APPROVED" && (
                <ActionButton action={togglePromotionFlag} fields={{ id: r.id, flag: "isFeatured", value: r.isFeatured ? "false" : "true" }} className={r.isFeatured ? "btn-secondary btn-sm text-amber-600" : "btn-ghost btn-sm"} title={r.isFeatured ? "Unfeature" : "Feature"}>
                  <Star className="h-4 w-4" fill={r.isFeatured ? "currentColor" : "none"} /><span className="sr-only">{r.isFeatured ? "Unfeature" : "Feature"}</span>
                </ActionButton>
              )}
              <Link href={`/admin/specials/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/specials/" params={sp} />
      </div>
    </>
  );
}

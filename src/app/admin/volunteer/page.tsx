import Link from "next/link";
import { Ban, ExternalLink, RotateCcw, Trash2, UsersRound } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { OPPORTUNITY_STATUSES, OPPORTUNITY_STATUS_LABEL, opportunityHref } from "@/lib/gives/constants";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { moderateOpportunity } from "../organizations/actions";
import { pageParams, spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer opportunities" };

export default async function AdminVolunteerPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), status = spGet(sp, "status"), when = spGet(sp, "when");
  const { page, take, skip, perPage } = pageParams(sp);
  const now = new Date();
  const removed = status === "removed";
  const where: Prisma.VolunteerOpportunityWhereInput = {
    deletedAt: removed ? { not: null } : null,
    ...((OPPORTUNITY_STATUSES as readonly string[]).includes(status) ? { status: status as Prisma.EnumOpportunityStatusFilter["equals"] } : {}),
    ...(when === "upcoming" ? { OR: [{ isOngoing: true }, { endAt: { gte: now } }, { endAt: null, startAt: { gte: now } }, { startAt: null, endAt: null }] } : when === "past" ? { isOngoing: false, OR: [{ endAt: { lt: now } }, { endAt: null, startAt: { lt: now } }] } : {}),
    ...(q ? { AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { organization: { name: { contains: q, mode: "insensitive" } } }] }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.volunteerOpportunity.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { organization: { select: { id: true, name: true, status: true } }, signups: { select: { status: true } } } }),
    db.volunteerOpportunity.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Volunteer opportunities" description="All opportunities across organizations, with sign-up counts. Open one to view its registrations." />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search opportunity or organization…"
          filters={[
            { name: "status", label: "Status", options: [...OPPORTUNITY_STATUSES.map((s) => ({ value: s, label: OPPORTUNITY_STATUS_LABEL[s] })), { value: "removed", label: "Removed" }] },
            { name: "when", label: "When", options: [{ value: "upcoming", label: "Upcoming & ongoing" }, { value: "past", label: "Past" }] },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={UsersRound} title="No opportunities found" />}
          columns={[
            { header: "Opportunity", primary: true, className: "min-w-[220px]", cell: (r) => (
              <div className="min-w-0">
                <Link href={`/admin/volunteer/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                <p className="text-sm text-slate-500"><Link href={`/admin/organizations/${r.organization.id}/`} className="hover:underline">{r.organization.name}</Link></p>
              </div>
            ) },
            { header: "When", cell: (r) => r.isOngoing ? "Ongoing" : r.startAt ? formatDateTime(r.startAt) : "TBA" },
            { header: "Status", cell: (r) => <span className="badge-gray">{r.deletedAt ? "Removed" : OPPORTUNITY_STATUS_LABEL[r.status]}</span> },
            { header: "Sign-ups", cell: (r) => { const a = r.signups.filter((s) => s.status === "REGISTERED" || s.status === "CONFIRMED").length; const w = r.signups.filter((s) => s.status === "WAITLISTED").length; return `${a}${r.spots != null ? ` / ${r.spots}` : ""}${w ? ` · ${w} waitlisted` : ""}`; } },
          ]}
          actions={(r) => r.deletedAt ? (
            <ActionButton action={moderateOpportunity} fields={{ oppId: r.id, op: "reopen" }}><RotateCcw className="h-4 w-4" /> Restore</ActionButton>
          ) : (
            <>
              <Link href={`/admin/volunteer/${r.id}/`} className="btn-secondary btn-sm">Registrations</Link>
              {r.organization.status === "APPROVED" && r.status !== "DRAFT" && <a href={opportunityHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label="View"><ExternalLink className="h-4 w-4" /></a>}
              {r.status === "PUBLISHED" ? <ActionButton action={moderateOpportunity} fields={{ oppId: r.id, op: "close" }}><Ban className="h-4 w-4" /> Close</ActionButton> : <ActionButton action={moderateOpportunity} fields={{ oppId: r.id, op: "reopen" }}><RotateCcw className="h-4 w-4" /> Reopen</ActionButton>}
              <ConfirmButton action={moderateOpportunity} fields={{ oppId: r.id, op: "remove" }} title="Remove this opportunity?" body="It is hidden from the public site and the organization's dashboard." confirmLabel="Remove"><Trash2 className="h-4 w-4" /> Remove</ConfirmButton>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/volunteer/" params={sp} />
      </div>
    </>
  );
}

import Link from "next/link";
import { Plus, Briefcase, Pencil, Check } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { setJobStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), status = spGet(sp, "status");
  const { page, take, skip, perPage } = pageParams(sp);
  const where: Prisma.JobWhereInput = {
    deletedAt: null,
    ...(status ? { status: status as Prisma.EnumPublishStatusFilter["equals"] } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { employerName: { contains: q, mode: "insensitive" } }, { business: { name: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.job.findMany({ where, skip, take, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { business: { select: { name: true } } } }),
    db.job.count({ where }),
  ]);
  const now = new Date();
  return (
    <>
      <PageHeader title="Jobs" description="Local job listings." actions={<Link href="/admin/jobs/new/" className="btn-primary"><Plus className="h-4 w-4" /> Add job</Link>} />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search jobs or employers…" filters={[{ name: "status", label: "Status", options: ["PUBLISHED", "PENDING", "DRAFT", "ARCHIVED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() })) }]} />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Briefcase} title="No jobs listed" />}
          columns={[
            { header: "Job", primary: true, cell: (r) => <div><Link href={`/admin/jobs/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>{r.isSponsored && <span className="badge-sponsored ml-2">Sponsored</span>}<p className="text-xs text-slate-500">{r.business?.name || r.employerName}</p></div> },
            { header: "Type", cell: (r) => r.employmentType || "—" },
            { header: "Status", cell: (r) => <StatusBadge status={r.expiresAt && r.expiresAt < now && r.status === "PUBLISHED" ? "Expired" : r.status} /> },
            { header: "Posted", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span> },
          ]}
          actions={(r) => (
            <>
              {r.status === "PENDING" && <ActionButton action={setJobStatus} fields={{ id: r.id, status: "PUBLISHED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>}
              <Link href={`/admin/jobs/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/jobs/" params={sp} />
      </div>
    </>
  );
}

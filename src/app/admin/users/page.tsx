import Link from "next/link";
import { Users, Pencil } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };

export const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", EDITOR: "Editor", BUSINESS_OWNER: "Business owner", MEMBER: "Member" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = spGet(sp, "q"), role = spGet(sp, "role"), status = spGet(sp, "status");
  const { page, take, skip, perPage } = pageParams(sp);
  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(role ? { role: role as Prisma.EnumRoleFilter["equals"] } : {}),
    ...(status ? { status: status as Prisma.EnumUserStatusFilter["equals"] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true, role: true, status: true, createdAt: true, lastLoginAt: true, totpEnabled: true, passwordHash: true, _count: { select: { businesses: true } } } }),
    db.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Users" description="Everyone with an account: staff, business owners and community members." />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search name or email…"
          filters={[
            { name: "role", label: "Role", options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })) },
            { name: "status", label: "Status", options: [{ value: "ACTIVE", label: "Active" }, { value: "SUSPENDED", label: "Suspended" }, { value: "DELETED", label: "Deleted" }] },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={Users} title="No users match" />}
          columns={[
            { header: "User", primary: true, cell: (r) => <div className="min-w-0"><Link href={`/admin/users/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name || r.email}</Link><p className="truncate text-xs text-slate-500">{r.email}</p></div> },
            { header: "Role", cell: (r) => <span className={r.role === "ADMIN" ? "badge-blue" : r.role === "EDITOR" ? "badge-blue" : r.role === "BUSINESS_OWNER" ? "badge-orange" : "badge-gray"}>{ROLE_LABEL[r.role]}</span> },
            { header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{!r.passwordHash && <span className="badge-amber">No password</span>}{r.totpEnabled && <span className="badge-green">2FA</span>}</div> },
            { header: "Businesses", cell: (r) => r._count.businesses || "—", hideOnMobile: true },
            { header: "Joined", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span>, hideOnMobile: true },
            { header: "Last sign-in", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.lastLoginAt ? formatDate(r.lastLoginAt, { month: "short", day: "numeric", year: "numeric" }) : "Never"}</span> },
          ]}
          actions={(r) => <Link href={`/admin/users/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Manage</Link>}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/users/" params={sp} />
      </div>
    </>
  );
}

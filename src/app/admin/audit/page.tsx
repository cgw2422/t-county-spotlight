import Link from "next/link";
import { ScrollText } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { describeAudit } from "./describe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };

const ENTITY_LINK: Record<string, (id: string) => string> = {
  Article: (id) => `/admin/articles/${id}/`, Business: (id) => `/admin/businesses/${id}/`, Event: (id) => `/admin/events/${id}/`,
  Promotion: (id) => `/admin/specials/${id}/`, Page: (id) => `/admin/pages/${id}/`, User: (id) => `/admin/users/${id}/`,
  Media: (id) => `/admin/media/${id}/`, BusinessApplication: (id) => `/admin/applications/${id}/`, Job: (id) => `/admin/jobs/${id}/`,
  MembershipPlan: (id) => `/admin/memberships/plans/${id}/`,
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const action = spGet(sp, "action"), entity = spGet(sp, "entity"), user = spGet(sp, "user"), q = spGet(sp, "q");
  const { page, take, skip, perPage } = pageParams(sp, 50);
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(entity ? { entityType: entity } : {}),
    ...(user ? (user === "system" ? { userId: null } : { userId: user }) : {}),
    ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entityId: q }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total, actions, entities, users] = await Promise.all([
    db.auditLog.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true, name: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" }, take: 300 }),
    db.auditLog.findMany({ distinct: ["entityType"], select: { entityType: true }, where: { entityType: { not: null } }, take: 100 }),
    db.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, email: true }, orderBy: { email: "asc" }, take: 200 }),
  ]);
  const scopes = [...new Set(actions.map((a) => a.action.split(".")[0]))];
  return (
    <>
      <PageHeader title="Audit log" description="A permanent record of publishing, approvals, permission, membership and settings changes." />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search action, email or record id…"
          filters={[
            { name: "action", label: "Action", options: [...scopes.map((s) => ({ value: `${s}.`, label: `${s}.*` })), ...actions.map((a) => ({ value: a.action, label: a.action }))] },
            { name: "entity", label: "Record", options: entities.map((e) => ({ value: e.entityType!, label: e.entityType! })) },
            { name: "user", label: "User", options: [{ value: "system", label: "System" }, ...users.map((u) => ({ value: u.id, label: u.email }))] },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ScrollText} title="No entries" />}
          columns={[
            { header: "When", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</span> },
            { header: "Event", primary: true, className: "min-w-[260px]", cell: (r) => <div><p className="text-slate-900">{describeAudit(r)}</p><code className="text-[11px] text-slate-500">{r.action}</code></div> },
            { header: "User", cell: (r) => <span className="text-slate-600">{r.user ? r.user.name || r.user.email : "System"}</span> },
            {
              header: "Record",
              cell: (r) => r.entityType ? (r.entityId && ENTITY_LINK[r.entityType] ? <Link className="text-brand-700 hover:underline" href={ENTITY_LINK[r.entityType](r.entityId)}>{r.entityType}</Link> : <span>{r.entityType}</span>) : "—",
            },
            { header: "Details", hideOnMobile: true, cell: (r) => r.details ? <details><summary className="cursor-pointer text-xs text-brand-700">View</summary><pre className="mt-1 max-w-md overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[11px] text-slate-700">{JSON.stringify(r.details, null, 2)}</pre></details> : "—" },
          ]}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/audit/" params={sp} />
      </div>
    </>
  );
}

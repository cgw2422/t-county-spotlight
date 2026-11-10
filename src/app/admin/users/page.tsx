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
import { ROLE_LABEL } from "../_lib/labels";
import { ALL_COUNTY_LABEL } from "@/lib/my-t-county-shared";

const n = (v: number) => v.toLocaleString("en-US");

/**
 * Resident account numbers (role Member = free resident accounts; business owners, editors and
 * admins can use My T County too but are counted separately). Aggregate counts only.
 */
async function residentStats() {
  const day = 86400_000;
  const now = Date.now();
  const residents = { role: "MEMBER" as const, status: { not: "DELETED" as const } };
  const [total, last7, last30, verified, active30, byCommunity, byStatus, byRole, nlActive, nlPending] = await Promise.all([
    db.user.count({ where: residents }),
    db.user.count({ where: { ...residents, createdAt: { gte: new Date(now - 7 * day) } } }),
    db.user.count({ where: { ...residents, createdAt: { gte: new Date(now - 30 * day) } } }),
    db.user.count({ where: { ...residents, emailVerifiedAt: { not: null } } }),
    db.user.count({ where: { ...residents, lastLoginAt: { gte: new Date(now - 30 * day) } } }),
    db.user.groupBy({ by: ["homeCommunity"], where: residents, _count: { _all: true } }),
    db.user.groupBy({ by: ["status"], _count: { _all: true } }),
    db.user.groupBy({ by: ["role"], where: { status: { not: "DELETED" } }, _count: { _all: true } }),
    db.newsletterSubscriber.count({ where: { userId: { not: null }, status: "ACTIVE" } }),
    db.newsletterSubscriber.count({ where: { userId: { not: null }, status: "PENDING" } }),
  ]);
  const communities = byCommunity
    .map((r) => ({ name: r.homeCommunity ?? `${ALL_COUNTY_LABEL} / not chosen`, count: r._count._all }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total, last7, last30, verified, active30, communities, byStatus, byRole, nlActive, nlPending };
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Users" };


export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = spGet(sp, "q"), role = spGet(sp, "role"), status = spGet(sp, "status");
  const { page, take, skip, perPage } = pageParams(sp);
  const where: Prisma.UserWhereInput = {
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] } : {}),
    ...(role ? { role: role as Prisma.EnumRoleFilter["equals"] } : {}),
    ...(status ? { status: status as Prisma.EnumUserStatusFilter["equals"] } : {}),
  };
  const [rows, total, stats] = await Promise.all([
    db.user.findMany({ where, skip, take, orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true, role: true, status: true, createdAt: true, lastLoginAt: true, totpEnabled: true, passwordHash: true, emailVerifiedAt: true, homeCommunity: true, _count: { select: { businesses: true } } } }),
    db.user.count({ where }),
    residentStats(),
  ]);
  const topCommunities = stats.communities.slice(0, 6);
  const otherCommunities = stats.communities.slice(6).reduce((t, r) => t + r.count, 0);
  return (
    <>
      <PageHeader title="Users" description="Everyone with an account: staff, business owners and community members. Resident accounts are free and separate from business memberships." />
      <section aria-label="Resident accounts" className="mb-6 space-y-3" data-testid="resident-stats">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "Resident accounts", value: stats.total, hint: "role Member, not deleted" },
            { label: "New, last 7 days", value: stats.last7, hint: `${n(stats.last30)} in the last 30 days` },
            { label: "Email verified", value: stats.verified, hint: stats.total ? `${Math.round((stats.verified / stats.total) * 100)}% of residents` : undefined },
            { label: "Signed in, last 30 days", value: stats.active30, hint: "from each account’s last sign-in or registration" },
            { label: "Newsletter (linked accounts)", value: stats.nlActive, hint: `${n(stats.nlPending)} awaiting confirmation` },
          ].map((t) => (
            <div key={t.label} className="card p-3.5 sm:p-4">
              <p className="text-[13px] font-medium text-slate-500">{t.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-navy-950">{n(t.value)}</p>
              {t.hint && <p className="mt-0.5 text-xs text-slate-500">{t.hint}</p>}
            </div>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="card p-4">
            <p className="text-sm font-semibold text-slate-900">Preferred community (residents)</p>
            {topCommunities.length ? (
              <ul className="mt-2 space-y-1 text-sm">
                {topCommunities.map((c) => <li key={c.name} className="flex justify-between gap-3"><span className="truncate text-slate-700">{c.name}</span><span className="font-semibold tabular-nums">{n(c.count)}</span></li>)}
                {otherCommunities > 0 && <li className="flex justify-between gap-3 text-slate-500"><span>Other communities</span><span className="tabular-nums">{n(otherCommunities)}</span></li>}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">No resident accounts yet.</p>}
          </div>
          <div className="card p-4">
            <p className="text-sm font-semibold text-slate-900">Status (all accounts)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {stats.byStatus.map((r) => <li key={r.status} className="flex justify-between gap-3"><Link href={`/admin/users/?status=${r.status}`} className="text-slate-700 hover:text-brand-700">{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Link><span className="font-semibold tabular-nums">{n(r._count._all)}</span></li>)}
            </ul>
          </div>
          <div className="card p-4">
            <p className="text-sm font-semibold text-slate-900">Roles (not deleted)</p>
            <ul className="mt-2 space-y-1 text-sm">
              {stats.byRole.map((r) => <li key={r.role} className="flex justify-between gap-3"><Link href={`/admin/users/?role=${r.role}`} className="text-slate-700 hover:text-brand-700">{ROLE_LABEL[r.role]}</Link><span className="font-semibold tabular-nums">{n(r._count._all)}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Business owners and staff can use My T County too. Active sessions aren&apos;t tracked beyond sign-in, so “signed in” is the best available activity measure.</p>
          </div>
        </div>
      </section>
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
            { header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{!r.emailVerifiedAt && <span className="badge-gray">Unverified</span>}{!r.passwordHash && <span className="badge-amber">No password</span>}{r.totpEnabled && <span className="badge-green">2FA</span>}</div> },
            { header: "Businesses", cell: (r) => r._count.businesses || "—", hideOnMobile: true },
            { header: "Community", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.homeCommunity ?? "—"}</span>, hideOnMobile: true },
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

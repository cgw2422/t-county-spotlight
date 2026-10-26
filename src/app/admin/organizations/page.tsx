import Link from "next/link";
import { BadgeCheck, ExternalLink, FileUp, HeartHandshake, Inbox, Pencil, Plus } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { KIND_LABEL, ORG_KINDS, ORG_SOURCE_LABEL, OWNERSHIP_LABEL, STALE_AFTER_DAYS, daysAgo, orgHref } from "@/lib/gives/constants";
import { isOrgPublic } from "@/lib/gives/queries";
import { PageHeader } from "@/components/admin/page-header";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { LinkTabs } from "@/components/admin/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { OrgStatusBadge, KindBadge, OwnershipBadge, PublishBadge } from "@/components/gives/badges";
import { pageParams, spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nonprofits & churches" };

const TABS = [
  { key: "pending", label: "Pending", where: { status: "PENDING" } },
  { key: "approved", label: "Approved", where: { status: "APPROVED" } },
  { key: "verified", label: "Verified", where: { status: "APPROVED", verifiedAt: { not: null } } },
  { key: "rejected", label: "Rejected", where: { status: "REJECTED" } },
  { key: "suspended", label: "Suspended", where: { status: "SUSPENDED" } },
  { key: "archived", label: "Archived", where: { status: "ARCHIVED" } },
] as const satisfies readonly { key: string; label: string; where: Prisma.OrganizationWhereInput }[];

export default async function AdminOrganizationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q"), kind = spGet(sp, "kind"), ownership = spGet(sp, "ownership"), pub = spGet(sp, "published"), source = spGet(sp, "source"), stale = spGet(sp, "stale");
  const staleBefore = daysAgo(STALE_AFTER_DAYS);
  const [counts, pendingClaims] = await Promise.all([
    Promise.all(TABS.map((t) => db.organization.count({ where: { ...t.where, deletedAt: null } }))),
    db.organizationClaim.count({ where: { status: "PENDING" } }),
  ]);
  const deletedCount = await db.organization.count({ where: { deletedAt: { not: null } } });
  const tabKey = spGet(sp, "tab") || (counts[0] > 0 ? "pending" : "approved");
  const tab = TABS.find((t) => t.key === tabKey);
  const { page, take, skip, perPage } = pageParams(sp);
  const where: Prisma.OrganizationWhereInput = {
    ...(tabKey === "deleted" ? { deletedAt: { not: null } } : { deletedAt: null, ...(tab?.where ?? {}) }),
    ...((ORG_KINDS as readonly string[]).includes(kind) ? { kind: kind as Prisma.EnumOrgKindFilter["equals"] } : {}),
    ...(OWNERSHIP_LABEL[ownership] ? { ownershipStatus: ownership as Prisma.EnumOrgOwnershipFilter["equals"] } : {}),
    ...(pub === "published" ? { isPublished: true } : pub === "draft" ? { isPublished: false } : {}),
    ...(ORG_SOURCE_LABEL[source] ? { source } : {}),
    ...(stale === "1" ? { AND: [{ OR: [{ infoCheckedAt: null }, { infoCheckedAt: { lt: staleBefore } }] }] } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { ein: { contains: q } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.organization.findMany({
      where, skip, take,
      orderBy: stale === "1" ? [{ infoCheckedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }] : tabKey === "pending" ? { createdAt: "asc" } : { name: "asc" },
      select: {
        id: true, name: true, slug: true, kind: true, city: true, status: true, logoUrl: true, verifiedAt: true, isFeatured: true, createdAt: true, orgType: true,
        isPublished: true, deletedAt: true, ownershipStatus: true, source: true, infoCheckedAt: true,
        _count: { select: { members: true, needs: { where: { deletedAt: null, status: { in: ["OPEN", "PARTIALLY_FULFILLED"] } } }, opportunities: { where: { deletedAt: null } } } },
      },
    }),
    db.organization.count({ where }),
  ]);
  const keep = new URLSearchParams(Object.entries({ kind, ownership, published: pub, source, stale, q }).filter(([, v]) => v) as [string, string][]).toString();
  const tabHref = (k: string) => `/admin/organizations/?tab=${k}${keep ? `&${keep}` : ""}`;

  return (
    <>
      <PageHeader
        title="Nonprofits & churches"
        description="T-County Gives organizations. Always free — never attach memberships or payments to organizations."
        actions={
          <>
            <Link href="/admin/organizations/claims/" className="btn-secondary btn-sm"><Inbox className="h-4 w-4" /> Ownership claims ({pendingClaims} pending)</Link>
            <Link href="/admin/organizations/import/" className="btn-secondary btn-sm"><FileUp className="h-4 w-4" /> Import CSV</Link>
            <Link href="/admin/organizations/new/" className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Add organization</Link>
          </>
        }
      />
      <LinkTabs items={[...TABS.map((t, i) => ({ label: t.label, href: tabHref(t.key), active: tabKey === t.key, count: counts[i] })), { label: "Deleted", href: tabHref("deleted"), active: tabKey === "deleted", count: deletedCount }]} />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search name, email, city or EIN…" filters={[
          { name: "kind", label: "Kind", options: ORG_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
          { name: "ownership", label: "Ownership", options: Object.entries(OWNERSHIP_LABEL).map(([value, label]) => ({ value, label })) },
          { name: "published", label: "Publication", options: [{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }] },
          { name: "source", label: "Source", options: Object.entries(ORG_SOURCE_LABEL).map(([value, label]) => ({ value, label })) },
          { name: "stale", label: "Checked", options: [{ value: "1", label: "Stale (12+ months or never), oldest first" }] },
        ]} />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={HeartHandshake} title="No organizations here" />}
          columns={[
            {
              header: "Organization", primary: true, className: "min-w-[240px]",
              cell: (r) => (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.logoUrl ? <img src={r.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-contain" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">{r.name[0]}</span>}
                  <div className="min-w-0">
                    <Link href={`/admin/organizations/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <KindBadge kind={r.kind} />
                      {r.verifiedAt && <span className="badge-blue"><BadgeCheck className="h-3 w-3" /> Verified</span>}
                      {r.isFeatured && <span className="badge-orange">Featured</span>}
                    </div>
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><OrgStatusBadge status={r.status} /><PublishBadge published={r.isPublished} /></div> },
            { header: "Ownership", cell: (r) => <OwnershipBadge status={r.ownershipStatus} /> },
            { header: "City", cell: (r) => r.city || "—" },
            { header: "Source", cell: (r) => <span className="whitespace-nowrap text-slate-600">{ORG_SOURCE_LABEL[r.source] ?? r.source}</span>, hideOnMobile: true },
            { header: "Last checked", cell: (r) => r.infoCheckedAt ? <span className={r.infoCheckedAt < staleBefore ? "whitespace-nowrap text-amber-700" : "whitespace-nowrap text-slate-600"}>{formatDate(r.infoCheckedAt, { month: "short", year: "numeric" })}</span> : <span className="text-slate-400">Never</span>, hideOnMobile: true },
            { header: "Members", cell: (r) => r._count.members, hideOnMobile: true },
            { header: "Added", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span>, hideOnMobile: true },
          ]}
          actions={(r) => (
            <>
              <Link href={`/admin/organizations/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> {r.status === "PENDING" ? "Review" : "Edit"}</Link>
              {isOrgPublic(r) && <a href={orgHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.name}`}><ExternalLink className="h-4 w-4" /></a>}
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/organizations/" params={{ ...sp, tab: tabKey }} />
      </div>
    </>
  );
}

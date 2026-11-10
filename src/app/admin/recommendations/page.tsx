import Link from "next/link";
import { ExternalLink, Search, ShieldAlert, ThumbsUp } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { businessHref } from "@/lib/links";
import { getUnusualActivity } from "@/lib/recommendations";
import { UnusualActivityPanel } from "@/components/admin/recommendation-unusual";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
export const metadata = { title: "Recommendations" };

const SORTS = [
  { key: "count", label: "Most recommended" },
  { key: "week", label: "Most in last 7 days" },
  { key: "name", label: "Name" },
] as const;

export default async function RecommendationsAdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q").slice(0, 100);
  // Optional: one member's recommendations (linked from Admin → Users). Staff-only; never shown publicly.
  const userFilter = spGet(sp, "user").slice(0, 40);
  const sort = SORTS.find((s) => s.key === spGet(sp, "sort"))?.key ?? "count";
  const { page, take, skip, perPage } = pageParams(sp, 25);
  const weekAgo = daysAgo(7);
  const nameFilter: Prisma.BusinessWhereInput = q ? { name: { contains: q, mode: "insensitive" } } : {};
  const where: Prisma.BusinessWhereInput = { ...nameFilter, OR: [{ recommendationCount: { gt: 0 } }, { recommendations: { some: {} } }] };

  let ids: string[];
  let total: number;
  if (sort === "week") {
    const recWhere: Prisma.BusinessRecommendationWhereInput = { createdAt: { gte: weekAgo }, ...(q ? { business: nameFilter } : {}) };
    const [groups, all] = await Promise.all([
      db.businessRecommendation.groupBy({ by: ["businessId"], where: recWhere, _count: { _all: true }, orderBy: [{ _count: { businessId: "desc" } }, { businessId: "asc" }], skip, take }),
      db.businessRecommendation.groupBy({ by: ["businessId"], where: recWhere }),
    ]);
    ids = groups.map((g) => g.businessId);
    total = all.length;
  } else {
    const [rows, n] = await Promise.all([
      db.business.findMany({ where, select: { id: true }, orderBy: sort === "name" ? [{ name: "asc" }] : [{ recommendationCount: "desc" }, { name: "asc" }], skip, take }),
      db.business.count({ where }),
    ]);
    ids = rows.map((r) => r.id);
    total = n;
  }

  const [businesses, rowCounts, weekCounts, unusual, grand] = await Promise.all([
    db.business.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, name: true, city: true, status: true, deletedAt: true, recommendationCount: true, recommendationsDisabled: true } }),
    db.businessRecommendation.groupBy({ by: ["businessId"], where: { businessId: { in: ids } }, _count: { _all: true } }),
    db.businessRecommendation.groupBy({ by: ["businessId"], where: { businessId: { in: ids }, createdAt: { gte: weekAgo } }, _count: { _all: true } }),
    getUnusualActivity(),
    Promise.all([db.businessRecommendation.count(), db.businessRecommendation.count({ where: { createdAt: { gte: weekAgo } } })]),
  ]);
  const member = userFilter
    ? await db.user.findUnique({
        where: { id: userFilter },
        select: {
          id: true, email: true, name: true, createdAt: true, status: true,
          recommendations: { orderBy: { createdAt: "desc" }, take: 200, select: { id: true, createdAt: true, ipHash: true, business: { select: { id: true, name: true, city: true } } } },
        },
      })
    : null;
  const memberFlags = member
    ? {
        newAccount: new Set(unusual.newAccounts.filter((r) => r.userId === member.id).map((r) => r.id)),
        heavy: unusual.heavyUsers.find((h) => h.userId === member.id) ?? null,
        sharedIp: new Set(unusual.ipClusters.filter((c) => member.recommendations.some((r) => r.ipHash === c.ipHash && r.business.id === c.businessId)).map((c) => `${c.businessId}:${c.ipHash}`)),
      }
    : null;
  const byId = new Map(businesses.map((b) => [b.id, b]));
  const rowsN = new Map(rowCounts.map((g) => [g.businessId, g._count._all]));
  const weekN = new Map(weekCounts.map((g) => [g.businessId, g._count._all]));
  const rows = ids.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
  const sortHref = (k: string) => `/admin/recommendations/?${new URLSearchParams({ ...(q ? { q } : {}), sort: k }).toString()}`;

  return (
    <>
      <PageHeader
        title="Community recommendations"
        description="Thumbs-up recommendations from signed-in members. Recommender identities are private to staff and never shown publicly or to business owners. Staff can remove recommendations or switch them off for a listing, but can't add recommendations or edit counts. Membership plans have no effect here."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="card p-4"><p className="text-sm text-slate-600">All recommendations</p><p className="text-2xl font-bold tabular-nums text-slate-900" data-testid="admin-recs-total">{grand[0]}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-600">Last 7 days</p><p className="text-2xl font-bold tabular-nums text-slate-900">{grand[1]}</p></div>
      </div>

      {userFilter && (
        <div className="card mb-6 p-4 sm:p-5" data-testid="admin-recs-user">
          {member ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">Recommendations by <Link href={`/admin/users/${member.id}/`} className="text-brand-700 hover:underline">{member.name || member.email}</Link></h2>
                  <p className="text-sm text-slate-500">{member.email} · joined {formatDateTime(member.createdAt)} · {member.recommendations.length} recommendation{member.recommendations.length === 1 ? "" : "s"}</p>
                </div>
                <Link href="/admin/recommendations/" className="btn-secondary btn-sm">Clear filter</Link>
              </div>
              {memberFlags?.heavy && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Unusual: {memberFlags.heavy.n} recommendations within 24 hours starting {formatDateTime(memberFlags.heavy.windowStart)}.</p>}
              {member.recommendations.length ? (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {member.recommendations.map((r) => {
                    const flags = [
                      memberFlags?.newAccount.has(r.id) ? "Made soon after the account was created" : null,
                      r.ipHash && memberFlags?.sharedIp.has(`${r.business.id}:${r.ipHash}`) ? "Same network as other recommendations for this business" : null,
                    ].filter(Boolean);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="min-w-0">
                          <Link href={`/admin/recommendations/${r.business.id}/`} className="font-medium text-slate-900 hover:text-brand-700">{r.business.name}</Link>
                          <span className="block text-xs text-slate-500">{[r.business.city, formatDateTime(r.createdAt)].filter(Boolean).join(" · ")}</span>
                        </span>
                        {flags.length > 0 && <span className="flex flex-wrap gap-1">{flags.map((f) => <span key={f} className="badge-amber">{f}</span>)}</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="mt-3 text-sm text-slate-500">This member hasn&apos;t recommended any businesses.</p>}
            </>
          ) : <p className="text-sm text-slate-600">That account wasn&apos;t found. <Link href="/admin/recommendations/" className="font-semibold text-brand-700">Clear filter</Link></p>}
        </div>
      )}

      <div className="mb-6"><UnusualActivityPanel data={unusual} /></div>

      <form action="/admin/recommendations/" className="mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="sort" value={sort} />
        <label className="min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search businesses</span>
          <input name="q" defaultValue={q} placeholder="Search businesses…" className="input" />
        </label>
        <button className="btn-secondary min-h-11"><Search className="h-4 w-4" aria-hidden /> Search</button>
      </form>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {SORTS.map((s) => <Link key={s.key} href={sortHref(s.key)} className={sort === s.key ? "badge-blue" : "badge-gray"}>{s.label}</Link>)}
      </div>
      <div className="card overflow-hidden">
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ThumbsUp} title={q ? "No matching businesses" : "No recommendations yet"} />}
          columns={[
            {
              header: "Business", primary: true, className: "min-w-[220px]",
              cell: (r) => (
                <div>
                  <Link href={`/admin/recommendations/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500">
                    {r.city && <span>{r.city}</span>}
                    {r.recommendationsDisabled && <span className="badge-amber">Turned off</span>}
                    {(r.status !== "PUBLISHED" || r.deletedAt) && <span className="badge-gray">{r.deletedAt ? "Deleted" : r.status.toLowerCase()}</span>}
                  </div>
                </div>
              ),
            },
            { header: "Count", align: "right", cell: (r) => <span className="tabular-nums font-semibold" data-testid="admin-rec-count">{r.recommendationCount}</span> },
            { header: "Rows", align: "right", hideOnMobile: true, cell: (r) => <span className={(rowsN.get(r.id) ?? 0) !== r.recommendationCount ? "font-semibold text-red-700" : "text-slate-600"} title="Stored recommendation rows (the count is recomputed from these)">{rowsN.get(r.id) ?? 0}</span> },
            { header: "Last 7 days", align: "right", cell: (r) => <span className="tabular-nums">{weekN.get(r.id) ?? 0}</span> },
          ]}
          actions={(r) => (
            <>
              <Link href={`/admin/recommendations/${r.id}/`} className="btn-secondary btn-sm">Review</Link>
              {r.status === "PUBLISHED" && !r.deletedAt && <a href={businessHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.name}`}><ExternalLink className="h-4 w-4" /></a>}
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/recommendations/" params={sp} />
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-slate-500"><ShieldAlert className="h-4 w-4 shrink-0" aria-hidden /> Removing recommendations and turning them off requires an administrator. Every action is recorded in the audit log.</p>
    </>
  );
}

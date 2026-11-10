import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Trash2, ThumbsUp, ToggleLeft, ToggleRight } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import { getUnusualActivity, UNUSUAL } from "@/lib/recommendations";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { ActionButton } from "@/components/admin/action-button";
import { UnusualActivityPanel } from "@/components/admin/recommendation-unusual";
import { EmptyState } from "@/components/ui/empty-state";
import { bulkRemoveRecommendationsByIp, removeRecommendation, setRecommendationsDisabled } from "../actions";

export const dynamic = "force-dynamic";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);
export const metadata = { title: "Business recommendations" };

export default async function BusinessRecommendationsAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const b = await db.business.findUnique({ where: { id }, select: { id: true, slug: true, name: true, city: true, status: true, deletedAt: true, recommendationCount: true, recommendationsDisabled: true } });
  if (!b) notFound();
  const weekAgo = daysAgo(7);
  const [recs, week, unusual] = await Promise.all([
    db.businessRecommendation.findMany({
      where: { businessId: b.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, createdAt: true, ipHash: true, user: { select: { id: true, name: true, email: true, createdAt: true, status: true } } },
    }),
    db.businessRecommendation.count({ where: { businessId: b.id, createdAt: { gte: weekAgo } } }),
    getUnusualActivity(b.id),
  ]);
  const ipCount = new Map<string, number>();
  for (const r of recs) if (r.ipHash) ipCount.set(r.ipHash, (ipCount.get(r.ipHash) ?? 0) + 1);
  const clusters = [...ipCount.entries()].filter(([, n]) => n >= 2).sort((a, z) => z[1] - a[1]);

  return (
    <>
      <PageHeader
        title={b.name}
        back={{ href: "/admin/recommendations/", label: "Recommendations" }}
        eyebrow={<div className="flex flex-wrap gap-1.5">{b.recommendationsDisabled ? <span className="badge-amber">Recommendations off</span> : <span className="badge-green">Recommendations on</span>}{b.status !== "PUBLISHED" && <span className="badge-gray">{b.status.toLowerCase()}</span>}{b.deletedAt && <span className="badge-red">Deleted</span>}</div>}
        actions={
          <>
            {b.status === "PUBLISHED" && !b.deletedAt && <a href={businessHref(b)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View listing</a>}
            <Link href={`/admin/businesses/${b.id}/`} className="btn-secondary btn-sm">Edit business</Link>
            {isAdmin && (b.recommendationsDisabled ? (
              <ActionButton action={setRecommendationsDisabled} fields={{ businessId: b.id, disabled: "0" }} reloadOnSuccess className="btn-primary btn-sm"><ToggleRight className="h-4 w-4" /> Turn recommendations on</ActionButton>
            ) : (
              <ActionButton action={setRecommendationsDisabled} fields={{ businessId: b.id, disabled: "1" }} reloadOnSuccess prompt={{ name: "reason", label: "Reason (internal, audit log)" }} confirm={{ title: `Turn off recommendations for ${b.name}?`, body: "The button and the count are hidden on the listing and new recommendations are refused. Existing recommendations are kept and come back if you turn them on again.", confirmLabel: "Turn off", danger: true }}><ToggleLeft className="h-4 w-4" /> Turn recommendations off</ActionButton>
            ))}
          </>
        }
      />
      {!isAdmin && <div className="mb-4"><Notice>Only administrators can remove recommendations or turn them off.</Notice></div>}

      <div className="mb-4 grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="card p-4"><p className="text-sm text-slate-600">Count</p><p className="text-2xl font-bold tabular-nums" data-testid="admin-detail-count">{b.recommendationCount}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-600">Rows</p><p className="text-2xl font-bold tabular-nums">{recs.length}</p></div>
        <div className="card p-4"><p className="text-sm text-slate-600">Last 7 days</p><p className="text-2xl font-bold tabular-nums">{week}</p></div>
      </div>

      <div className="mb-6"><UnusualActivityPanel data={unusual} showBusiness={false} /></div>

      {clusters.length > 0 && (
        <div className="mb-6">
          <Card title="Shared IP hashes" description={`Recommendations for this listing that came from the same network (hashed — the raw IP is never stored). ${UNUSUAL.sameIpPerBusiness}+ is flagged above; households can legitimately share one.`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {clusters.map(([hash, n]) => (
                <li key={hash} id={`ip-${hash.slice(0, 10)}`} className="flex flex-wrap items-center gap-3 py-2">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5">{hash.slice(0, 10)}</code>
                  <span className="flex-1">{n} recommendations</span>
                  {isAdmin && (
                    <ActionButton action={bulkRemoveRecommendationsByIp} fields={{ businessId: b.id, ipHash: hash }} reloadOnSuccess className="btn-danger btn-sm"
                      prompt={{ name: "reason", label: "Reason (required, audit log)", required: true }}
                      confirm={{ title: `Remove all ${n} recommendations from ${hash.slice(0, 10)}?`, body: "This can't be undone. The count is recalculated from the remaining recommendations.", confirmLabel: "Remove all", danger: true }}>
                      <Trash2 className="h-4 w-4" /> Remove all {n}
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card title="Recommending accounts" description="Private to staff. Never shown publicly or to the business." bodyClassName="p-0">
        <DataTable
          rows={recs}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ThumbsUp} title="No recommendations for this listing" />}
          columns={[
            {
              header: "Member", primary: true, className: "min-w-[200px]",
              cell: (r) => (
                <div data-testid="admin-recommender">
                  <Link href={`/admin/users/${r.user.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.user.name || "—"}</Link>
                  <span className="block break-all text-xs text-slate-500">{r.user.email}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {r.createdAt.getTime() - r.user.createdAt.getTime() < UNUSUAL.newAccountMs && <span className="badge-amber">New account</span>}
                    {r.ipHash && (ipCount.get(r.ipHash) ?? 0) >= UNUSUAL.sameIpPerBusiness && <span className="badge-amber">Shared IP ×{ipCount.get(r.ipHash)}</span>}
                    {r.user.status !== "ACTIVE" && <span className="badge-gray">{r.user.status.toLowerCase()}</span>}
                  </span>
                </div>
              ),
            },
            { header: "Account created", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.user.createdAt)}</span> },
            { header: "Recommended", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDateTime(r.createdAt)}</span> },
            { header: "IP hash", cell: (r) => r.ipHash ? <code className="rounded bg-slate-100 px-1">{r.ipHash.slice(0, 10)}</code> : <span className="text-slate-400">—</span> },
          ]}
          actions={isAdmin ? (r) => (
            <ActionButton action={removeRecommendation} fields={{ id: r.id }} reloadOnSuccess className="btn-secondary btn-sm"
              prompt={{ name: "reason", label: "Reason (required, audit log)", required: true }}
              confirm={{ title: `Remove ${r.user.name || r.user.email}'s recommendation?`, confirmLabel: "Remove", danger: true }}>
              <Trash2 className="h-4 w-4" /> Remove
            </ActionButton>
          ) : undefined}
        />
        {recs.length >= 500 && <p className="p-4 text-xs text-slate-500">Showing the newest 500.</p>}
      </Card>
    </>
  );
}

import Link from "next/link";
import { CalendarClock, ExternalLink, Pencil, Truck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import { OUTDATED_DAYS, lastScheduleUpdates, timeRange } from "@/lib/food-trucks";
import { PageHeader, Card } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { spGet, type SP } from "../_lib/list";
import { setFoodTruckFlag } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Food trucks" };

export default async function AdminFoodTrucksPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = spGet(sp, "q").slice(0, 100);
  const now = new Date();
  const trucks = await db.business.findMany({
    where: { isFoodTruck: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, status: true, city: true, cuisine: true, logoUrl: true, updatedAt: true, _count: { select: { owners: true } } },
  });
  const [updates, nextStops, upcomingCounts, candidates] = await Promise.all([
    lastScheduleUpdates(trucks),
    db.foodTruckStop.findMany({ where: { businessId: { in: trucks.map((t) => t.id) }, status: "SCHEDULED", endAt: { gt: now } }, orderBy: { startAt: "asc" }, distinct: ["businessId"], select: { businessId: true, startAt: true, endAt: true, locationName: true, city: true, confirmedAt: true } }),
    db.foodTruckStop.groupBy({ by: ["businessId"], where: { businessId: { in: trucks.map((t) => t.id) }, status: "SCHEDULED", endAt: { gt: now } }, _count: { _all: true } }),
    q.length >= 2 ? db.business.findMany({ where: { isFoodTruck: false, deletedAt: null, name: { contains: q, mode: "insensitive" } }, orderBy: { name: "asc" }, take: 15, select: { id: true, name: true, city: true, status: true } }) : Promise.resolve([]),
  ]);
  const next = new Map(nextStops.map((s) => [s.businessId, s]));
  const counts = new Map(upcomingCounts.map((c) => [c.businessId, c._count._all]));
  const outdatedBefore = new Date(now.getTime() - OUTDATED_DAYS * 86400_000);
  const rows = trucks.map((t) => {
    const last = updates.get(t.id) ?? t.updatedAt;
    return { ...t, next: next.get(t.id) ?? null, upcoming: counts.get(t.id) ?? 0, last, outdated: !next.get(t.id) && last < outdatedBefore };
  });
  const outdatedCount = rows.filter((r) => r.outdated).length;

  return (
    <>
      <PageHeader
        title="Food trucks"
        description={`Food truck listings and their scheduled stops. Trucks with no upcoming stops and no schedule change in ${OUTDATED_DAYS} days are flagged “Outdated”.`}
        actions={<a href="/food-trucks/" target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink className="h-4 w-4" /> Public page</a>}
      />
      <div className="space-y-6">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap gap-4 border-b border-slate-100 px-4 py-3 text-sm text-slate-600 sm:px-5">
            <span><strong className="text-slate-900">{rows.length}</strong> trucks</span>
            <span><strong className="text-slate-900">{rows.filter((r) => r.next).length}</strong> with upcoming stops</span>
            {outdatedCount > 0 && <span className="text-amber-800"><strong>{outdatedCount}</strong> outdated</span>}
          </div>
          <DataTable
            rows={rows}
            rowKey={(r) => r.id}
            empty={<EmptyState icon={Truck} title="No food trucks yet">Mark an existing business as a food truck below, or tick “This listing is a food truck” in the business editor.</EmptyState>}
            columns={[
              {
                header: "Truck", primary: true, className: "min-w-[220px]",
                cell: (r) => (
                  <div className="min-w-0">
                    <Link href={`/admin/food-trucks/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.name}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-slate-500">
                      {r.cuisine && <span>{r.cuisine}</span>}
                      {r.outdated && <span className="badge-amber" data-testid="outdated">Outdated</span>}
                      {r._count.owners === 0 && <span className="badge-gray">Unclaimed</span>}
                    </div>
                  </div>
                ),
              },
              { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              {
                header: "Next stop",
                cell: (r) => r.next ? (
                  <span className="text-slate-700">{formatDate(r.next.startAt, { weekday: "short", month: "short", day: "numeric" })} · {timeRange(r.next.startAt, r.next.endAt)}<span className="block text-xs text-slate-500">{r.next.locationName}{r.next.city ? `, ${r.next.city}` : ""}{r.next.confirmedAt ? " · Confirmed" : ""}</span></span>
                ) : <span className="text-slate-400">None scheduled</span>,
              },
              { header: "Upcoming", cell: (r) => r.upcoming || "—", hideOnMobile: true },
              { header: "Schedule updated", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.last, { month: "short", day: "numeric", year: "numeric" })}</span> },
            ]}
            actions={(r) => (
              <>
                <Link href={`/admin/food-trucks/${r.id}/`} className="btn-secondary btn-sm"><CalendarClock className="h-4 w-4" /> Stops</Link>
                <Link href={`/admin/businesses/${r.id}/`} className="btn-ghost btn-sm" aria-label={`Edit ${r.name}`}><Pencil className="h-4 w-4" /></Link>
                {r.status === "PUBLISHED" && <a href={businessHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.name}`}><ExternalLink className="h-4 w-4" /></a>}
              </>
            )}
          />
        </div>

        <Card title="Mark an existing business as a food truck" description="Search the directory. Owners and managers already assigned in Listing Access can then manage the schedule from their dashboard.">
          <form method="get" className="flex flex-wrap gap-2">
            <label htmlFor="ft-q" className="sr-only">Business name</label>
            <input id="ft-q" name="q" defaultValue={q} className="input min-h-11 max-w-sm flex-1" placeholder="Business name…" />
            <button className="btn-secondary min-h-11">Search</button>
          </form>
          {q.length >= 2 && (
            candidates.length ? (
              <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {candidates.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <span className="min-w-0"><span className="font-medium text-slate-900">{c.name}</span>{c.city && <span className="text-sm text-slate-500"> · {c.city}</span>} <StatusBadge status={c.status} /></span>
                    <ActionButton action={setFoodTruckFlag} fields={{ id: c.id, on: "1" }} reloadOnSuccess><Truck className="h-4 w-4" /> Mark as food truck</ActionButton>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-sm text-slate-500">No matching businesses that aren&apos;t already food trucks.</p>
          )}
        </Card>
      </div>
    </>
  );
}

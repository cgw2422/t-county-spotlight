import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { eventHref } from "@/lib/links";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, StatusBadge, Upsell } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function EventsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { businessId } = await params;
  const { saved } = await searchParams;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.events) return <><PageHeader title="Events" /><Upsell businessId={business.id} feature="Event submissions" /></>;
  const events = await db.event.findMany({ where: { businessId: business.id, deletedAt: null }, orderBy: { startAt: "desc" }, take: 100 });
  const now = new Date();
  const root = `/dashboard/${business.id}/events/`;
  return (
    <>
      <PageHeader title="Events" description="Put your events on the community calendar."
        action={<Link href={`${root}new/`} className="btn-primary min-h-12 w-full sm:w-auto"><CalendarPlus className="h-5 w-5" aria-hidden /> Submit an event</Link>} />
      {saved === "pending" && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Thanks! Your event was sent for review. We&apos;ll publish it soon.</p>}
      {saved === "published" && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Your event is live on the calendar.</p>}
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events yet">Hosting a tasting, sale, class or live music? Submit it and we&apos;ll add it to the county calendar.</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {events.map((e) => {
            const past = (e.endAt ?? e.startAt) < now;
            const editable = ["PENDING", "REJECTED", "DRAFT"].includes(e.status);
            return (
              <li key={e.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900">{e.title}</p>
                  <p className="text-sm text-slate-500">{formatDateTime(e.startAt)}{past && " · Past"}</p>
                  {e.status === "REJECTED" && e.rejectionReason && <p className="mt-1 text-sm text-red-700">Reviewer note: {e.rejectionReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={e.status} />
                  {editable && <Link href={`${root}${e.id}/`} className="btn-secondary btn-sm">Edit</Link>}
                  {e.status === "PUBLISHED" && <Link href={eventHref(e)} className="btn-ghost btn-sm">View</Link>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { eventHref } from "@/lib/links";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, StatusBadge, Upsell } from "@/components/dashboard/shell";
import { ConfirmSubmit } from "@/components/dashboard/confirm-submit";
import { countedEventWhere, eventLimitMessage } from "@/lib/listing-limits";
import { removeEventAction } from "../actions";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Events" };
export const dynamic = "force-dynamic";

export default async function EventsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { businessId } = await params;
  const { saved } = await searchParams;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.events) return <><PageHeader title="Events" /><Upsell businessId={business.id} feature="Event submissions" /></>;
  const [events, used] = await Promise.all([
    db.event.findMany({ where: countedEventWhere(business.id), orderBy: { startAt: "desc" }, take: 200 }),
    db.event.count({ where: countedEventWhere(business.id) }),
  ]);
  const now = new Date();
  const root = `/dashboard/${business.id}/events/`;
  const max = entitlements.maxEvents;
  const atLimit = max !== null && used >= max;
  return (
    <>
      <PageHeader title="Events" description="Put your events on the community calendar."
        action={atLimit
          ? <span className="btn-primary min-h-12 w-full cursor-not-allowed opacity-50 sm:w-auto" aria-disabled="true"><CalendarPlus className="h-5 w-5" aria-hidden /> Submit an event</span>
          : <Link href={`${root}new/`} className="btn-primary min-h-12 w-full sm:w-auto"><CalendarPlus className="h-5 w-5" aria-hidden /> Submit an event</Link>} />
      <p className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-3 py-1 font-semibold ${atLimit ? "bg-amber-100 text-amber-900" : "bg-white text-navy-900 ring-1 ring-slate-200"}`} data-testid="event-counter">
          {max === null ? `Events: ${used} · Unlimited` : `Events: ${used} of ${max}`}
        </span>
        {max !== null && <span className="text-slate-500">Past and pending events count until you remove them.</span>}
      </p>
      {atLimit && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="event-limit">
          {eventLimitMessage(max)}{" "}
          <Link href={`/dashboard/${business.id}/membership/`} className="font-semibold text-brand-700 hover:underline">See Premium</Link>
        </p>
      )}
      {saved === "removed" && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Event removed.</p>}
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
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={e.status} />
                  {editable && <Link href={`${root}${e.id}/`} className="btn-secondary btn-sm">Edit</Link>}
                  {e.status === "PUBLISHED" && <Link href={eventHref(e)} className="btn-ghost btn-sm">View</Link>}
                  <ConfirmSubmit action={removeEventAction} fields={{ businessId: business.id, eventId: e.id }} title={`Remove “${e.title}”?`}
                    body={<>The event is taken off the calendar and your listing{max !== null ? <>, and frees one of your {max} event listings</> : null}. This can&apos;t be undone from your dashboard.</>}
                    confirmLabel="Remove event">Remove</ConfirmSubmit>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

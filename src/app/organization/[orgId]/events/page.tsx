import Link from "next/link";
import { CalendarDays, ExternalLink, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { eventHref } from "@/lib/links";
import { requireOrgAccess } from "@/lib/gives/access";
import { PageHeader, StatusBadge } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmButton } from "@/components/admin/action-button";
import { withdrawOrgEventAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events" };

export default async function OrgEventsPage({ params, searchParams }: { params: Promise<{ orgId: string }>; searchParams: Promise<{ submitted?: string; published?: string }> }) {
  const { orgId } = await params;
  const sp = await searchParams;
  const { org } = await requireOrgAccess(orgId);
  const root = `/organization/${org.id}/`;
  const events = await db.event.findMany({ where: { organizationId: org.id, deletedAt: null }, orderBy: { startAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader
        title="Events"
        description="Fundraisers, services, meals, open houses — add them to the community calendar. They also show on your page."
        action={<Link href={`${root}events/new/`} className="btn-primary"><Plus className="h-4 w-4" aria-hidden /> Add an event</Link>}
      />
      {sp.submitted && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Thanks! Your event was sent for review. We&apos;ll publish it soon.</p>}
      {sp.published && <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your event is live on the calendar.</p>}
      {events.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events yet">
          <Link href={`${root}events/new/`} className="btn-primary btn-sm mt-3">Add your first event</Link>
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {events.map((e) => (
            <li key={e.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900">{e.title}</p>
                <p className="text-sm text-slate-600">{formatDateTime(e.startAt)}{e.city ? ` · ${e.city}` : ""}</p>
                {e.status === "REJECTED" && e.rejectionReason && <p className="mt-1 text-sm text-red-700">Note: {e.rejectionReason}</p>}
              </div>
              <StatusBadge status={e.status} />
              {e.status === "PUBLISHED" && <Link href={eventHref(e)} className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" aria-hidden /> View</Link>}
              {e.status !== "PUBLISHED" && (
                <ConfirmButton action={withdrawOrgEventAction} fields={{ orgId: org.id, eventId: e.id }} title="Withdraw this event?" body="It will be removed from review." confirmLabel="Withdraw">Withdraw</ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

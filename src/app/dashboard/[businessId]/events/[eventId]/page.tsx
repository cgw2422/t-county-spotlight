import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { toDateInput } from "@/lib/utils";
import { PageHeader, StatusBadge } from "@/components/dashboard/shell";
import { EventForm } from "@/components/dashboard/event-form";
import { htmlToText } from "@/components/dashboard/text";
import { withdrawEventAction } from "../../actions";

export const metadata: Metadata = { title: "Edit event" };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ businessId: string; eventId: string }> }) {
  const { businessId, eventId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const e = await db.event.findFirst({ where: { id: eventId, businessId: business.id, deletedAt: null } });
  if (!e) notFound();
  const editable = ["PENDING", "REJECTED", "DRAFT"].includes(e.status);
  const [categories, settings] = await Promise.all([db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }), getSettings()]);
  return (
    <>
      <PageHeader title={e.title} description={<span className="flex items-center gap-2">Status: <StatusBadge status={e.status} /></span>}
        action={<Link href={`/dashboard/${business.id}/events/`} className="btn-ghost">← All events</Link>} />
      {!editable ? (
        <p className="card p-5 text-slate-700">This event has been published, so it can no longer be edited here. If something needs to change, please contact us and we&apos;ll update it for you.</p>
      ) : (
        <>
          {e.status === "REJECTED" && e.rejectionReason && <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">Reviewer note: {e.rejectionReason}</p>}
          <EventForm businessId={business.id} categories={categories} needsApproval={settings.requireEventApproval}
            values={{
              id: e.id, title: e.title, description: htmlToText(e.description), imageUrl: e.imageUrl ?? "", startAt: toDateInput(e.startAt), endAt: toDateInput(e.endAt),
              allDay: e.allDay, locationName: e.locationName ?? "", address: e.address ?? "", city: e.city ?? "", ticketUrl: e.ticketUrl ?? "",
              isFree: e.isFree, price: e.price ?? "", categoryId: e.categoryId ?? "",
            }} />
          <form action={withdrawEventAction} className="mt-8 border-t border-slate-200 pt-6">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="eventId" value={e.id} />
            <button className="btn-ghost text-red-600 hover:bg-red-50">Withdraw this event</button>
          </form>
        </>
      )}
    </>
  );
}

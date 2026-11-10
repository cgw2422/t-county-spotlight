import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { getSettings } from "@/lib/settings";
import { PageHeader, Upsell } from "@/components/dashboard/shell";
import { EventForm } from "@/components/dashboard/event-form";
import Link from "next/link";
import { countListingEvents, eventLimitMessage } from "@/lib/listing-limits";

export const metadata: Metadata = { title: "Submit an event" };
export const dynamic = "force-dynamic";

export default async function NewEventPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.events) return <Upsell businessId={business.id} feature="Event submissions" />;
  if (entitlements.maxEvents !== null && (await countListingEvents(business.id)) >= entitlements.maxEvents) {
    return (
      <>
        <PageHeader title="Submit an event" />
        <div className="card p-5 text-slate-700 sm:p-6" data-testid="event-limit">
          <p>{eventLimitMessage(entitlements.maxEvents)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/dashboard/${business.id}/events/`} className="btn-secondary">Manage my events</Link>
            <Link href={`/dashboard/${business.id}/membership/`} className="btn-primary">See Premium</Link>
          </div>
        </div>
      </>
    );
  }
  const [categories, settings] = await Promise.all([db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }), getSettings()]);
  return (
    <>
      <PageHeader title="Submit an event" description="Fill in what you know — you can edit it while it's waiting for review." />
      <EventForm businessId={business.id} categories={categories} needsApproval={settings.requireEventApproval}
        values={{ title: "", description: "", imageUrl: "", startAt: "", endAt: "", allDay: false, locationName: "", address: business.address ?? "", city: business.city ?? "", ticketUrl: "", isFree: true, price: "", categoryId: "" }} />
    </>
  );
}

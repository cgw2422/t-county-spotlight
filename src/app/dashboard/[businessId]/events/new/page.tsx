import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { getSettings } from "@/lib/settings";
import { PageHeader, Upsell } from "@/components/dashboard/shell";
import { EventForm } from "@/components/dashboard/event-form";

export const metadata: Metadata = { title: "Submit an event" };
export const dynamic = "force-dynamic";

export default async function NewEventPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.events) return <Upsell businessId={business.id} feature="Event submissions" />;
  const [categories, settings] = await Promise.all([db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }), getSettings()]);
  return (
    <>
      <PageHeader title="Submit an event" description="Fill in what you know — you can edit it while it's waiting for review." />
      <EventForm businessId={business.id} categories={categories} needsApproval={settings.requireEventApproval}
        values={{ title: "", description: "", imageUrl: "", startAt: "", endAt: "", allDay: false, locationName: "", address: business.address ?? "", city: business.city ?? "", ticketUrl: "", isFree: true, price: "", categoryId: "" }} />
    </>
  );
}

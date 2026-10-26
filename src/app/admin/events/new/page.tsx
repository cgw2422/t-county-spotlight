import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create event" };

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  await requireStaff();
  const { organizationId } = await searchParams;
  const [categories, org] = await Promise.all([
    db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    organizationId ? db.organization.findFirst({ where: { id: String(organizationId).slice(0, 40), deletedAt: null }, select: { id: true, name: true, city: true, address: true } }) : null,
  ]);
  return (
    <>
      <PageHeader title="Create event" back={{ href: "/admin/events/", label: "Events" }} />
      <EventForm
        e={null}
        categories={categories}
        organization={org ? { id: org.id, label: org.name, sub: org.city } : null}
        defaults={org ? { organizer: org.name, locationName: org.name, address: org.address, city: org.city } : undefined}
      />
    </>
  );
}

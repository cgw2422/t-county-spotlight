import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create event" };

export default async function NewEventPage() {
  await requireStaff();
  const categories = await db.eventCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Create event" back={{ href: "/admin/events/", label: "Events" }} />
      <EventForm e={null} categories={categories} />
    </>
  );
}

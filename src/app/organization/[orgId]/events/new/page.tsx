import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { requireOrgAccess } from "@/lib/gives/access";
import { PageHeader } from "@/components/dashboard/shell";
import { OrgEventForm } from "@/components/gives/dashboard-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add an event" };

export default async function NewOrgEventPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  const [categories, settings] = await Promise.all([
    db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    getSettings(),
  ]);
  return (
    <>
      <Link href={`/organization/${org.id}/events/`} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700"><ChevronLeft className="h-4 w-4" aria-hidden /> Events</Link>
      <PageHeader title="Add an event" />
      <OrgEventForm orgId={org.id} categories={categories} defaults={{ locationName: org.name, address: org.address ?? "", city: org.city }} needsApproval={settings.requireEventApproval || org.status !== "APPROVED"} />
    </>
  );
}

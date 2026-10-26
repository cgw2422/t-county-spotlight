import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireOrgAccess } from "@/lib/gives/access";
import { PageHeader } from "@/components/dashboard/shell";
import { OpportunityForm } from "@/components/gives/dashboard-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add volunteer opportunity" };

export default async function NewOpportunityPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  return (
    <>
      <Link href={`/organization/${org.id}/volunteer/`} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700"><ChevronLeft className="h-4 w-4" aria-hidden /> Volunteer opportunities</Link>
      <PageHeader title="Add a volunteer opportunity" />
      <OpportunityForm orgId={org.id} opp={{ title: "", description: null, startAt: "", endAt: "", isOngoing: false, locationName: org.name, address: org.address, city: org.city, minAge: null, ageNotes: null, spots: null, requirements: null, registrationOpen: true, externalSignupUrl: null, status: "PUBLISHED" }} />
    </>
  );
}

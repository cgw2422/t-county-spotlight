import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireOrgAccess } from "@/lib/gives/access";
import { PageHeader } from "@/components/dashboard/shell";
import { NeedForm } from "@/components/gives/dashboard-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post a need" };

export default async function NewNeedPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  return (
    <>
      <Link href={`/organization/${org.id}/needs/`} className="mb-2 inline-flex min-h-9 items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-700"><ChevronLeft className="h-4 w-4" aria-hidden /> Needs</Link>
      <PageHeader title="Post a need" description="Be specific — people give more when they know exactly what helps." />
      <NeedForm orgId={org.id} need={{ title: "", description: null, category: "SUPPLIES", urgency: "MEDIUM", status: "OPEN", quantityNeeded: null, unit: null, deadline: "", instructions: null, dropoffLocation: org.address ? [org.address, org.city].filter(Boolean).join(", ") : null, isWishList: false }} />
    </>
  );
}

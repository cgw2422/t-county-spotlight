import type { Metadata } from "next";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { getSettings } from "@/lib/settings";
import { PageHeader, Upsell } from "@/components/dashboard/shell";
import { SpecialForm } from "@/components/dashboard/special-form";

export const metadata: Metadata = { title: "Create a special" };
export const dynamic = "force-dynamic";

export default async function NewSpecialPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.promotions) return <Upsell businessId={business.id} feature="Specials and promotions" />;
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Create a special" description="Save a draft anytime, then submit it when it's ready." />
      <SpecialForm businessId={business.id} needsApproval={settings.requirePromotionApproval}
        values={{ title: "", description: "", imageUrl: "", startsAt: "", endsAt: "", terms: "", couponCode: "", redemptionLimit: "" }} />
    </>
  );
}

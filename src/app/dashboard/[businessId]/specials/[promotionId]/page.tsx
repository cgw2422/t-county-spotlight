import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { getSettings } from "@/lib/settings";
import { promotionStatus } from "@/lib/promotions";
import { toDateInput } from "@/lib/utils";
import { PageHeader, StatusBadge, Upsell } from "@/components/dashboard/shell";
import { SpecialForm } from "@/components/dashboard/special-form";
import { endSpecialAction } from "../../actions";

export const metadata: Metadata = { title: "Edit special" };
export const dynamic = "force-dynamic";

export default async function EditSpecialPage({ params }: { params: Promise<{ businessId: string; promotionId: string }> }) {
  const { businessId, promotionId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.promotions) return <Upsell businessId={business.id} feature="Specials and promotions" />;
  const p = await db.promotion.findFirst({ where: { id: promotionId, businessId: business.id, deletedAt: null } });
  if (!p) notFound();
  const editable = ["DRAFT", "PENDING", "REJECTED"].includes(p.status);
  const settings = await getSettings();
  return (
    <>
      <PageHeader title={p.title} description={<span className="flex items-center gap-2">Status: <StatusBadge status={promotionStatus(p)} /></span>}
        action={<Link href={`/dashboard/${business.id}/specials/`} className="btn-ghost">← All specials</Link>} />
      {!editable ? (
        <p className="card p-5 text-slate-700">This special has been approved, so it can&apos;t be edited. End it from the Specials list and create a new one if needed.</p>
      ) : (
        <>
          {p.status === "REJECTED" && p.rejectionReason && <p className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">Reviewer note: {p.rejectionReason}</p>}
          <SpecialForm businessId={business.id} needsApproval={settings.requirePromotionApproval}
            values={{
              id: p.id, title: p.title, description: p.description ?? "", imageUrl: p.imageUrl ?? "", startsAt: toDateInput(p.startsAt), endsAt: toDateInput(p.endsAt),
              terms: p.terms ?? "", couponCode: p.couponCode ?? "", redemptionLimit: p.redemptionLimit?.toString() ?? "",
            }} />
          <form action={endSpecialAction} className="mt-8 border-t border-slate-200 pt-6">
            <input type="hidden" name="businessId" value={business.id} />
            <input type="hidden" name="promotionId" value={p.id} />
            <button className="btn-ghost text-red-600 hover:bg-red-50">Delete this draft</button>
          </form>
        </>
      )}
    </>
  );
}

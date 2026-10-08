import type { Metadata } from "next";
import Link from "next/link";
import { Tag } from "lucide-react";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { getBusinessEntitlements } from "@/lib/entitlements";
import { promotionStatus } from "@/lib/promotions";
import { specialHref } from "@/lib/links";
import { formatDate } from "@/lib/utils";
import { Hint, PageHeader, StatusBadge, Upsell } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { endSpecialAction } from "../actions";

export const metadata: Metadata = { title: "Specials" };
export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = {
  draft: "Draft saved. Submit it when you're ready.",
  pending: "Sent for approval. We'll review it shortly.",
  approved: "Your special is published.",
};

export default async function SpecialsPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { businessId } = await params;
  const { saved } = await searchParams;
  const { business } = await requireBusinessAccess(businessId);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.promotions) return <><PageHeader title="Specials" /><Upsell businessId={business.id} feature="Specials and promotions" /></>;
  const promos = await db.promotion.findMany({
    where: { businessId: business.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  const root = `/dashboard/${business.id}/specials/`;
  return (
    <>
      <PageHeader title="Specials" description="Share deals and offers with Tuscarawas County shoppers."
        action={<Link href={`${root}new/`} className="btn-primary min-h-12 w-full sm:w-auto"><Tag className="h-5 w-5" aria-hidden /> Create a special</Link>} />
      {saved && SAVED[saved] && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{SAVED[saved]}</p>}
      {promos.length === 0 ? (
        <EmptyState icon={Tag} title="No specials yet">Weekly deals, seasonal offers and coupons all work great here.</EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {promos.map((p) => {
            const eff = promotionStatus(p);
            const editable = ["DRAFT", "PENDING", "REJECTED"].includes(p.status);
            return (
              <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-900">{p.title}</p>
                  <p className="text-sm text-slate-500">
                    {formatDate(p.startsAt, { month: "short", day: "numeric" })} – {p.endsAt ? formatDate(p.endsAt, { month: "short", day: "numeric", year: "numeric" }) : "ongoing"}
                    {" · "}{p._count.redemptions} redeemed{p.redemptionLimit ? ` of ${p.redemptionLimit}` : ""}
                  </p>
                  {p.status === "REJECTED" && p.rejectionReason && <p className="mt-1 text-sm text-red-700">Reviewer note: {p.rejectionReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={eff} />
                  {editable && <Link href={`${root}${p.id}/`} className="btn-secondary btn-sm">Edit</Link>}
                  {eff === "Active" && <Link href={specialHref(p)} className="btn-ghost btn-sm">View</Link>}
                  {(eff === "Active" || eff === "Scheduled") && (
                    <form action={endSpecialAction}>
                      <input type="hidden" name="businessId" value={business.id} />
                      <input type="hidden" name="promotionId" value={p.id} />
                      <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50">End now</button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Hint className="mt-6">“Redeemed” counts members who tapped <em>Redeem</em> on your special. Approved specials can&apos;t be edited — end it and create a new one instead.</Hint>
    </>
  );
}

import { notFound } from "next/navigation";
import { Check, X, EyeOff, ExternalLink, Trash2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { promotionStatus } from "@/lib/promotions";
import { formatDateTime } from "@/lib/utils";
import { specialHref } from "@/lib/links";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { PromotionForm } from "../promotion-form";
import { setPromotionStatus, trashPromotion } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit special" };

export default async function EditSpecialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  const p = await db.promotion.findUnique({ where: { id }, include: { business: { select: { id: true, name: true, city: true } }, _count: { select: { redemptions: true } } } });
  if (!p || p.deletedAt) notFound();
  const eff = promotionStatus(p);
  const lastRedeemed = p._count.redemptions ? await db.promotionRedemption.findFirst({ where: { promotionId: p.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }) : null;
  return (
    <>
      <PageHeader
        title={p.title}
        back={{ href: "/admin/specials/", label: "Specials" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={eff} />{p.isSponsored && <span className="badge-sponsored">Sponsored</span>}</div>}
        description={<>{p.business.name} · {p._count.redemptions} redemption{p._count.redemptions === 1 ? "" : "s"} recorded{lastRedeemed ? ` (last ${formatDateTime(lastRedeemed.createdAt)})` : ""}</>}
        actions={
          <>
            {eff === "Active" && <a href={specialHref(p)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            {p.status === "PENDING" && (
              <>
                <ActionButton action={setPromotionStatus} fields={{ id: p.id, status: "APPROVED" }} className="btn-primary btn-sm"><Check className="h-4 w-4" /> Approve</ActionButton>
                <ActionButton action={setPromotionStatus} fields={{ id: p.id, status: "REJECTED" }} prompt={{ name: "reason", label: "Reason (emailed to the business)", required: true }} confirm={{ title: "Reject this special?", confirmLabel: "Reject", danger: true }}><X className="h-4 w-4" /> Reject</ActionButton>
              </>
            )}
            {p.status === "APPROVED" && <ActionButton action={setPromotionStatus} fields={{ id: p.id, status: "UNPUBLISHED" }}><EyeOff className="h-4 w-4" /> Unpublish</ActionButton>}
          </>
        }
      />
      {created && <div className="mb-4"><Notice tone="success">Special created.</Notice></div>}
      {p.status === "REJECTED" && p.rejectionReason && <div className="mb-4"><Notice tone="danger" title="Rejected">{p.rejectionReason}</Notice></div>}
      <PromotionForm p={p} business={{ id: p.business.id, label: p.business.name, sub: p.business.city }} />
      <div className="mt-8 flex justify-end">
        <ConfirmButton action={trashPromotion} fields={{ id: p.id }} title="Delete this special?" body="It will be removed from the site and admin lists." confirmLabel="Delete special"><Trash2 className="h-4 w-4" /> Delete special</ConfirmButton>
      </div>
    </>
  );
}

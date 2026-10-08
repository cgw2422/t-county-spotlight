import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { ConfirmButton } from "@/components/admin/action-button";
import { PlanForm } from "../../forms";
import { deletePlan } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Membership plan" };

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const isNew = id === "new";
  const p = isNew ? null : await db.membershipPlan.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true } } } });
  if (!isNew && !p) notFound();
  return (
    <>
      <PageHeader title={p ? p.name : "New membership plan"} back={{ href: "/admin/memberships/", label: "Memberships" }} />
      {created && <div className="mb-4"><Notice tone="success">Plan created (inactive until you activate it).</Notice></div>}
      <PlanForm p={p} />
      {p && p._count.subscriptions === 0 && (
        <div className="mt-8 flex justify-end">
          <ConfirmButton action={deletePlan} fields={{ id: p.id }} title={`Delete the ${p.name} plan?`} confirmLabel="Delete plan"><Trash2 className="h-4 w-4" /> Delete plan</ConfirmButton>
        </div>
      )}
    </>
  );
}

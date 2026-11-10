import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { businessHref } from "@/lib/links";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton } from "@/components/admin/action-button";
import { ScheduleManager } from "@/components/food-trucks/schedule-manager";
import { setFoodTruckFlag } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Food truck stops" };

export default async function AdminTruckStopsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const b = await db.business.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, slug: true, status: true, isFoodTruck: true, cuisine: true, updatedAt: true } });
  if (!b) notFound();
  return (
    <>
      <PageHeader
        title={b.name}
        back={{ href: "/admin/food-trucks/", label: "Food trucks" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><StatusBadge status={b.status} />{b.cuisine && <span className="badge-gray">{b.cuisine}</span>}</div>}
        description="Staff override: manage this truck's stops. Owners see the same schedule in their dashboard."
        actions={
          <>
            <Link href={`/admin/businesses/${b.id}/`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit listing</Link>
            {b.status === "PUBLISHED" && <a href={businessHref(b)} target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink className="h-4 w-4" /> View</a>}
          </>
        }
      />
      {b.isFoodTruck ? (
        <ScheduleManager business={b} />
      ) : (
        <Notice tone="warn" title="This listing isn't marked as a food truck">
          <div className="mt-2"><ActionButton action={setFoodTruckFlag} fields={{ id: b.id, on: "1" }} reloadOnSuccess>Mark as food truck</ActionButton></div>
        </Notice>
      )}
    </>
  );
}

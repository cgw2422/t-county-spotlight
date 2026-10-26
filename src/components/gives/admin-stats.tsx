import { HandHelping, HeartHandshake } from "lucide-react";
import { db } from "@/lib/db";
import { StatCard } from "@/components/admin/stat-card";

/** T-County Gives counts for the admin dashboard. */
export async function GivesAdminStats() {
  const [pending, openNeeds] = await Promise.all([
    db.organization.count({ where: { status: "PENDING", deletedAt: null } }),
    db.communityNeed.count({ where: { deletedAt: null, status: { in: ["OPEN", "PARTIALLY_FULFILLED"] }, organization: { status: "APPROVED", deletedAt: null } } }),
  ]);
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5">
      <StatCard label="Organizations to review" value={pending} icon={HeartHandshake} href="/admin/organizations/?tab=pending" tone="amber" />
      <StatCard label="Open community needs" value={openNeeds} icon={HandHelping} href="/admin/needs/?status=OPEN" tone="orange" />
    </div>
  );
}

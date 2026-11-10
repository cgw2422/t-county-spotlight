import type { Metadata } from "next";
import Link from "next/link";
import { Truck } from "lucide-react";
import { requireBusinessAccess } from "@/lib/auth";
import { Hint, PageHeader } from "@/components/dashboard/shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ScheduleManager } from "@/components/food-trucks/schedule-manager";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Food truck schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  if (!business.isFoodTruck) {
    const settings = await getSettings();
    return (
      <>
        <PageHeader title="Food truck schedule" />
        <EmptyState icon={Truck} title="This listing isn't set up as a food truck">
          Run a food truck?{" "}
          {settings.contactEmail ? (
            <a href={`mailto:${settings.contactEmail}`} className="font-semibold text-brand-700">Email us</a>
          ) : (
            "Let the T County Connect team know"
          )}{" "}and we&apos;ll turn on the schedule for your listing.
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Food truck schedule" description="Tell neighbors where you'll be serving. Your stops appear on the T County Food Trucks page and on your listing." />
      <Hint className="mb-6">
        Manage every location from this one account. Stops show as <strong>Scheduled</strong> until you tap <strong>Confirm we&apos;re serving</strong> on the day — then they show <strong>Confirmed by the truck</strong>.
        {" "}Your cuisine and menu link are on <Link href={`/dashboard/${business.id}/profile/#truck`} className="font-semibold text-brand-700 hover:underline">Edit profile</Link>.
      </Hint>
      <ScheduleManager business={business} />
    </>
  );
}

import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { PulseForm } from "../pulse-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Community Pulse entry" };

export default async function NewPulsePage() {
  await requireAdmin();
  const categories = await db.pulseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="New Community Pulse entry" description="Save the basic info first — you can add results right after." back={{ href: "/admin/community-pulse/", label: "Community Pulse" }} />
      <PulseForm pulse={null} categories={categories} />
    </>
  );
}

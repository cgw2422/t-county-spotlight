import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { BusinessForm } from "../business-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add business" };

export default async function NewBusinessPage() {
  await requireStaff();
  const categories = await db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Add business" back={{ href: "/admin/businesses/", label: "Businesses" }} description="Owners, photos, articles and memberships can be managed after the business is created." />
      <BusinessForm b={null} categories={categories} />
    </>
  );
}

import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { BusinessForm } from "../business-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add business" };

export default async function NewBusinessPage({ searchParams }: { searchParams: Promise<{ fromLead?: string }> }) {
  await requireStaff();
  const { fromLead } = await searchParams;
  const [categories, lead] = await Promise.all([
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    fromLead ? db.businessLead.findUnique({ where: { id: fromLead.slice(0, 60) }, select: { id: true, name: true, city: true, website: true, category: true, businessId: true } }) : null,
  ]);
  const prefill = lead && !lead.businessId ? lead : null;
  const categoryIds = prefill?.category ? categories.filter((c) => c.name === prefill.category).map((c) => c.id) : [];
  return (
    <>
      <PageHeader title="Add business" back={{ href: "/admin/businesses/", label: "Businesses" }} description="Owners, photos, articles and memberships can be managed after the business is created." />
      {prefill && (
        <p className="mb-4 rounded-xl bg-hillside-50 p-4 text-sm text-navy-900 ring-1 ring-hillside-200" data-testid="from-lead-note">
          Prefilled from a resident recommendation for <strong>{prefill.name}</strong>. It starts as a <strong>draft</strong> — review the details before publishing. No owner account is created.
        </p>
      )}
      <BusinessForm b={null} categories={categories} selectedCategoryIds={categoryIds} initial={prefill ? { leadId: prefill.id, name: prefill.name, city: prefill.city, website: prefill.website } : undefined} />
    </>
  );
}

import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { PromotionForm } from "../promotion-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add special" };

export default async function NewSpecialPage({ searchParams }: { searchParams: Promise<{ business?: string }> }) {
  await requireStaff();
  const { business } = await searchParams;
  const b = business ? await db.business.findUnique({ where: { id: business }, select: { id: true, name: true, city: true } }) : null;
  return (
    <>
      <PageHeader title="Add special" back={{ href: "/admin/specials/", label: "Specials" }} />
      <PromotionForm p={null} business={b ? { id: b.id, label: b.name, sub: b.city } : null} />
    </>
  );
}

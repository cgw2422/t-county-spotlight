import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { ConfirmButton } from "@/components/admin/action-button";
import { ProductForm } from "../../forms";
import { deleteProduct } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsorship product" };

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const isNew = id === "new";
  const p = isNew ? null : await db.sponsorshipProduct.findUnique({ where: { id } });
  if (!isNew && !p) notFound();
  return (
    <>
      <PageHeader title={p ? p.name : "New sponsorship product"} back={{ href: "/admin/memberships/?tab=products", label: "Sponsorship products" }} description="Paid placements a business can buy. Placements are always labeled as sponsored." />
      <ProductForm p={p} />
      {p && (
        <div className="mt-8 flex max-w-2xl justify-end">
          <ConfirmButton action={deleteProduct} fields={{ id: p.id }} title={`Delete “${p.name}”?`} body="Existing placements keep running but lose their product link." confirmLabel="Delete product"><Trash2 className="h-4 w-4" /> Delete product</ConfirmButton>
        </div>
      )}
    </>
  );
}

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { Hint, PageHeader } from "@/components/dashboard/shell";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { htmlToText, readHours } from "@/components/dashboard/text";

export const metadata: Metadata = { title: "Edit profile" };
export const dynamic = "force-dynamic";

export default async function EditProfilePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { business } = await requireBusinessAccess(businessId);
  const [b, categories] = await Promise.all([
    db.business.findUnique({ where: { id: business.id }, include: { categories: { select: { id: true } } } }),
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const socials = (b!.socials ?? {}) as Record<string, string>;
  return (
    <>
      <PageHeader title="Edit your profile" description="Update your listing anytime. Changes go live as soon as you save." />
      <Hint className="mb-6">Your web address (<code className="text-xs">/business/{b!.slug}/</code>) stays the same so existing links keep working. Need it changed? Just contact us.</Hint>
      <ProfileForm
        businessId={b!.id}
        categories={categories}
        cities={TUSCARAWAS_CITIES}
        values={{
          name: b!.name, tagline: b!.tagline ?? "", description: htmlToText(b!.description), logoUrl: b!.logoUrl ?? "", coverUrl: b!.coverUrl ?? "",
          categoryIds: b!.categories.map((c) => c.id), address: b!.address ?? "", city: b!.city ?? "", zip: b!.zip ?? "", phone: b!.phone ?? "",
          email: b!.email ?? "", emailPublic: b!.emailPublic, website: b!.website ?? "", socials, hours: readHours(b!.hours),
        }}
      />
    </>
  );
}

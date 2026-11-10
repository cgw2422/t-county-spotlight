import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { OpeningForm } from "../opening-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add New & Coming Soon" };

export default async function NewOpeningPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Add New & Coming Soon" description="A business that's coming soon, recently opened, relocating or expanding. Do not invent dates: leave them empty when nothing has been announced."
        back={{ href: "/admin/updates/?tab=openings", label: "New & Coming Soon" }} />
      <OpeningForm v={{ kind: "COMING_SOON", status: "DRAFT", business: null, businessName: null, address: null, city: null, title: "", body: "", photos: [], effectiveDate: null, dateNote: null, linkUrl: null, featuredUntil: null }} />
    </>
  );
}

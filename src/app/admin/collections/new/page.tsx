import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { CollectionForm } from "../collection-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New collection" };

export default async function NewCollectionPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="New collection" description="Save the basics first — you can add places, businesses, events and stories right after." back={{ href: "/admin/collections/", label: "Explore collections" }} />
      <CollectionForm c={null} />
    </>
  );
}

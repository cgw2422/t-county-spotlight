import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { PageForm } from "../page-form";

export const metadata = { title: "New page" };

export default async function NewPagePage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="New page" back={{ href: "/admin/pages/", label: "Pages" }} />
      <PageForm p={null} />
    </>
  );
}

import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { JobForm } from "../job-form";

export const metadata = { title: "Add job" };

export default async function NewJobPage() {
  await requireStaff();
  return (
    <>
      <PageHeader title="Add job" back={{ href: "/admin/jobs/", label: "Jobs" }} />
      <JobForm j={null} />
    </>
  );
}

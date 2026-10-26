import { requireOrgAccess } from "@/lib/gives/access";
import { PageHeader } from "@/components/dashboard/shell";
import { OrgProfileForm } from "@/components/gives/org-profile-form";
import { toOrgFormValues } from "@/components/gives/org-form-values";
import { saveOrgProfileAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit profile" };

export default async function OrgProfilePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { org } = await requireOrgAccess(orgId);
  return (
    <>
      <PageHeader title="Edit your profile" description="This is what people see on your public page. Fill in what you can — you can always come back." />
      <OrgProfileForm org={toOrgFormValues(org)} action={saveOrgProfileAction} />
    </>
  );
}

import Link from "next/link";
import { Church, HeartHandshake } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/admin/page-header";
import { Submit } from "@/components/admin/action-form";
import { OrgProfileForm, type OrgFormValues } from "@/components/gives/org-profile-form";
import { StaffListingFields } from "@/components/gives/staff-listing-fields";
import { spGet, type SP } from "../../_lib/list";
import { adminCreateOrg } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add organization" };

const blank = (kind: string): OrgFormValues => ({
  id: "", name: "", kind, orgType: null, tagline: null, mission: null, description: null, impact: null, logoUrl: null, coverUrl: null, email: null,
  emailPublic: true, phone: null, website: null, socials: null, address: null, city: null, zip: null, serviceArea: null, donationUrl: null,
  wishlistUrl: null, ein: null, denomination: null, leadership: null, serviceTimes: null, ministries: [], livestreamUrl: null, accessibility: null, planYourVisit: null,
});

export default async function NewOrganizationPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const type = spGet(await searchParams, "type");
  const back = { href: "/admin/organizations/", label: "Nonprofits & churches" };

  if (type !== "church" && type !== "nonprofit") {
    return (
      <>
        <PageHeader title="Add organization" back={back} description="Create a listing that exists without any user account. Representatives can claim it later. Always free." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/organizations/new/?type=nonprofit" className="card card-hover flex gap-4 p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-sunset-600"><HeartHandshake className="h-6 w-6" aria-hidden /></span>
            <span><span className="block font-semibold text-navy-900">Nonprofit / Community organization</span><span className="mt-1 block text-sm text-slate-600">Food pantries, rescues, service clubs, community groups…</span></span>
          </Link>
          <Link href="/admin/organizations/new/?type=church" className="card card-hover flex gap-4 p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Church className="h-6 w-6" aria-hidden /></span>
            <span><span className="block font-semibold text-navy-900">Church</span><span className="mt-1 block text-sm text-slate-600">Congregations with service times, ministries and plan-your-visit details.</span></span>
          </Link>
        </div>
      </>
    );
  }

  const church = type === "church";
  return (
    <>
      <PageHeader
        title={church ? "Add a church" : "Add a nonprofit or community organization"}
        back={{ href: "/admin/organizations/new/", label: "Choose type" }}
        description="Only the name is required — leave anything you can't confirm blank. New listings are approved, unclaimed and owned by no one until a representative claims them."
      />
      <OrgProfileForm
        org={blank(church ? "CHURCH" : "NONPROFIT")}
        action={adminCreateOrg}
        allowKind
        kindOptions={church ? ["CHURCH"] : ["NONPROFIT", "COMMUNITY_GROUP"]}
        extra={<StaffListingFields v={{ slug: null, seoTitle: null, seoDescription: null, internalNotes: null, sourceUrls: [], infoCheckedAt: null, imageRights: null }} />}
        submitArea={
          <div className="flex flex-1 flex-wrap gap-2 sm:flex-none">
            <Submit name="intent" value="draft" pendingText="Saving…" className="btn-secondary min-h-12 flex-1 sm:flex-none">Save as draft</Submit>
            <Submit name="intent" value="publish" pendingText="Publishing…" className="btn-primary min-h-12 flex-1 sm:flex-none">Save &amp; publish</Submit>
          </div>
        }
      />
    </>
  );
}

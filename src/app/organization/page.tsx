import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, ChevronRight, HeartHandshake, Search, Shield } from "lucide-react";
import { isStaff, requireUser } from "@/lib/auth";
import { getUserOrganizations } from "@/lib/gives/access";
import { KIND_LABEL } from "@/lib/gives/constants";
import { OrgPlainShell } from "@/components/gives/org-shell";
import { OrgStatusBadge } from "@/components/gives/badges";
import { LogoutButton } from "@/components/account/logout-button";

export const dynamic = "force-dynamic";

export default async function OrganizationHome() {
  const user = await requireUser("/organization/");
  const orgs = (await getUserOrganizations(user.id)).filter((o) => isStaff(user) || !["SUSPENDED", "ARCHIVED"].includes(o.status));
  if (orgs.length === 1) redirect(`/organization/${orgs[0].id}/`);

  if (orgs.length === 0) {
    return (
      <OrgPlainShell>
        <div className="mx-auto max-w-xl text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sunset-500 text-white shadow"><HeartHandshake className="h-8 w-8" aria-hidden /></span>
          <h1 className="mt-5 font-display text-3xl font-semibold text-navy-900">Register your organization</h1>
          <p className="mt-3 text-slate-600">
            Your account isn&apos;t connected to a nonprofit, church or community group yet. Registering is always free — share your needs,
            find volunteers and tell the community what you do.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Link href="/gives/register/" className="btn-primary min-h-14 text-base">Register for free</Link>
            <Link href="/gives/organizations/" className="btn-secondary min-h-14 text-base"><Search className="h-5 w-5" aria-hidden /> Is it already listed?</Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">If your organization is already listed, ask its owner to add you from the Team page.</p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {isStaff(user) && <Link href="/admin/organizations/" className="btn-secondary"><Shield className="h-4 w-4" aria-hidden /> Manage in admin</Link>}
            <Link href="/account/" className="btn-ghost">My account</Link>
            <LogoutButton className="btn-ghost" />
          </div>
        </div>
      </OrgPlainShell>
    );
  }

  return (
    <OrgPlainShell>
      <h1 className="font-display text-3xl font-semibold text-navy-900">Your organizations</h1>
      <p className="mt-2 text-slate-600">Choose an organization to manage.</p>
      <ul className="mt-6 grid gap-3">
        {orgs.map((o) => (
          <li key={o.id}>
            <Link href={`/organization/${o.id}/`} className="card card-hover flex min-h-16 items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-navy-800 text-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.logoUrl ? <img src={o.logoUrl} alt="" className="h-full w-full bg-white object-contain" /> : <HeartHandshake className="h-6 w-6" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-semibold text-navy-900">{o.name}{o.verifiedAt && <BadgeCheck className="h-4 w-4 shrink-0 text-brand-600" aria-label="Verified" />}</span>
                <span className="text-sm text-slate-500">{KIND_LABEL[o.kind]} · {o.city || "Tuscarawas County"}</span>
              </span>
              <OrgStatusBadge status={o.status} />
              <ChevronRight className="h-5 w-5 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/gives/register/" className="btn-secondary">Register another organization</Link>
        <Link href="/account/" className="btn-ghost">My account</Link>
        <LogoutButton className="btn-ghost" />
      </div>
    </OrgPlainShell>
  );
}

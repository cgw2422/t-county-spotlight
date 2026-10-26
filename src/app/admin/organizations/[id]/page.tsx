import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, BadgeCheck, Ban, CheckCircle2, ExternalLink, LayoutDashboard, RotateCcw, Star, Trash2, UserMinus, XCircle } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
import { KIND_LABEL, NEED_STATUS_LABEL, OPPORTUNITY_STATUS_LABEL, ORG_ROLES, ORG_ROLE_LABEL, needHref, opportunityHref, orgHref } from "@/lib/gives/constants";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ClientTabs } from "@/components/admin/client-tabs";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { Checkbox, SelectField, TextArea, TextField } from "@/components/admin/form-field";
import { StatusBadge } from "@/components/admin/status-badge";
import { OrgStatusBadge, KindBadge } from "@/components/gives/badges";
import { OrgProfileForm } from "@/components/gives/org-profile-form";
import { toOrgFormValues } from "@/components/gives/org-form-values";
import { adminAddOrgMember, adminRemoveOrgMember, adminSaveOrg, setOrgStatus, toggleOrgFeatured, trashOrg, verifyOrg } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization" };

export default async function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, email: true, name: true, passwordHash: true, lastLoginAt: true } } }, orderBy: { createdAt: "asc" } },
      needs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { pledges: true } } } },
      opportunities: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { signups: true } } } },
      updates: { orderBy: { createdAt: "desc" }, take: 20 },
      events: { where: { deletedAt: null }, orderBy: { startAt: "desc" }, take: 20, select: { id: true, title: true, startAt: true, status: true } },
    },
  });
  if (!org) notFound();
  const [registration, verifier] = await Promise.all([
    db.auditLog.findFirst({ where: { action: "organization.register", entityId: org.id }, include: { user: { select: { email: true, name: true } } } }),
    org.verifiedById ? db.user.findUnique({ where: { id: org.verifiedById }, select: { email: true, name: true } }) : null,
  ]);
  const reg = (registration?.details ?? {}) as Record<string, string>;
  const fid = { orgId: org.id };

  const seoExtra = (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">Admin: URL & SEO</h2>
      <div className="mt-4 space-y-4">
        <TextField name="slug" label="Slug" defaultValue={org.slug} help={`Public URL: ${orgHref(org)}`} />
        <TextField name="seoTitle" label="SEO title" defaultValue={org.seoTitle ?? ""} maxLength={200} />
        <TextArea name="seoDescription" label="Meta description" defaultValue={org.seoDescription ?? ""} maxLength={400} rows={2} />
      </div>
    </section>
  );

  return (
    <>
      <PageHeader
        title={org.name}
        back={{ href: "/admin/organizations/", label: "Nonprofits & churches" }}
        eyebrow={<div className="flex flex-wrap gap-1.5"><OrgStatusBadge status={org.status} /><KindBadge kind={org.kind} />{org.verifiedAt && <span className="badge-blue"><BadgeCheck className="h-3 w-3" /> Verified</span>}{org.isFeatured && <span className="badge-orange">Featured</span>}{org.deletedAt && <span className="badge-red">Deleted</span>}</div>}
        actions={
          <>
            {org.status === "APPROVED" && !org.deletedAt && <a href={orgHref(org)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View</a>}
            <Link href={`/organization/${org.id}/`} className="btn-secondary btn-sm"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>
            {org.status !== "APPROVED" && <ActionButton action={setOrgStatus} fields={{ ...fid, status: "APPROVED" }} className="btn-primary btn-sm"><CheckCircle2 className="h-4 w-4" /> {org.status === "PENDING" ? "Approve" : "Restore & approve"}</ActionButton>}
            {org.status === "PENDING" && <ActionButton action={setOrgStatus} fields={{ ...fid, status: "REJECTED" }} prompt={{ name: "note", label: "Why isn't it approved? (emailed to the owner)", required: true }} confirm={{ title: `Reject ${org.name}?`, confirmLabel: "Reject and email owner", danger: true }}><XCircle className="h-4 w-4" /> Reject</ActionButton>}
            {org.status === "APPROVED" && <ActionButton action={setOrgStatus} fields={{ ...fid, status: "SUSPENDED" }} prompt={{ name: "note", label: "Reason (internal, shown to the owner)" }} confirm={{ title: `Suspend ${org.name}?`, body: "The page is hidden and members lose dashboard access.", confirmLabel: "Suspend", danger: true }}><Ban className="h-4 w-4" /> Suspend</ActionButton>}
            {org.status !== "ARCHIVED" && <ActionButton action={setOrgStatus} fields={{ ...fid, status: "ARCHIVED" }} confirm={{ title: `Archive ${org.name}?`, body: "Hidden from the site (e.g. organization closed). You can restore it later.", confirmLabel: "Archive" }}><Archive className="h-4 w-4" /> Archive</ActionButton>}
            <ActionButton action={toggleOrgFeatured} fields={fid}><Star className="h-4 w-4" /> {org.isFeatured ? "Unfeature" : "Feature"}</ActionButton>
          </>
        }
      />
      {org.status === "PENDING" && (
        <div className="mb-4"><Notice tone="warn" title="Waiting for review">Check that this is a real organization serving Tuscarawas County and that it isn&apos;t a duplicate. Approving publishes the page and emails the owner.</Notice></div>
      )}
      {registration && (
        <div className="mb-4">
          <Notice title="Registration">
            Registered {formatDateTime(registration.createdAt)} by {registration.user?.name || ""} &lt;{registration.user?.email}&gt;{reg.applicantRole ? ` — role: ${reg.applicantRole}` : ""}. Kind: {KIND_LABEL[org.kind]}.{org.ein ? ` EIN provided: ${org.ein}.` : " No EIN provided."}
          </Notice>
        </div>
      )}

      <ClientTabs
        tabs={[
          { id: "profile", label: "Profile", content: <OrgProfileForm org={toOrgFormValues(org)} action={adminSaveOrg} allowKind extra={seoExtra} submitLabel="Save organization" /> },
          {
            id: "verify", label: "Verification",
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Verification status">
                  {org.verifiedAt ? (
                    <div className="space-y-2 text-sm">
                      <p className="flex items-center gap-2 font-semibold text-brand-700"><BadgeCheck className="h-5 w-5" /> Verified {formatDate(org.verifiedAt)}{verifier ? ` by ${verifier.name || verifier.email}` : ""}</p>
                      {org.verificationNote && <p className="text-slate-700">Note: {org.verificationNote}</p>}
                      {isAdmin && <ConfirmButton action={verifyOrg} fields={{ ...fid, unverify: "1" }} title="Remove verification?" body="The Verified badge is removed from the public page." confirmLabel="Remove">Remove verification</ConfirmButton>}
                    </div>
                  ) : <p className="text-sm text-slate-600">Not verified. The public “Verified” badge appears only after a manual check.</p>}
                </Card>
                <Card title="Verify this organization" description="Manual check only — confirm the EIN or other proof before verifying.">
                  <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    <li>Look up the EIN{org.ein ? ` (${org.ein})` : ""} or name in the <a href="https://apps.irs.gov/app/eos/" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">IRS Tax Exempt Organization Search</a>.</li>
                    <li>For churches and groups without an EIN, confirm through a phone call, website or known community contact.</li>
                    <li>Record what you checked below.</li>
                  </ol>
                  {!isAdmin ? <Notice>Only administrators can verify organizations.</Notice> : org.status !== "APPROVED" ? <Notice tone="warn">Approve the organization first.</Notice> : (
                    <ActionForm action={verifyOrg} className="space-y-3">
                      <input type="hidden" name="orgId" value={org.id} />
                      <TextArea name="verificationNote" label="How was it verified?" required rows={3} placeholder="e.g. IRS EO lookup confirmed EIN 12-3456789, status 501(c)(3)" defaultValue={org.verificationNote ?? ""} />
                      <Submit pendingText="Verifying…"><BadgeCheck className="h-4 w-4" /> {org.verifiedAt ? "Update verification" : "Mark as verified"}</Submit>
                    </ActionForm>
                  )}
                </Card>
                {org.reviewNote && <Card title="Review note"><p className="text-sm text-slate-700">{org.reviewNote}</p></Card>}
              </div>
            ),
          },
          {
            id: "members", label: "Members", badge: org.members.length,
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Team members" bodyClassName="p-0">
                  {org.members.length ? (
                    <ul className="divide-y divide-slate-100">
                      {org.members.map((m) => (
                        <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{m.user.name || m.user.email}</p>
                            <p className="truncate text-sm text-slate-500">{m.user.email} · {ORG_ROLE_LABEL[m.role]}{!m.user.passwordHash && <span className="badge-amber ml-2">No password set</span>}</p>
                          </div>
                          <div className="flex gap-2">
                            {isAdmin && <Link href={`/admin/users/${m.userId}/`} className="btn-ghost btn-sm">User</Link>}
                            <ConfirmButton action={adminRemoveOrgMember} fields={{ ...fid, userId: m.userId }} title={`Remove ${m.user.email}?`} body="They lose access to this organization. Their account is kept." confirmLabel="Remove"><UserMinus className="h-4 w-4" /> Remove</ConfirmButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="px-5 py-6 text-sm text-slate-500">No members.</p>}
                </Card>
                <Card title="Add or change a member" description="Existing members get the new role.">
                  <ActionForm action={adminAddOrgMember} resetOnSuccess className="space-y-3">
                    <input type="hidden" name="orgId" value={org.id} />
                    <TextField id="m-email" name="email" type="email" label="Email" required />
                    <SelectField id="m-role" name="role" label="Role" defaultValue="OWNER" options={ORG_ROLES.map((r) => ({ value: r, label: ORG_ROLE_LABEL[r] }))} />
                    <Checkbox name="notify" label="Email them" defaultChecked />
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">New accounts are created as Members with no password; they set one with “Forgot password”.</p>
                    <Submit pendingText="Saving…">Save member</Submit>
                  </ActionForm>
                </Card>
              </div>
            ),
          },
          {
            id: "activity", label: "Needs & activity", badge: org.needs.length + org.opportunities.length,
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card title="Needs" bodyClassName="p-0">
                  {org.needs.length ? <ul className="divide-y divide-slate-100">{org.needs.map((n) => (
                    <li key={n.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                      <Link href={`/organization/${org.id}/needs/${n.id}/`} className="min-w-0 truncate font-medium text-slate-900 hover:text-brand-700">{n.title}</Link>
                      <span className="flex shrink-0 items-center gap-2"><span className="text-slate-500">{n._count.pledges} pledges</span><span className="badge-gray">{NEED_STATUS_LABEL[n.status]}</span>{org.status === "APPROVED" && n.status !== "DRAFT" && <a href={needHref(n)} target="_blank" rel="noreferrer" aria-label="View"><ExternalLink className="h-4 w-4 text-slate-400" /></a>}</span>
                    </li>
                  ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No needs.</p>}
                </Card>
                <Card title="Volunteer opportunities" bodyClassName="p-0">
                  {org.opportunities.length ? <ul className="divide-y divide-slate-100">{org.opportunities.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                      <Link href={`/admin/volunteer/${o.id}/`} className="min-w-0 truncate font-medium text-slate-900 hover:text-brand-700">{o.title}</Link>
                      <span className="flex shrink-0 items-center gap-2"><span className="text-slate-500">{o._count.signups} sign-ups</span><span className="badge-gray">{OPPORTUNITY_STATUS_LABEL[o.status]}</span>{org.status === "APPROVED" && o.status !== "DRAFT" && <a href={opportunityHref(o)} target="_blank" rel="noreferrer" aria-label="View"><ExternalLink className="h-4 w-4 text-slate-400" /></a>}</span>
                    </li>
                  ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No opportunities.</p>}
                </Card>
                <Card title="Events" bodyClassName="p-0">
                  {org.events.length ? <ul className="divide-y divide-slate-100">{org.events.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                      <Link href={`/admin/events/${e.id}/`} className="min-w-0 truncate font-medium text-slate-900 hover:text-brand-700">{e.title}</Link>
                      <span className="flex shrink-0 items-center gap-2"><span className="text-slate-500">{formatDate(e.startAt, { month: "short", day: "numeric" })}</span><StatusBadge status={e.status} /></span>
                    </li>
                  ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No events.</p>}
                </Card>
                <Card title="Updates" bodyClassName="p-0">
                  {org.updates.length ? <ul className="divide-y divide-slate-100">{org.updates.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5"><span className="min-w-0 truncate font-medium text-slate-900">{u.title}</span><span className="shrink-0 text-slate-500">{formatDate(u.createdAt, { month: "short", day: "numeric" })} · {u.status.toLowerCase()}</span></li>
                  ))}</ul> : <p className="px-5 py-6 text-sm text-slate-500">No updates.</p>}
                </Card>
              </div>
            ),
          },
        ]}
      />
      <div className="mt-8 grid gap-4 text-sm text-slate-500 sm:grid-cols-2">
        <p>Created {formatDateTime(org.createdAt)} · Updated {formatDateTime(org.updatedAt)}</p>
        {isAdmin && (
          <div className="sm:text-right">
            {org.deletedAt ? (
              <ActionButton action={trashOrg} fields={{ ...fid, restore: "1" }}><RotateCcw className="h-4 w-4" /> Restore organization</ActionButton>
            ) : (
              <ConfirmButton action={trashOrg} fields={fid} title={`Delete ${org.name}?`} body="Soft delete: hidden everywhere and members lose access. It can be restored from the Deleted tab." confirmLabel="Delete organization"><Trash2 className="h-4 w-4" /> Delete organization</ConfirmButton>
            )}
          </div>
        )}
      </div>
    </>
  );
}

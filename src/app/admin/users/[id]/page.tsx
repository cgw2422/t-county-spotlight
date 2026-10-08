import { notFound } from "next/navigation";
import Link from "next/link";
import { Ban, CheckCircle2, KeyRound, LogOut } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { describeAudit } from "../../audit/describe";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { SelectField, TextField } from "@/components/admin/form-field";
import { SearchSelect } from "@/components/admin/search-select";
import { StatusBadge } from "@/components/admin/status-badge";
import { ROLE_LABEL } from "../../_lib/labels";
import { linkUserBusinesses, revokeSessions, sendPasswordReset, setUserStatus, updateUser } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage user" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const u = await db.user.findUnique({
    where: { id },
    include: {
      businesses: { include: { business: { select: { id: true, name: true, city: true } } } },
      _count: { select: { sessions: true, savedItems: true, follows: true, redemptions: true } },
    },
  });
  if (!u) notFound();
  const activity = await db.auditLog.findMany({ where: { OR: [{ userId: u.id }, { entityType: "User", entityId: u.id }] }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { email: true } } } });
  const self = u.id === me.id;
  return (
    <>
      <PageHeader title={u.name || u.email} back={{ href: "/admin/users/", label: "Users" }} eyebrow={<div className="flex gap-1.5"><StatusBadge status={u.status} /><span className="badge-blue">{ROLE_LABEL[u.role]}</span>{self && <span className="badge-gray">You</span>}</div>} description={u.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile & role">
          <ActionForm action={updateUser} className="space-y-4">
            <input type="hidden" name="id" value={u.id} />
            <TextField name="name" label="Name" defaultValue={u.name ?? ""} />
            <SelectField name="role" label="Role" defaultValue={u.role} disabled={self} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} help={self ? "You can't change your own role." : "Admins manage everything; editors manage content but not users, settings or payments."} />
            {self && <input type="hidden" name="role" value={u.role} />}
            <Submit pendingText="Saving…">Save</Submit>
          </ActionForm>
        </Card>
        <Card title="Account">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Joined</dt><dd>{formatDateTime(u.createdAt)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Last sign-in</dt><dd>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Never"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Email verified</dt><dd>{u.emailVerifiedAt ? formatDateTime(u.emailVerifiedAt) : "No"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Password</dt><dd>{u.passwordHash ? "Set" : <span className="badge-amber">Not set</span>}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Two-factor</dt><dd>{u.totpEnabled ? "Enabled" : "Off"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Active sessions</dt><dd>{u._count.sessions}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Saved · following · redeemed</dt><dd>{u._count.savedItems} · {u._count.follows} · {u._count.redemptions}</dd></div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <ActionButton action={sendPasswordReset} fields={{ id: u.id }} confirm={{ title: `Send a password reset link to ${u.email}?`, body: "The link expires in 2 hours.", confirmLabel: "Send link" }}><KeyRound className="h-4 w-4" /> Send password reset</ActionButton>
            {!self && u._count.sessions > 0 && <ActionButton action={revokeSessions} fields={{ id: u.id }}><LogOut className="h-4 w-4" /> Sign out everywhere</ActionButton>}
            {!self && (u.status === "SUSPENDED" ? (
              <ActionButton action={setUserStatus} fields={{ id: u.id, status: "ACTIVE" }} className="btn-primary btn-sm"><CheckCircle2 className="h-4 w-4" /> Reactivate</ActionButton>
            ) : (
              <ActionButton action={setUserStatus} fields={{ id: u.id, status: "SUSPENDED" }} confirm={{ title: `Suspend ${u.email}?`, body: "They are signed out immediately and can't sign in until reactivated.", confirmLabel: "Suspend", danger: true }} className="btn-sm btn border border-red-200 bg-white text-red-700 hover:bg-red-50"><Ban className="h-4 w-4" /> Suspend</ActionButton>
            ))}
          </div>
        </Card>
        <Card title="Business ownership" description="Businesses this user can manage from their dashboard.">
          <ActionForm action={linkUserBusinesses} className="space-y-3">
            <input type="hidden" name="id" value={u.id} />
            <SearchSelect name="businesses" type="business" placeholder="Search businesses to link…" initial={u.businesses.map((b) => ({ id: b.business.id, label: b.business.name, sub: b.business.city }))} />
            {u.role === "MEMBER" && <p className="text-xs text-slate-500">Linking a business changes this member’s role to Business Owner.</p>}
            <Submit pendingText="Saving…">Save ownership</Submit>
          </ActionForm>
          {u.businesses.length > 0 && <p className="mt-3 text-sm text-slate-600">Open: {u.businesses.map((b, i) => <span key={b.businessId}>{i > 0 && ", "}<Link className="text-brand-700 hover:underline" href={`/admin/businesses/${b.businessId}/`}>{b.business.name}</Link></span>)}</p>}
        </Card>
        <Card title="Recent activity" bodyClassName="p-0">
          {activity.length ? (
            <ul className="divide-y divide-slate-100">
              {activity.map((a) => <li key={a.id} className="px-4 py-2.5 text-sm sm:px-5"><p className="text-slate-800">{describeAudit(a)}</p><p className="text-xs text-slate-500">{a.user?.email ?? "System"} · {formatDateTime(a.createdAt)}</p></li>)}
            </ul>
          ) : <p className="px-5 py-6 text-sm text-slate-500">No recorded activity.</p>}
        </Card>
      </div>
      {u.status === "SUSPENDED" && <div className="mt-6"><Notice tone="warn">This account is suspended. The user cannot sign in.</Notice></div>}
    </>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRightLeft, Trash2, Undo2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountDeletionSummary } from "@/lib/account-deletion";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { TextField } from "@/components/admin/form-field";
import { deleteUserAccount, resolveSoleOwnership } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Delete account" };

const ROLE: Record<string, string> = { OWNER: "Owner", MANAGER: "Manager", ADMIN: "Manager", EDITOR: "Editor" };

export default async function DeleteUserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, status: true } });
  if (!u) notFound();
  const back = { href: `/admin/users/${u.id}/`, label: u.name || u.email };
  if (u.status === "DELETED") {
    return (<><PageHeader title="Delete account" back={back} /><Notice tone="info">This account was already deleted.</Notice></>);
  }
  const self = u.id === me.id;
  const lastAdmin = u.role === "ADMIN" && (await db.user.count({ where: { role: "ADMIN", status: "ACTIVE", NOT: { id: u.id } } })) === 0;
  const s = await accountDeletionSummary(u.id);
  const unresolved = s.soleOwner.length;
  const n = (v: number, one: string, many = `${one}s`) => `${v} ${v === 1 ? one : many}`;

  return (
    <>
      <PageHeader title={`Delete ${u.name || u.email}?`} back={back} description={u.email} />
      {(self || lastAdmin) && (
        <div className="mb-6"><Notice tone="danger">{self ? "You can't delete your own account from here. Ask another administrator." : "This is the last active administrator, so the account can't be deleted. Make someone else an administrator first."}</Notice></div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="What's affected" description="Listings, their content, photos, recommendations, subscriptions and payments are never deleted.">
          <div className="space-y-4 text-sm" data-testid="delete-summary">
            <div>
              <h3 className="font-semibold text-slate-900">Businesses</h3>
              {s.businesses.length ? (
                <ul className="mt-1 space-y-1">
                  {s.businesses.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-center gap-1.5">
                      <Link className="text-brand-700 hover:underline" href={`/admin/businesses/${b.id}/`}>{b.name}</Link>
                      <span className="badge-gray">{ROLE[b.role] ?? b.role}</span>
                      {b.soleOwner && <span className="badge-red">Only owner</span>}
                      {(b.subscriptions > 0 || b.payments > 0) && <span className="text-xs text-slate-500">{n(b.subscriptions, "subscription")} · {n(b.payments, "payment")} stay with the business</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-slate-500">None</p>}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Organizations</h3>
              {s.organizations.length ? (
                <ul className="mt-1 space-y-1">
                  {s.organizations.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-1.5">
                      <Link className="text-brand-700 hover:underline" href={`/admin/organizations/${o.id}/`}>{o.name}</Link>
                      <span className="badge-gray">{ROLE[o.role] ?? o.role}</span>
                      {o.soleOwner && <span className="badge-red">Only owner</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-slate-500">None</p>}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Pending business applications</h3>
              {s.pendingApplications.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{s.pendingApplications.map((a) => <li key={a.id}><Link className="text-brand-700 hover:underline" href={`/admin/applications/${a.id}/`}>{a.businessName}</Link></li>)}</ul>
              ) : <p className="mt-1 text-slate-500">None</p>}
              {s.pendingApplications.length > 0 && <p className="mt-1 text-xs text-slate-500">These are closed (marked “account deleted”) and can&apos;t be approved.</p>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3">
              <dt className="text-slate-500">Saved items</dt><dd>{s.savedItems} (removed)</dd>
              <dt className="text-slate-500">Followed businesses</dt><dd>{s.follows} (removed)</dd>
              <dt className="text-slate-500">Recommendations</dt><dd>{s.recommendations} (kept, no longer tied to a person)</dd>
              <dt className="text-slate-500">Active sessions</dt><dd>{s.sessions} (signed out)</dd>
              {s.orgClaimsPending > 0 && <><dt className="text-slate-500">Organization claims</dt><dd>{s.orgClaimsPending} pending (withdrawn)</dd></>}
            </dl>
            <p className="rounded-lg bg-slate-50 p-3 text-slate-600" data-testid="delete-newsletter-note">Their newsletter subscription (if any) is managed in beehiiv and isn&apos;t changed.</p>
            <p className="text-xs text-slate-500">Their name, email, password and preferences are removed and they lose all access. The account record stays (anonymized) so audit history, events and content keep their links.</p>
          </div>
        </Card>

        <div className="space-y-6">
          {unresolved > 0 && (
            <Card title="Resolve ownership first" description="This person is the only owner of these listings. Transfer each one to another existing account, or return it to admin management.">
              <ul className="space-y-5" data-testid="sole-owner-list">
                {s.soleOwner.map((b) => (
                  <li key={`${b.kind}:${b.id}`} className="rounded-xl border border-slate-200 p-4" data-testid={`sole-${b.kind}-${b.id}`}>
                    <p className="font-semibold text-slate-900">{b.name} <span className="font-normal text-slate-500">({b.kind === "business" ? "business" : "organization"})</span></p>
                    <ActionForm action={resolveSoleOwnership} className="mt-3 space-y-2">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="kind" value={b.kind} />
                      <input type="hidden" name="listingId" value={b.id} />
                      <input type="hidden" name="mode" value="transfer" />
                      <TextField name="email" type="email" label="Transfer ownership to (email of an existing account)" placeholder="name@example.com" required />
                      <Submit pendingText="Transferring…" className="btn-secondary btn-sm"><ArrowRightLeft className="h-4 w-4" aria-hidden /> Transfer ownership</Submit>
                    </ActionForm>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <ActionButton action={resolveSoleOwnership} fields={{ id: u.id, kind: b.kind, listingId: b.id, mode: "return" }}
                        confirm={{ title: `Return ${b.name} to admin management?`, body: "Their owner link is removed. The listing and everything on it stay as they are; it becomes unclaimed, so someone can claim it again.", confirmLabel: "Return to admin" }}>
                        <Undo2 className="h-4 w-4" aria-hidden /> Return to admin management
                      </ActionButton>
                      <p className="mt-1 text-xs text-slate-500">The listing stays and becomes unclaimed, so it can be claimed again.</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Delete account">
            {self || lastAdmin ? (
              <p className="text-sm text-slate-600">Deleting this account isn&apos;t allowed.</p>
            ) : unresolved > 0 ? (
              <p className="text-sm text-slate-600" data-testid="delete-blocked">Resolve ownership of {n(unresolved, "listing")} first.</p>
            ) : (
              <ActionForm action={deleteUserAccount} className="space-y-3">
                <input type="hidden" name="id" value={u.id} />
                <TextField name="confirmEmail" label={`Type ${u.email} to confirm`} autoComplete="off" required />
                <Submit pendingText="Deleting…" className="btn-danger w-full"><Trash2 className="h-4 w-4" aria-hidden /> Delete account permanently</Submit>
                <p className="text-xs text-slate-500">This can&apos;t be undone. To keep the account but stop all access, use Block instead.</p>
              </ActionForm>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { UserMinus, Users } from "lucide-react";
import { requireBusinessOwner } from "@/lib/auth";
import { ACCESS_ROLE_LABEL, listingAccessRows } from "@/lib/listing-access";
import { PageHeader, Panel, Hint } from "@/components/dashboard/shell";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { SelectField, TextField } from "@/components/admin/form-field";
import { Toaster } from "@/components/admin/toast";
import { addTeamMemberAction, changeTeamRoleAction, removeTeamMemberAction } from "./actions";

export const metadata: Metadata = { title: "Team & ownership" };
export const dynamic = "force-dynamic";

/** Owner-only: who can manage this listing. Names/emails are shown only to the listing's owners (and staff). */
export default async function TeamPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, business } = await requireBusinessOwner(businessId);
  const rows = await listingAccessRows({ kind: "business", id: business.id });
  const owners = rows.filter((r) => r.role === "OWNER").length;
  return (
    <>
      <PageHeader title="Team & ownership" description={<>People who can manage <strong>{business.name}</strong>. Owners can do everything; managers can edit the listing, photos, events, specials and updates, but not membership, billing, analytics or the team.</>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel title={`Team (${rows.length})`}>
          {rows.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate-600"><Users className="h-4 w-4" aria-hidden /> Nobody is linked to this listing yet.</p>
          ) : (
            <ul className="-mx-1 divide-y divide-slate-100" data-testid="team-list">
              {rows.map((m) => {
                const self = m.userId === user.id;
                const lastOwner = m.role === "OWNER" && owners <= 1;
                return (
                  <li key={m.userId} className="px-1 py-3" data-testid="team-member" data-email={m.email}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-navy-900">{m.name || m.email}{self && <span className="ml-1 font-normal text-slate-500">(you)</span>}</p>
                        <p className="truncate text-sm text-slate-500">{m.email}</p>
                      </div>
                      <span className={m.role === "OWNER" ? "badge-blue" : "badge-gray"}>{ACCESS_ROLE_LABEL[m.role]}</span>
                    </div>
                    {!self && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.role === "MANAGER" && (
                          <ActionButton action={changeTeamRoleAction} fields={{ businessId: business.id, userId: m.userId, role: "OWNER" }} className="btn-secondary btn-sm"
                            confirm={{ title: `Make ${m.email} an owner?`, body: "Owners can manage membership, billing, analytics and the team — including other owners.", confirmLabel: "Make owner" }}>
                            Make owner
                          </ActionButton>
                        )}
                        {m.role === "OWNER" && !lastOwner && (
                          <ActionButton action={changeTeamRoleAction} fields={{ businessId: business.id, userId: m.userId, role: "MANAGER" }} className="btn-ghost btn-sm">Make manager</ActionButton>
                        )}
                        {!lastOwner && (
                          <ConfirmButton action={removeTeamMemberAction} fields={{ businessId: business.id, userId: m.userId }} title={`Remove ${m.email}?`} body="They will no longer be able to manage this listing. Their account and any other listings are kept." confirmLabel="Remove">
                            <UserMinus className="h-4 w-4" aria-hidden /> Remove
                          </ConfirmButton>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <Hint className="mt-4">A listing always keeps at least one owner. To hand the listing over, add the new owner first; then they (or you) can adjust the rest of the team.</Hint>
        </Panel>
        <Panel title="Add someone">
          <ActionForm action={addTeamMemberAction} resetOnSuccess className="space-y-4">
            <input type="hidden" name="businessId" value={business.id} />
            <TextField name="email" type="email" label="Email address" required placeholder="name@example.com" autoComplete="off" />
            <SelectField name="role" label="Role" defaultValue="MANAGER" options={[{ value: "MANAGER", label: "Manager — edits the listing" }, { value: "OWNER", label: "Owner — full control" }]} />
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">They need a free T County Connect account with this email first. We&apos;ll email them when they&apos;re added.</p>
            <Submit pendingText="Adding…">Add to team</Submit>
          </ActionForm>
        </Panel>
      </div>
      <Toaster />
    </>
  );
}

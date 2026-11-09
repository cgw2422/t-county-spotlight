"use client";
import { startTransition, useState } from "react";
import Link from "next/link";
import { Mail, MailPlus, Search, ShieldAlert, UserMinus, UserPlus, KeyRound, X } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { ActionForm, Submit } from "./action-form";
import { ActionButton, ConfirmButton } from "./action-button";
import { SearchSelect } from "./search-select";
import { Checkbox, SelectField, TextField } from "./form-field";
import { TempPasswordFields } from "./temp-password-fields";
import { toast } from "./toast";
import { addListingAccessAction, changeListingRoleAction, removeListingAccessAction, resendInvitationAction } from "@/app/admin/listing-access/actions";

type Role = "OWNER" | "MANAGER" | "EDITOR";
export type AccessRow = {
  userId: string; name: string; email: string; role: Role; accountStatus: string; invitation: string | null;
  invitationSentAt: string | null; invitationExpiresAt: string | null; lastLoginAt: string | null; isStaffUser: boolean;
};

const ROLE_LABEL: Record<Role, string> = { OWNER: "Owner", MANAGER: "Manager", EDITOR: "Editor" };
const STATUS_BADGE: Record<string, string> = {
  Active: "badge-green", "Invitation pending": "badge-amber", Suspended: "badge-red", "Must change password": "badge-orange", "No password set": "badge-gray",
};
const INVITE_BADGE: Record<string, string> = { Pending: "badge-amber", Accepted: "badge-green", Expired: "badge-red", Revoked: "badge-gray" };

function RoleSelect({ kind, listingId, row, roles, disabled }: { kind: string; listingId: string; row: AccessRow; roles: Role[]; disabled?: boolean }) {
  const [value, setValue] = useState<Role>(row.role);
  const [pending, setPending] = useState(false);
  return (
    <select
      aria-label={`Role for ${row.email}`}
      className="input min-h-10 w-auto py-1.5 text-sm"
      value={value}
      disabled={disabled || pending}
      onChange={(e) => {
        const next = e.target.value as Role;
        const prev = value;
        setValue(next);
        setPending(true);
        const fd = new FormData();
        fd.set("kind", kind); fd.set("listingId", listingId); fd.set("userId", row.userId); fd.set("role", next);
        startTransition(async () => {
          const r = await changeListingRoleAction(null, fd);
          setPending(false);
          if (r?.error) { toast(r.error, "error"); setValue(prev); } else if (r?.message) toast(r.message);
        });
      }}
    >
      {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}

export function ListingAccessPanel({ kind, listingId, listingName, rows, canManage, linkUsers }: {
  kind: "business" | "organization"; listingId: string; listingName: string; rows: AccessRow[]; canManage: boolean; linkUsers: boolean;
}) {
  const roles: Role[] = kind === "business" ? ["OWNER", "MANAGER"] : ["OWNER", "MANAGER", "EDITOR"];
  const [open, setOpen] = useState(false);
  const fields = { kind, listingId };

  return (
    <section className="card" aria-labelledby="listing-access-title">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="listing-access-title" className="text-base font-semibold text-slate-900">Listing Access</h2>
          <p className="mt-0.5 text-sm text-slate-500">People who can manage {listingName} from their dashboard. Removing access never deletes their account.</p>
        </div>
        {canManage && <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" aria-hidden /> Add owner/manager</button>}
      </div>
      {!canManage && <p className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-600">Only administrators can add, change or remove listing access.</p>}

      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-500">No one manages this listing yet.</p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="table-base w-full">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Account</th><th>Invitation</th><th>Last login</th>{canManage && <th className="text-right">Actions</th>}</tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td className="font-medium text-slate-900">{linkUsers ? <Link className="hover:text-brand-700 hover:underline" href={`/admin/users/${r.userId}/`}>{r.name || "—"}</Link> : r.name || "—"}</td>
                    <td className="whitespace-nowrap text-slate-600">{r.email}</td>
                    <td>{canManage ? <RoleSelect kind={kind} listingId={listingId} row={r} roles={roles} /> : ROLE_LABEL[r.role]}</td>
                    <td className="whitespace-nowrap"><span className={STATUS_BADGE[r.accountStatus] ?? "badge-gray"}>{r.accountStatus}</span></td>
                    <td className="whitespace-nowrap">{r.invitation ? <span className={INVITE_BADGE[r.invitation]} title={r.invitationSentAt ? `Last sent ${formatDateTime(r.invitationSentAt)}` : undefined}>{r.invitation}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap text-sm text-slate-600">{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "Never"}</td>
                    {canManage && <td className="text-right"><RowActions kind={kind} listingId={listingId} listingName={listingName} row={r} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {rows.map((r) => (
              <li key={r.userId} className="space-y-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{linkUsers ? <Link className="hover:underline" href={`/admin/users/${r.userId}/`}>{r.name || r.email}</Link> : r.name || r.email}</p>
                  <p className="break-all text-sm text-slate-500">{r.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {!canManage && <span className="badge-blue">{ROLE_LABEL[r.role]}</span>}
                  <span className={STATUS_BADGE[r.accountStatus] ?? "badge-gray"}>{r.accountStatus}</span>
                  {r.invitation && <span className={INVITE_BADGE[r.invitation]}>Invitation: {r.invitation}</span>}
                  <span className="text-slate-500">Last login: {r.lastLoginAt ? formatDateTime(r.lastLoginAt) : "Never"}</span>
                </div>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleSelect kind={kind} listingId={listingId} row={r} roles={roles} />
                    <RowActions kind={kind} listingId={listingId} listingName={listingName} row={r} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {canManage && open && <AddAccessDialog kind={kind} roles={roles} fields={fields} listingName={listingName} onClose={() => setOpen(false)} />}
    </section>
  );
}

function RowActions({ kind, listingId, listingName, row }: { kind: string; listingId: string; listingName: string; row: AccessRow }) {
  const f = { kind, listingId, userId: row.userId };
  const canResend = row.accountStatus === "Invitation pending" || row.accountStatus === "No password set";
  return (
    <span className="inline-flex flex-wrap justify-end gap-2 md:flex-nowrap">
      {canResend && (
        <ActionButton action={resendInvitationAction} fields={f} className="btn-secondary btn-sm"><MailPlus className="h-4 w-4" aria-hidden /> {row.invitation ? "Resend invitation" : "Send invitation"}</ActionButton>
      )}
      <ConfirmButton action={removeListingAccessAction} fields={f} title={`Remove ${row.email} from ${listingName}?`}
        body="They lose access to this listing only. Their account, password and any other listings stay the same. A pending invitation for this listing is revoked." confirmLabel="Remove access">
        <UserMinus className="h-4 w-4" aria-hidden /> Remove
      </ConfirmButton>
    </span>
  );
}

function AddAccessDialog({ kind, roles, fields, listingName, onClose }: { kind: string; roles: Role[]; fields: Record<string, string>; listingName: string; onClose: () => void }) {
  const [who, setWho] = useState<"existing" | "new">("new");
  const [method, setMethod] = useState<"invite" | "temp">("invite");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mode = who === "existing" ? "existing" : method;
  const roleOptions = roles.map((r) => ({ value: r, label: ROLE_LABEL[r] + (kind === "organization" && r === "EDITOR" ? " (edit content only)" : "") }));

  function onResult(r: ActionState) {
    setErrors(r?.fieldErrors ?? {});
    if (r && !r.error) onClose(); // unmounts the form: any temporary password in memory is gone
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="la-title">
      <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 id="la-title" className="text-base font-semibold text-slate-900">Add owner/manager</h2>
            <p className="truncate text-sm text-slate-500">{listingName}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-slate-100" aria-label="Close dialog"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="overflow-y-auto px-4 py-4 sm:px-6">
          <fieldset>
            <legend className="label">Who are you adding?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard name="who" checked={who === "existing"} onChange={() => setWho("existing")} icon={<Search className="h-5 w-5" aria-hidden />} title="Existing user" text="Search accounts by email or name." />
              <ChoiceCard name="who" checked={who === "new"} onChange={() => setWho("new")} icon={<UserPlus className="h-5 w-5" aria-hidden />} title="New person" text="Enter their name and email." />
            </div>
          </fieldset>

          {who === "new" && (
          <fieldset className="mt-5">
            <legend className="label">How should they sign in?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard name="method" checked={method === "invite"} onChange={() => setMethod("invite")} icon={<Mail className="h-5 w-5" aria-hidden />}
                title="Option 1 — Send email invitation" badge="Recommended" text="They get a secure link (valid 7 days) to choose their own password." />
              <ChoiceCard name="method" checked={method === "temp"} onChange={() => setMethod("temp")} icon={<KeyRound className="h-5 w-5" aria-hidden />}
                title="Option 2 — Set temporary password" text="You create the account now and share a temporary password with them securely." />
            </div>
          </fieldset>
          )}

          <ActionForm action={addListingAccessAction} onResult={onResult} className="mt-5 space-y-4" key={who}>
            {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <input type="hidden" name="mode" value={mode} />

            {who === "existing" ? (
              <>
                <SearchSelect name="user" type="user" multiple={false} label="Account (search email or name)" placeholder="Search accounts…" />
                {errors.user && <p className="text-xs font-medium text-red-600">{errors.user}</p>}
                <SelectField id="la-role" name="role" label="Role" defaultValue="OWNER" options={roleOptions} />
                <Checkbox name="notify" label="Email them that they've been given access" defaultChecked help="Their password is never changed. If they've never set one, they get an invitation to set it instead." />
                <Submit pendingText="Adding…"><UserPlus className="h-4 w-4" aria-hidden /> Give access</Submit>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField id="la-first" name="firstName" label="First name" required maxLength={60} autoComplete="off" error={errors.firstName} />
                  <TextField id="la-last" name="lastName" label="Last name" required maxLength={60} autoComplete="off" error={errors.lastName} />
                </div>
                <TextField id="la-email" name="email" type="email" label="Email" required maxLength={254} autoComplete="off" inputMode="email" error={errors.email}
                  help={method === "invite" ? "If this email already has an account, we add access without creating a duplicate or changing their password." : "Must be a new account. For existing accounts use Option 1 or the reset controls on their user page."} />
                <SelectField id="la-role-new" name="role" label="Role" defaultValue="OWNER" options={roleOptions} />
                {method === "temp" && (
                  <>
                    <TempPasswordFields errors={{ password: errors.tempPassword, confirm: errors.tempConfirm }} />
                    <Checkbox checked disabled readOnly label="Require password change on first login" help="Always on for new accounts — they must choose their own password before using any dashboard." />
                    <p className={cn("flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600")}>
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The password is never emailed, stored in plain text or shown again after you leave this dialog.
                    </p>
                  </>
                )}
                <Submit pendingText={method === "invite" ? "Sending…" : "Creating…"}>
                  {method === "invite" ? <><Mail className="h-4 w-4" aria-hidden /> Send invitation</> : <><KeyRound className="h-4 w-4" aria-hidden /> Create account</>}
                </Submit>
              </>
            )}
          </ActionForm>
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ name, checked, onChange, icon, title, text, badge }: { name: string; checked: boolean; onChange: () => void; icon: React.ReactNode; title: string; text: string; badge?: string }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer gap-3 rounded-xl border p-3 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600", checked ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:border-slate-300")}>
      <input type="radio" name={`${name}__choice`} checked={checked} onChange={onChange} className="sr-only" />
      <span className={cn("mt-0.5 shrink-0", checked ? "text-brand-700" : "text-slate-400")}>{icon}</span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">{title}{badge && <span className="badge-green">{badge}</span>}</span>
        <span className="mt-0.5 block text-slate-600">{text}</span>
      </span>
    </label>
  );
}

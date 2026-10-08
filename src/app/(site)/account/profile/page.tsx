import { CheckCircle2 } from "lucide-react";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { ActionForm } from "@/components/account/action-form";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/utils";
import { changeEmailAction, changePasswordAction, updateNameAction } from "../actions";

export const dynamic = "force-dynamic";

function Section({ title, description, children, danger }: { title: string; description?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={danger ? "card border-red-200 p-5 sm:p-6" : "card p-5 sm:p-6"}>
      <h2 className={danger ? "text-lg font-semibold text-red-700" : "text-lg font-semibold text-navy-900"}>{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <div className="space-y-6">
      <Section title="Your name">
        <ActionForm action={updateNameAction}>
          <div>
            <label htmlFor="name" className="label">Name</label>
            <input id="name" name="name" className="input" defaultValue={user.name ?? ""} autoComplete="name" maxLength={100} required />
          </div>
          <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Saving…">Save name</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Email address" description="If you change it, we'll send a confirmation link to the new address.">
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          Current: <strong className="break-all">{user.email}</strong>
          {user.emailVerifiedAt ? <span className="badge-green"><CheckCircle2 className="h-3 w-3" aria-hidden /> Confirmed</span> : <span className="badge-amber">Not confirmed</span>}
        </p>
        <ActionForm action={changeEmailAction}>
          <div>
            <label htmlFor="email" className="label">New email address</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required />
          </div>
          <div>
            <label htmlFor="emailPw" className="label">Current password</label>
            <input id="emailPw" name="currentPassword" type="password" className="input" autoComplete="current-password" required />
          </div>
          <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Updating…">Change email</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Password" description="Changing your password signs you out everywhere else.">
        <ActionForm action={changePasswordAction}>
          <div>
            <label htmlFor="currentPassword" className="label">Current password</label>
            <input id="currentPassword" name="currentPassword" type="password" className="input" autoComplete="current-password" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="newPassword" className="label">New password</label>
              <input id="newPassword" name="newPassword" type="password" className="input" autoComplete="new-password" minLength={10} required />
              <p className="help">At least 10 characters, with letters and numbers.</p>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="label">Confirm new password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" minLength={10} required />
            </div>
          </div>
          <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Saving…">Change password</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Delete account" danger description="This permanently removes your account, saved items, follows and notification settings. It can't be undone.">
        {isStaff(user) ? (
          <p className="text-sm text-slate-600">Staff accounts must be removed by another administrator.</p>
        ) : (
          <DeleteAccountForm email={user.email} hasPassword={!!user.passwordHash} />
        )}
      </Section>
      <p className="text-center text-xs text-slate-400">Member since {formatDate(user.createdAt)}</p>
    </div>
  );
}

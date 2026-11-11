import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { ActionForm } from "@/components/account/action-form";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { DeleteAccountForm } from "@/components/account/delete-account-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { soleOwnershipBlocks } from "@/lib/sole-ownership";
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
  const blocks = isStaff(user) ? [] : await soleOwnershipBlocks(user.id);
  const contactEmail = blocks.some((b) => !b.teamHref) ? (await getSettings()).contactEmail : "";
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
        {user.passwordHash ? <ChangePasswordForm action={changePasswordAction} /> : (
          <p className="text-sm text-slate-600">Your account doesn&apos;t have a password yet. <Link href="/forgot-password/" className="font-semibold text-brand-700 hover:underline">Email me a link to set one</Link>.</p>
        )}
      </Section>

      <Section title="Delete account" danger description="This permanently removes your account, saved items, follows and notification settings. It can't be undone.">
        {isStaff(user) ? (
          <p className="text-sm text-slate-600">Staff accounts must be removed by another administrator.</p>
        ) : blocks.length > 0 ? (
          <div className="space-y-3 text-sm text-slate-700" data-testid="delete-blocked">
            <p>
              <strong>You can&apos;t delete your account yet.</strong> You&apos;re the only owner of {blocks.length === 1 ? "this listing" : "these listings"}, and
              deleting your account would leave {blocks.length === 1 ? "it" : "them"} without an owner. Make someone else an owner first — then you can delete your account.
              Other owners and managers keep their access.
            </p>
            <ul className="space-y-2">
              {blocks.map((b) => (
                <li key={`${b.kind}:${b.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3">
                  <span className="min-w-0 font-semibold text-navy-900">{b.name}<span className="ml-2 text-xs font-normal text-slate-500">{b.kind === "business" ? "Business" : "Organization"}</span></span>
                  {b.teamHref ? (
                    <Link href={b.teamHref} className="btn-secondary btn-sm">Transfer ownership</Link>
                  ) : (
                    <span className="text-xs text-slate-500">This listing is suspended. Contact T County Connect for help{contactEmail ? <>: <a className="underline" href={`mailto:${contactEmail}`}>{contactEmail}</a></> : ""}.</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <DeleteAccountForm email={user.email} hasPassword={!!user.passwordHash} />
        )}
      </Section>
      <p className="text-center text-xs text-slate-400">Member since {formatDate(user.createdAt)}</p>
    </div>
  );
}

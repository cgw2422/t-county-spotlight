"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { NewPasswordFields } from "@/components/account/password-fields";
import { acceptInvitationAction } from "./actions";

export function AcceptInvitationForm({ token, email, needsPassword }: { token: string; email: string; needsPassword: boolean }) {
  const [state, action] = useActionState(acceptInvitationAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <div>
        <label htmlFor="invite-email" className="label">Email address</label>
        <input id="invite-email" className="input bg-slate-50" value={email} readOnly autoComplete="username" />
        <p className="help">You&apos;ll sign in with this email.</p>
      </div>
      {needsPassword ? (
        <>
          <NewPasswordFields label="Choose a password" confirmLabel="Confirm password" errors={{ password: fe.password, confirm: fe.confirm }} autoFocus />
          <SubmitButton className="btn-primary w-full" pendingText="Setting up your account…">Accept invitation and continue</SubmitButton>
        </>
      ) : (
        <SubmitButton className="btn-primary w-full" pendingText="Accepting…">Accept and sign in</SubmitButton>
      )}
    </form>
  );
}

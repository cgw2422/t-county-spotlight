"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/account/auth-shell";
import { resetPasswordAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={10}
        help="At least 10 characters, with letters and numbers." error={fe.password} autoFocus />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required minLength={10} error={fe.confirm} />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">Save new password and sign in</SubmitButton>
    </form>
  );
}

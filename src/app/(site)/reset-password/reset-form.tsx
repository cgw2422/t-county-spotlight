"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { NewPasswordFields } from "@/components/account/password-fields";
import { resetPasswordAction } from "./actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <NewPasswordFields label="New password" confirmLabel="Confirm new password" errors={{ password: fe.password, confirm: fe.confirm }} autoFocus />
      <SubmitButton className="btn-primary w-full" pendingText="Saving…">Save new password and sign in</SubmitButton>
    </form>
  );
}

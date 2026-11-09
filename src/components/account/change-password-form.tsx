"use client";
import { useActionState, useState } from "react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { NewPasswordFields, PasswordField } from "./password-fields";

/**
 * Account password change. In the forced flow (admin-issued temporary
 * password) the current password isn't asked again — the user just signed in
 * with it — and success redirects to their dashboard.
 */
export function ChangePasswordForm({ action, forced }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; forced?: boolean }) {
  const [gen, setGen] = useState(0);
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r && !r.error) setGen((g) => g + 1);
    return r;
  }, null);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" key={gen}>
      <FormMessage state={state} />
      {forced && <input type="hidden" name="forced" value="1" />}
      {!forced && <PasswordField name="currentPassword" label="Current password" autoComplete="current-password" required error={fe.currentPassword} />}
      <NewPasswordFields name="newPassword" confirmName="confirmPassword" label="New password" confirmLabel="Confirm new password"
        errors={{ password: fe.newPassword, confirm: fe.confirmPassword }} autoFocus={forced} />
      <SubmitButton className={forced ? "btn-primary w-full" : "btn-primary w-full sm:w-auto"} pendingText="Saving…">
        {forced ? "Save new password and continue" : "Change password"}
      </SubmitButton>
    </form>
  );
}

"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { deleteAccountAction } from "@/app/(site)/account/actions";

export function DeleteAccountForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [state, action] = useActionState(deleteAccountAction, null);
  const [typed, setTyped] = useState("");
  const match = typed.trim().toLowerCase() === email.toLowerCase();
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div>
        <label htmlFor="confirmEmail" className="label">Type <strong className="break-all">{email}</strong> to confirm</label>
        <input id="confirmEmail" name="confirmEmail" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {hasPassword && (
        <div>
          <label htmlFor="delPassword" className="label">Your password</label>
          <input id="delPassword" name="currentPassword" type="password" className="input" autoComplete="current-password" required />
        </div>
      )}
      <SubmitButton className="btn-danger w-full sm:w-auto" disabled={!match} pendingText="Deleting…">Permanently delete my account</SubmitButton>
    </form>
  );
}

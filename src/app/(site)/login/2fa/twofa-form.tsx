"use client";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { verify2faAction } from "../actions";

export function TwoFactorForm({ next }: { next?: string }) {
  const [state, action] = useActionState(verify2faAction, null);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <div>
        <label htmlFor="code" className="label">6-digit code</label>
        <input id="code" name="code" className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Checking…">Verify and continue</SubmitButton>
    </form>
  );
}

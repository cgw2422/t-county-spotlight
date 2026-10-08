"use client";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/account/auth-shell";
import { forgotPasswordAction } from "./actions";

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) {
    return (
      <div className="text-center" role="status">
        <MailCheck className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <p className="mt-3 text-sm text-slate-700">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      <SubmitButton className="btn-primary w-full" pendingText="Sending…">Email me a reset link</SubmitButton>
    </form>
  );
}

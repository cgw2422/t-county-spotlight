"use client";
import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/account/auth-shell";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" required autoFocus defaultValue={state?.values?.email as string | undefined} />
      <div>
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <p className="mt-2 text-right text-sm"><Link href="/forgot-password/" className="font-medium text-brand-700 hover:underline">Forgot your password?</Link></p>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

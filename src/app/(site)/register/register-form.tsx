"use client";
import { useActionState } from "react";
import { Store } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/account/auth-shell";
import { registerAction } from "./actions";
import { echoed, echoedChecked } from "@/components/dashboard/fields";

export function RegisterForm({ next, business }: { next?: string; business?: boolean }) {
  const [state, action] = useActionState(registerAction, null);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values;
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage state={state} />
      <Field label="Your name" name="name" autoComplete="name" required maxLength={100} error={fe.name} autoFocus defaultValue={echoed(v, "name", "")} />
      <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" required error={fe.email} defaultValue={echoed(v, "email", "")} />
      <Field label="Create a password" name="password" type="password" autoComplete="new-password" required minLength={10}
        help="At least 10 characters, with letters and numbers." error={fe.password} />
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-brand-200">
        <input type="checkbox" name="ownsBusiness" defaultChecked={echoedChecked(v, "ownsBusiness", !!business)} className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600" />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-navy-900"><Store className="h-4 w-4" aria-hidden /> I own a local business</span>
          <span className="mt-0.5 block text-slate-600">We&apos;ll take you to list or claim your business next. It&apos;s free.</span>
        </span>
      </label>
      <SubmitButton className="btn-primary w-full" pendingText="Creating your account…">Create free account</SubmitButton>
      <p className="text-center text-xs text-slate-500">We&apos;ll email you a link to confirm your address. We never sell your information.</p>
    </form>
  );
}

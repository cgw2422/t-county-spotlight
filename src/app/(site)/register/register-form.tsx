"use client";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { Mail, Store } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field } from "@/components/account/auth-shell";
import { NewPasswordFields } from "@/components/account/password-fields";
import { sendTrack } from "@/components/public/track";
import { ALL_COUNTY, ALL_COUNTY_LABEL, COMMUNITIES } from "@/lib/my-t-county-shared";
import { PRIVACY_PATH, REGISTER_OPT_IN_LABEL, SIGNUP_DESCRIPTION, SIGNUP_DISCLAIMER } from "@/lib/newsletter/copy";
import type { RegisterSource } from "@/lib/resident-accounts";
import { registerAction } from "./actions";
import { echoed, echoedChecked } from "@/components/dashboard/fields";

export function RegisterForm({ next, business, source, community }: { next?: string; business?: boolean; source: RegisterSource; community: string }) {
  const [state, action] = useActionState(registerAction, null);
  const started = useRef(false);
  const fe = state?.fieldErrors ?? {};
  const v = state?.values;
  const main = COMMUNITIES.filter((c) => c.main);
  const other = COMMUNITIES.filter((c) => !c.main);
  // First interaction with any field (aggregate "started registration", once per page view).
  const onFocus = () => {
    if (started.current) return;
    started.current = true;
    sendTrack({ type: "register_start", targetType: "REGISTER", targetId: source });
  };
  return (
    <form action={action} onFocus={onFocus} className="space-y-4" data-testid="register-form">
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="source" value={source} />
      {/* Honeypot (hidden from people and screen readers) */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input id="f-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" name="firstName" autoComplete="given-name" required maxLength={60} error={fe.firstName} defaultValue={echoed(v, "firstName", "")} />
        <Field label="Last name" name="lastName" autoComplete="family-name" required maxLength={60} error={fe.lastName} defaultValue={echoed(v, "lastName", "")} />
      </div>
      <Field label="Email address" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} error={fe.email} defaultValue={echoed(v, "email", "")} />
      <NewPasswordFields label="Create a password" confirmLabel="Confirm password" errors={{ password: fe.password, confirm: fe.confirm }} />
      <div>
        <label htmlFor="f-community" className="label">Home community <span className="font-normal text-slate-500">(optional)</span></label>
        <select id="f-community" name="community" className="input" defaultValue={echoed(v, "community", community)} aria-invalid={fe.community ? true : undefined} aria-describedby="f-community-help">
          <option value="">Choose later</option>
          <option value={ALL_COUNTY}>{ALL_COUNTY_LABEL}</option>
          <optgroup label="Main towns">{main.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
          <optgroup label="More communities">{other.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</optgroup>
        </select>
        <p id="f-community-help" className={fe.community ? "mt-1 text-xs text-red-600" : "help"}>{fe.community || "Shows what’s happening near you first. You can change it any time."}</p>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-brand-200" data-testid="register-newsletter">
        <input type="checkbox" name="newsletter" defaultChecked={echoedChecked(v, "newsletter", false)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600" />
        <span className="text-sm">
          <span className="block font-semibold text-navy-900"><Mail className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />{REGISTER_OPT_IN_LABEL} <span className="font-normal text-slate-500">(optional)</span></span>
          <span className="mt-0.5 block text-slate-600">{SIGNUP_DESCRIPTION} {SIGNUP_DISCLAIMER} We&apos;ll email you a link to confirm first. <Link href={PRIVACY_PATH} className="underline underline-offset-2 hover:text-brand-700">How we use your email</Link></span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-brand-200">
        <input type="checkbox" name="ownsBusiness" defaultChecked={echoedChecked(v, "ownsBusiness", !!business)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600" />
        <span className="text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-navy-900"><Store className="h-4 w-4" aria-hidden /> I own a local business</span>
          <span className="mt-0.5 block text-slate-600">We&apos;ll take you to list or claim your business next. Your resident account stays free either way.</span>
        </span>
      </label>
      <SubmitButton className="btn-primary w-full" pendingText="Creating your account…">Create free account</SubmitButton>
      <p className="text-center text-xs text-slate-500">We&apos;ll email you a link to confirm your address. We never sell your information.</p>
    </form>
  );
}

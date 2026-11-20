"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LogIn, Mail, UserPlus } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { PrivacyPolicyLink } from "@/components/ui/privacy-link";
import { NewPasswordFields } from "@/components/account/password-fields";
import { echoed, echoedChecked } from "@/components/dashboard/fields";
import { PRIVACY_PATH, REGISTER_NEWSLETTER_LABEL, SIGNUP_DISCLAIMER } from "@/lib/newsletter/copy";
import { submitApplication, type ApplicationFormState } from "./actions";

function Err({ state, name }: { state: ApplicationFormState; name: string }) {
  const m = state?.fieldErrors?.[name];
  return m ? <p id={`${name}-err`} className="mt-1 text-sm text-red-600">{m}</p> : null;
}

export type ApplicationDefaults = Partial<Record<"businessName" | "email" | "contactName" | "firstName" | "lastName" | "phone" | "website" | "address" | "city" | "category" | "message" | "wantsSpotlight" | "wantsJobPosting" | "newsletter", string>>;

/**
 * Signed in: the application form (no password fields; name/email prefilled from the account).
 * Signed out: first two choices — "Sign In" (returns here, claim kept) or "Create a Free Account"
 * (the form plus first/last name, email and a password that meets the usual policy).
 */
export function ApplicationForm({ categories, cities, defaults, claimSlug, signedIn, signInHref, startWithCreate, draftToken, newsletterMode, newsletterTagline }: {
  categories: string[]; cities: string[]; defaults: ApplicationDefaults; claimSlug?: string;
  signedIn: boolean; signInHref: string; startWithCreate?: boolean; draftToken?: string;
  newsletterMode: "builtin" | "beehiiv"; newsletterTagline: string;
}) {
  const [state, action] = useActionState(submitApplication, null);
  const [mode, setMode] = useState<"choose" | "create">(startWithCreate ? "create" : "choose");
  const inv = (n: string) => (state?.fieldErrors?.[n] ? { "aria-invalid": true, "aria-describedby": `${n}-err` } : {});
  const v = state?.values;
  const val = (n: keyof ApplicationDefaults) => echoed(v, n, defaults[n] ?? "");
  const checked = (n: keyof ApplicationDefaults) => echoedChecked(v, n, defaults[n] === "on");

  if (state?.ok) {
    return (
      <div role="status" className="card p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
        <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">Application received</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{state.message}</p>
        <Link href="/businesses/" className="btn-primary mt-6">Browse the directory</Link>
      </div>
    );
  }

  if (!signedIn && mode === "choose") {
    return (
      <div className="card p-5 sm:p-8" data-testid="lyb-start">
        <h2 className="font-display text-xl font-bold text-navy-900 sm:text-2xl">First, your T County Connect account</h2>
        <p className="mt-2 text-sm text-slate-600">
          {claimSlug ? "Your claim" : "Your application"} is connected to your account, so you can manage the listing once our team approves it. Accounts are free.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href={signInHref} className="btn-secondary min-h-14 text-base" data-testid="lyb-sign-in"><LogIn className="h-5 w-5" aria-hidden /> Sign In</Link>
          <a
            href={`?${new URLSearchParams({ ...(claimSlug ? { claim: claimSlug } : {}), ...(draftToken ? { draft: draftToken } : {}), start: "create" }).toString()}`}
            onClick={(e) => { e.preventDefault(); setMode("create"); }}
            className="btn-primary min-h-14 text-base" data-testid="lyb-create"
          ><UserPlus className="h-5 w-5" aria-hidden /> Create a Free Account</a>
        </div>
        <p className="mt-4 text-xs text-slate-500">Already have an account? Sign in and we&rsquo;ll bring you right back to this form.</p>
      </div>
    );
  }

  return (
    <form action={action} className="card space-y-5 p-5 sm:p-8" noValidate data-testid="lyb-form" data-mode={signedIn ? "signed-in" : "create"}>
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="fax_number">Leave this empty</label>
        <input id="fax_number" name="fax_number" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {claimSlug && <input type="hidden" name="claimSlug" value={claimSlug} />}
      {draftToken && <input type="hidden" name="draft" value={draftToken} />}

      {state?.accountExists ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-testid="lyb-account-exists">
          <p className="font-semibold">{state.error}</p>
          <p className="mt-1">We kept what you entered. Sign in and you&rsquo;ll come back to this {claimSlug ? "claim" : "application"} with your details filled in.</p>
          <Link href={state.accountExists.signInHref} className="btn-primary btn-sm mt-3 min-h-11" data-testid="lyb-account-exists-sign-in"><LogIn className="h-4 w-4" aria-hidden /> Sign In</Link>
        </div>
      ) : <FormMessage state={state} />}

      {!signedIn && (
        <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5" data-testid="lyb-account-fields">
          <legend className="px-1 font-display text-base font-bold text-navy-900">Create your free account</legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="label">First name <span className="text-red-600">*</span></label>
              <input id="firstName" name="firstName" required maxLength={60} defaultValue={val("firstName")} className="input" autoComplete="given-name" {...inv("firstName")} />
              <Err state={state} name="firstName" />
            </div>
            <div>
              <label htmlFor="lastName" className="label">Last name <span className="text-red-600">*</span></label>
              <input id="lastName" name="lastName" required maxLength={60} defaultValue={val("lastName")} className="input" autoComplete="family-name" {...inv("lastName")} />
              <Err state={state} name="lastName" />
            </div>
          </div>
          <div>
            <label htmlFor="email" className="label">Email <span className="text-red-600">*</span></label>
            <input id="email" name="email" type="email" required maxLength={200} defaultValue={val("email")} className="input" autoComplete="email" inputMode="email" {...inv("email")} />
            <Err state={state} name="email" />
          </div>
          <NewPasswordFields label="Create a password" confirmLabel="Confirm password" errors={{ password: state?.fieldErrors?.password, confirm: state?.fieldErrors?.confirm }} />
          <p className="text-xs text-slate-500">
            We&rsquo;ll email you a link to confirm your address. You can use your account right away; you&rsquo;ll be able to manage the listing once your request is approved.{" "}
            Have an account? <Link href={signInHref} className="font-semibold text-brand-700 hover:underline">Sign in instead</Link>.
          </p>
        </fieldset>
      )}

      <div>
        <label htmlFor="businessName" className="label">Business name <span className="text-red-600">*</span></label>
        <input id="businessName" name="businessName" required maxLength={150} defaultValue={val("businessName")} className="input" autoComplete="organization" {...inv("businessName")} />
        <Err state={state} name="businessName" />
      </div>
      {signedIn && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="contactName" className="label">Your name</label>
            <input id="contactName" name="contactName" maxLength={120} defaultValue={val("contactName")} className="input" autoComplete="name" />
          </div>
          <div>
            <label htmlFor="email" className="label">Email <span className="text-red-600">*</span></label>
            <input id="email" name="email" type="email" required defaultValue={val("email")} className="input" autoComplete="email" {...inv("email")} />
            <Err state={state} name="email" />
          </div>
        </div>
      )}
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200" data-testid="lyb-public-fields">
        Once approved, your business name, phone, website, address, town, category and description appear on your public listing. Your name and email stay private unless you later choose to show an email on your listing.
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" name="phone" type="tel" maxLength={40} defaultValue={val("phone")} className="input" autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="website" className="label">Website</label>
          <input id="website" name="website" type="url" inputMode="url" maxLength={300} defaultValue={val("website")} className="input" placeholder="https://" {...inv("website")} />
          <Err state={state} name="website" />
        </div>
      </div>
      <div>
        <label htmlFor="address" className="label">Street address</label>
        <input id="address" name="address" maxLength={200} defaultValue={val("address")} className="input" autoComplete="street-address" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="label">Town</label>
          <input id="city" name="city" list="lyb-cities" maxLength={80} defaultValue={val("city")} className="input" />
          <datalist id="lyb-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" className="input" defaultValue={val("category")}>
            <option value="">Choose one</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="message" className="label">Tell us about your business</label>
        <textarea id="message" name="message" rows={5} maxLength={3000} defaultValue={val("message")} className="input" placeholder={claimSlug ? "How are you connected to this business? (owner, manager…)" : "What do you offer? What makes you special?"} />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">I&rsquo;m also interested in…</legend>
        <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="wantsSpotlight" defaultChecked={checked("wantsSpotlight")} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300" />
          <span><span className="font-medium text-slate-900">Being considered for an editorial Business Spotlight</span><br /><span className="text-slate-500">Spotlights are chosen by our editors and are never paid placements.</span></span>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
          <input type="checkbox" name="wantsJobPosting" defaultChecked={checked("wantsJobPosting")} className="h-5 w-5 shrink-0 rounded border-slate-300" />
          <span className="font-medium text-slate-900">Posting a job opening</span>
        </label>
      </fieldset>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-brand-200" data-testid="lyb-newsletter">
        <input type="checkbox" name="newsletter" defaultChecked={checked("newsletter")} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-600" />
        <span className="text-sm">
          <span className="block font-semibold text-navy-900"><Mail className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />{REGISTER_NEWSLETTER_LABEL} <span className="font-normal text-slate-500">(optional)</span></span>
          <span className="mt-0.5 block text-slate-600">{newsletterTagline} {SIGNUP_DISCLAIMER} {newsletterMode === "builtin" ? "We’ll email you a link to confirm first. " : "Separate from your application. "}<Link href={PRIVACY_PATH} className="underline underline-offset-2 hover:text-brand-700">How we use your email</Link></span>
        </span>
      </label>
      <SubmitButton className="btn-primary w-full sm:w-auto sm:min-w-56" pendingText="Sending…">{claimSlug ? (signedIn ? "Request to claim listing" : "Create account & request claim") : (signedIn ? "Submit application" : "Create account & submit application")}</SubmitButton>
      <p className="text-xs text-slate-500">How we use your information: <PrivacyPolicyLink className="hover:text-brand-700" /></p>
    </form>
  );
}

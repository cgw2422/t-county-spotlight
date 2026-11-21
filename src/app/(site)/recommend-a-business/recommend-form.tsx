"use client";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Store } from "lucide-react";
import { LEAD_LIMITS, RECOMMEND_CONFIRMATION, RECOMMEND_PATH } from "@/lib/business-leads-shared";
import { PrivacyPolicyLink } from "@/components/ui/privacy-link";
import { recommendBusinessAction, type RecommendState } from "./actions";

function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label} {required ? <span className="text-red-600" aria-hidden>*</span> : <span className="font-normal text-slate-500">(optional)</span>}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** Public "Recommend a Business" form. No account; nothing here subscribes anyone to anything. */
export function RecommendForm({ cities, categories }: { cities: string[]; categories: string[] }) {
  const [state, action, pending] = useActionState<RecommendState, FormData>(recommendBusinessAction, null);
  if (state?.ok) {
    return (
      <div role="status" className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-8" data-testid="recommend-success">
        <CheckCircle2 className="mx-auto h-12 w-12 text-hillside-600" aria-hidden />
        <p className="mx-auto mt-4 max-w-xl text-lg font-semibold text-navy-900">{RECOMMEND_CONFIRMATION}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {/* A fresh page load gives a clean, empty form. */}
          <a href={RECOMMEND_PATH} className="btn-primary min-h-12" data-testid="recommend-another">Recommend Another Business</a>
          <Link href="/businesses/" className="btn-secondary min-h-12" data-testid="explore-businesses"><Store className="h-4 w-4" aria-hidden /> Explore Local Businesses</Link>
        </div>
      </div>
    );
  }
  const v = state?.values ?? {};
  const fe = state?.fieldErrors ?? {};
  const inv = (k: string) => (fe[k] ? { "aria-invalid": true, "aria-describedby": `${k}-err` } : {});
  return (
    <form action={action} noValidate className="space-y-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8" data-testid="recommend-form">
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website URL <input type="text" name="website_url" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800" data-testid="recommend-error">{state.error}</p>}

      <Field id="businessName" label="Business Name" required error={fe.businessName}>
        <input id="businessName" name="businessName" required maxLength={LEAD_LIMITS.name} defaultValue={v.businessName} className="input" autoComplete="off" {...inv("businessName")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="city" label="City/Town" required error={fe.city}>
          <input id="city" name="city" required maxLength={LEAD_LIMITS.city} list="recommend-towns" defaultValue={v.city} className="input" autoComplete="off" {...inv("city")} />
          <datalist id="recommend-towns">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field id="category" label="Business Category" error={fe.category}>
          <select id="category" name="category" defaultValue={v.category ?? ""} className="input" {...inv("category")}>
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="Other">Other</option>
          </select>
        </Field>
      </div>
      <Field id="website" label="Business Website or Facebook Page" error={fe.website} hint="For example, example.com or facebook.com/yourfavoriteplace">
        <input id="website" name="website" type="text" inputMode="url" maxLength={LEAD_LIMITS.website} defaultValue={v.website} className="input" placeholder="https://" autoComplete="off" {...inv("website")} />
      </Field>
      <Field id="reason" label="Why Do You Recommend This Business?" error={fe.reason}>
        <textarea id="reason" name="reason" rows={4} maxLength={LEAD_LIMITS.reason} defaultValue={v.reason} className="input" {...inv("reason")} />
      </Field>
      <fieldset className="grid gap-5 rounded-xl bg-offwhite p-4 ring-1 ring-slate-200 sm:grid-cols-2">
        <legend className="sr-only">Your contact details (optional)</legend>
        <Field id="firstName" label="Your First Name" error={fe.firstName}>
          <input id="firstName" name="firstName" maxLength={LEAD_LIMITS.firstName} defaultValue={v.firstName} className="input" autoComplete="given-name" {...inv("firstName")} />
        </Field>
        <Field id="email" label="Your Email Address" error={fe.email}>
          <input id="email" name="email" type="email" inputMode="email" maxLength={LEAD_LIMITS.email} defaultValue={v.email} className="input" autoComplete="email" {...inv("email")} />
        </Field>
        <p className="text-xs text-slate-600 sm:col-span-2" data-testid="recommend-privacy-note">
          Your name and email are optional. We&apos;ll only use them to follow up with you about this recommendation. They&apos;re never shown publicly, and this doesn&apos;t sign you up for our newsletter. <PrivacyPolicyLink className="hover:text-brand-700" />
        </p>
      </fieldset>
      <button type="submit" disabled={pending} className="btn-primary min-h-12 w-full text-base sm:w-auto" data-testid="recommend-submit">
        {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Sending…</> : "Send Recommendation"}
      </button>
    </form>
  );
}

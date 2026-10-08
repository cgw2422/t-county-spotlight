"use client";
import { useActionState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { submitApplication } from "./actions";

function Err({ state, name }: { state: ActionState; name: string }) {
  const m = state?.fieldErrors?.[name];
  return m ? <p id={`${name}-err`} className="mt-1 text-sm text-red-600">{m}</p> : null;
}

export function ApplicationForm({ categories, cities, defaults, claimSlug }: {
  categories: string[]; cities: string[]; defaults: { businessName?: string; email?: string; contactName?: string }; claimSlug?: string;
}) {
  const [state, action] = useActionState(submitApplication, null);
  const inv = (n: string) => (state?.fieldErrors?.[n] ? { "aria-invalid": true, "aria-describedby": `${n}-err` } : {});

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

  return (
    <form action={action} className="card space-y-5 p-5 sm:p-8" noValidate>
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="fax_number">Leave this empty</label>
        <input id="fax_number" name="fax_number" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {claimSlug && <input type="hidden" name="claimSlug" value={claimSlug} />}

      <div>
        <label htmlFor="businessName" className="label">Business name <span className="text-red-600">*</span></label>
        <input id="businessName" name="businessName" required maxLength={150} defaultValue={defaults.businessName} className="input" autoComplete="organization" {...inv("businessName")} />
        <Err state={state} name="businessName" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contactName" className="label">Your name</label>
          <input id="contactName" name="contactName" maxLength={120} defaultValue={defaults.contactName} className="input" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email <span className="text-red-600">*</span></label>
          <input id="email" name="email" type="email" required defaultValue={defaults.email} className="input" autoComplete="email" {...inv("email")} />
          <Err state={state} name="email" />
        </div>
        <div>
          <label htmlFor="phone" className="label">Phone</label>
          <input id="phone" name="phone" type="tel" maxLength={40} className="input" autoComplete="tel" />
        </div>
        <div>
          <label htmlFor="website" className="label">Website</label>
          <input id="website" name="website" type="url" inputMode="url" maxLength={300} className="input" placeholder="https://" {...inv("website")} />
          <Err state={state} name="website" />
        </div>
      </div>
      <div>
        <label htmlFor="address" className="label">Street address</label>
        <input id="address" name="address" maxLength={200} className="input" autoComplete="street-address" />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className="label">Town</label>
          <input id="city" name="city" list="lyb-cities" maxLength={80} className="input" />
          <datalist id="lyb-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label htmlFor="category" className="label">Category</label>
          <select id="category" name="category" className="input" defaultValue="">
            <option value="">Choose one</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="message" className="label">Tell us about your business</label>
        <textarea id="message" name="message" rows={5} maxLength={3000} className="input" placeholder={claimSlug ? "How are you connected to this business? (owner, manager…)" : "What do you offer? What makes you special?"} />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">I&rsquo;m also interested in…</legend>
        <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="wantsSpotlight" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300" />
          <span><span className="font-medium text-slate-900">Being considered for an editorial Business Spotlight</span><br /><span className="text-slate-500">Spotlights are chosen by our editors and are never paid placements.</span></span>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
          <input type="checkbox" name="wantsJobPosting" className="h-5 w-5 shrink-0 rounded border-slate-300" />
          <span className="font-medium text-slate-900">Posting a job opening</span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary w-full sm:w-auto sm:min-w-56" pendingText="Sending…">{claimSlug ? "Request to claim listing" : "Submit application"}</SubmitButton>
    </form>
  );
}

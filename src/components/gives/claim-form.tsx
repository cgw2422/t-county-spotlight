"use client";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { CLAIM_ROLES, CLAIM_VERIFY_METHODS } from "@/lib/gives/constants";
import { submitClaimAction } from "@/app/(site)/gives/claim/actions";

function Field({ id, label, optional, error, hint, children }: { id: string; label: string; optional?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}{optional && <span className="font-normal text-slate-400"> (optional)</span>}</label>
      {children}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : hint ? <p className="help text-sm">{hint}</p> : null}
    </div>
  );
}

/** Claim / "request to be added" form for an organization listing. */
export function ClaimForm({ slug, orgName, name, requestOnly }: { slug: string; orgName: string; name: string; requestOnly?: boolean }) {
  const [state, action] = useActionState(submitClaimAction, null);
  const fe = state?.fieldErrors ?? {};
  const [v, setV] = useState<Record<string, string>>({ applicantName: name, role: "", verificationMethod: "" });
  const bind = (k: string) => ({
    name: k, value: v[k] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value })),
  });
  return (
    <form action={action} className="relative space-y-5">
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input type="text" name="website_url" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="c-name" label="Your full name" error={fe.applicantName}>
          <input id="c-name" {...bind("applicantName")} required maxLength={120} autoComplete="name" className={cn("input", fe.applicantName && "border-red-400")} />
        </Field>
        <Field id="c-phone" label="Phone" optional error={fe.phone}>
          <input id="c-phone" {...bind("phone")} type="tel" maxLength={30} autoComplete="tel" className="input" />
        </Field>
      </div>
      <Field id="c-email" label="Organization email" error={fe.email} hint={`The address you use for ${orgName} — ideally at the organization's own domain. We'll send a confirmation link to it.`}>
        <input id="c-email" {...bind("email")} type="email" required maxLength={254} autoComplete="email" className={cn("input", fe.email && "border-red-400")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="c-role" label="Your role within the organization" error={fe.role}>
          <select id="c-role" {...bind("role")} required className={cn("input", fe.role && "border-red-400")}>
            <option value="">Choose…</option>
            {CLAIM_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        {v.role === "Other" && (
          <Field id="c-roleOther" label="Describe your role" error={fe.roleOther}>
            <input id="c-roleOther" {...bind("roleOther")} required maxLength={120} className="input" />
          </Field>
        )}
      </div>
      <Field id="c-method" label="How can we verify you?" error={fe.verificationMethod}>
        <select id="c-method" {...bind("verificationMethod")} required className={cn("input", fe.verificationMethod && "border-red-400")}>
          <option value="">Choose…</option>
          {CLAIM_VERIFY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </Field>
      <Field id="c-aff" label="Publicly verifiable affiliation" error={fe.affiliation} hint="Where can your role be confirmed? e.g. listed on the staff page of the organization's website, in the church bulletin, or on a state filing.">
        <textarea id="c-aff" {...bind("affiliation")} required rows={3} maxLength={2000} className={cn("input min-h-20", fe.affiliation && "border-red-400")} />
      </Field>
      <Field id="c-affUrl" label="Link that shows your affiliation" optional error={fe.affiliationUrl}>
        <input id="c-affUrl" {...bind("affiliationUrl")} inputMode="url" maxLength={500} placeholder="https://" className="input" />
      </Field>
      <Field id="c-msg" label="Message for our team" optional>
        <textarea id="c-msg" {...bind("message")} rows={3} maxLength={2000} className="input min-h-20" />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <input type="checkbox" name="attest" required className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span className="text-sm font-medium text-slate-800">I am authorized to manage this organization&apos;s public information.</span>
      </label>
      {fe.attest && <p className="-mt-3 text-sm text-red-600">{fe.attest}</p>}
      <FormMessage state={state?.error ? state : null} />
      <SubmitButton className="btn-primary min-h-12 w-full text-base sm:w-auto" pendingText="Sending…">{requestOnly ? "Send request to our team" : "Submit claim"}</SubmitButton>
      <p className="text-xs text-slate-500">Your details are shared only with the TCountySpotlight team — never posted publicly. Managing a listing is always free.</p>
    </form>
  );
}

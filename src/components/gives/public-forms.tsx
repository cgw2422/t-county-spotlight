"use client";
import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { CitySelect } from "@/components/admin/city-select";
import { cn } from "@/lib/utils";
import { KIND_LABEL, ORG_KINDS } from "@/lib/gives/constants";
import { pledgeAction, registerOrgAction, volunteerSignupAction } from "@/app/(site)/gives/actions";

type Prefill = { name?: string | null; email?: string | null };

function Field({ id, label, optional, error, children, hint }: { id: string; label: string; optional?: boolean; error?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}{optional && <span className="font-normal text-slate-400"> (optional)</span>}</label>
      {children}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : hint ? <p className="help text-sm">{hint}</p> : null}
    </div>
  );
}

/** Off-screen honeypot field: real people never fill it. */
function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>Website <input type="text" name="website_url" tabIndex={-1} autoComplete="off" /></label>
    </div>
  );
}

function Success({ state, children }: { state: ActionState; children?: React.ReactNode }) {
  return (
    <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
      <p className="flex items-start gap-2 font-semibold"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> {state?.message}</p>
      {children}
    </div>
  );
}

export function PledgeForm({ needId, unit, prefill, suggested = 1 }: { needId: string; unit?: string | null; prefill: Prefill; suggested?: number }) {
  const [state, action] = useActionState(pledgeAction, null);
  const [values, setValues] = useState({ name: prefill.name ?? "", email: prefill.email ?? "", phone: "", quantity: String(suggested), message: "" });
  const fe = state?.fieldErrors ?? {};
  if (state?.ok) return <Success state={state}><p className="mt-2 text-sm">Your name and contact details are shared only with the organization — never posted publicly.</p></Success>;
  const bind = (k: keyof typeof values) => ({ value: values[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value })) });
  return (
    <form action={action} className="relative space-y-4">
      <Honeypot />
      <input type="hidden" name="needId" value={needId} />
      <Field id="p-quantity" label={`How many${unit ? ` ${unit}` : ""} can you give?`} error={fe.quantity}>
        <input id="p-quantity" name="quantity" type="number" min={1} max={100000} inputMode="numeric" required className={cn("input", fe.quantity && "border-red-400")} {...bind("quantity")} />
      </Field>
      <Field id="p-name" label="Your name" error={fe.name}>
        <input id="p-name" name="name" required maxLength={120} autoComplete="name" className={cn("input", fe.name && "border-red-400")} {...bind("name")} />
      </Field>
      <Field id="p-email" label="Email" error={fe.email} hint="We'll send you drop-off details.">
        <input id="p-email" name="email" type="email" required maxLength={254} autoComplete="email" className={cn("input", fe.email && "border-red-400")} {...bind("email")} />
      </Field>
      <Field id="p-phone" label="Phone" optional error={fe.phone}>
        <input id="p-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className="input" {...bind("phone")} />
      </Field>
      <Field id="p-message" label="Message to the organization" optional>
        <textarea id="p-message" name="message" rows={3} maxLength={1000} className="input min-h-20" placeholder="e.g. I can drop off Saturday morning." {...bind("message")} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="btn-accent min-h-12 w-full text-base" pendingText="Sending…">Pledge to help</SubmitButton>
      <p className="text-center text-xs text-slate-500">No account needed. Your details go only to the organization and are never shown publicly.</p>
    </form>
  );
}

export function VolunteerSignupForm({ oppId, minAge, prefill, full }: { oppId: string; minAge: number | null; prefill: Prefill; full: boolean }) {
  const [state, action] = useActionState(volunteerSignupAction, null);
  const [values, setValues] = useState({ name: prefill.name ?? "", email: prefill.email ?? "", phone: "", notes: "" });
  const [adult, setAdult] = useState(true);
  const fe = state?.fieldErrors ?? {};
  if (state?.ok) return <Success state={state} />;
  const bind = (k: keyof typeof values) => ({ value: values[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value })) });
  const needGuardian = minAge != null && !adult;
  return (
    <form action={action} className="relative space-y-4">
      <Honeypot />
      <input type="hidden" name="oppId" value={oppId} />
      {full && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">All spots are taken right now. Sign up and you&apos;ll join the waitlist.</p>}
      <Field id="v-name" label="Your name" error={fe.name}>
        <input id="v-name" name="name" required maxLength={120} autoComplete="name" className={cn("input", fe.name && "border-red-400")} {...bind("name")} />
      </Field>
      <Field id="v-email" label="Email" error={fe.email}>
        <input id="v-email" name="email" type="email" required maxLength={254} autoComplete="email" className={cn("input", fe.email && "border-red-400")} {...bind("email")} />
      </Field>
      <Field id="v-phone" label="Phone" optional error={fe.phone}>
        <input id="v-phone" name="phone" type="tel" maxLength={30} autoComplete="tel" className="input" {...bind("phone")} />
      </Field>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input type="checkbox" name="isAdult" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-brand-600" />
        <span className="text-sm font-medium text-navy-900">I am 18 or older</span>
      </label>
      <Field id="v-notes" label={needGuardian ? "Parent or guardian name and phone" : "Notes for the organizer"} optional={!needGuardian} error={fe.notes} hint={needGuardian ? "Required for volunteers under 18." : undefined}>
        <textarea id="v-notes" name="notes" rows={3} maxLength={1000} required={needGuardian} className={cn("input min-h-20", fe.notes && "border-red-400")} {...bind("notes")} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary min-h-12 w-full text-base" pendingText="Signing up…">{full ? "Join the waitlist" : "Sign me up"}</SubmitButton>
      <p className="text-center text-xs text-slate-500">No account needed. Your details go only to the organizer.</p>
    </form>
  );
}

export function RegisterOrgForm({ defaultKind, email }: { defaultKind: string; email: string }) {
  const [state, action] = useActionState(registerOrgAction, null);
  const fe = state?.fieldErrors ?? {};
  const [kind, setKind] = useState(defaultKind);
  const [v, setV] = useState<Record<string, string>>({ email });
  // controlled fields keep their values when the server returns a validation error
  const bind = (k: string) => ({ name: k, value: v[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form action={action} className="relative space-y-5">
      <Honeypot />
      <fieldset>
        <legend className="label">What kind of organization?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ORG_KINDS.map((k) => (
            <label key={k} className={cn("flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium", kind === k ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-200" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="h-4 w-4 accent-brand-600" />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="r-name" label={kind === "CHURCH" ? "Church name" : "Organization name"} error={fe.name}>
        <input id="r-name" {...bind("name")} required maxLength={160} className={cn("input", fe.name && "border-red-400")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="r-orgType" label={kind === "CHURCH" ? "Denomination or type" : "Type or cause"} optional>
          <input id="r-orgType" {...bind("orgType")} maxLength={80} className="input" placeholder={kind === "CHURCH" ? "e.g. Lutheran" : "e.g. Food pantry"} />
        </Field>
        <Field id="r-ein" label="EIN (tax ID)" optional error={fe.ein} hint="Helps us verify you. Never shown publicly.">
          <input id="r-ein" {...bind("ein")} maxLength={20} inputMode="numeric" className="input" placeholder="12-3456789" />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="r-email" label="Organization email" error={fe.email}>
          <input id="r-email" {...bind("email")} type="email" required maxLength={254} className={cn("input", fe.email && "border-red-400")} />
        </Field>
        <Field id="r-phone" label="Phone" optional error={fe.phone}>
          <input id="r-phone" {...bind("phone")} type="tel" maxLength={30} className="input" />
        </Field>
        <Field id="r-website" label="Website" optional error={fe.website}>
          <input id="r-website" {...bind("website")} maxLength={300} inputMode="url" className="input" placeholder="www.example.org" />
        </Field>
        <div>
          <CitySelect label="Town" />
          {fe.city && <p className="mt-1 text-sm text-red-600">{fe.city}</p>}
        </div>
      </div>
      <Field id="r-description" label="What does your organization do?" error={fe.description} hint="A sentence or two. You can add much more after you register.">
        <textarea id="r-description" {...bind("description")} rows={4} required maxLength={2000} className={cn("input min-h-24", fe.description && "border-red-400")} />
      </Field>
      <Field id="r-role" label="Your role" error={fe.applicantRole}>
        <input id="r-role" {...bind("applicantRole")} required maxLength={120} className={cn("input", fe.applicantRole && "border-red-400")} placeholder={kind === "CHURCH" ? "e.g. Pastor, church secretary" : "e.g. Executive director, board member"} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="btn-primary min-h-12 w-full text-base sm:w-auto" pendingText="Registering…">Register for free</SubmitButton>
    </form>
  );
}

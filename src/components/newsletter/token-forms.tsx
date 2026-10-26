"use client";
import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { TOPICS, type Preferences } from "@/lib/newsletter/copy";
import { savePreferencesByTokenAction, unsubscribeByTokenAction, accountPreferencesAction, accountUnsubscribeAction, accountSubscribeAction } from "./actions";

const REASONS = ["Too many emails", "Not relevant to me", "I never signed up", "I moved away from the area", "Other"];

function Btn({ pending, children, className }: { pending: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button type="submit" disabled={pending} className={className ?? "btn-primary w-full"}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

function Done({ message }: { message?: string }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function ReasonSelect() {
  return (
    <div>
      <label htmlFor="nl-reason" className="label">Reason <span className="font-normal text-slate-400">(optional)</span></label>
      <select id="nl-reason" name="reason" className="input" defaultValue="">
        <option value="">Prefer not to say</option>
        {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  );
}

export function UnsubscribeForm({ token }: { token?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(token ? unsubscribeByTokenAction : accountUnsubscribeAction, null);
  if (state?.ok) return <Done message={state.message} />;
  return (
    <form action={action} className="space-y-4">
      {token && <input type="hidden" name="token" value={token} />}
      <ReasonSelect />
      <FormMessage state={state} />
      <Btn pending={pending} className={token ? "btn-danger w-full" : "btn-secondary w-full sm:w-auto"}>Unsubscribe</Btn>
    </form>
  );
}

export function TopicFields({ prefs }: { prefs: Preferences }) {
  return (
    <fieldset>
      <legend className="label">Topics I&rsquo;d like to hear about</legend>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {TOPICS.map((t) => (
          <li key={t.key}>
            <label className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3">
              <input type="checkbox" name={`topic_${t.key}`} defaultChecked={prefs[t.key]} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
              <span>
                <span className="block text-sm font-semibold text-navy-900">{t.label}</span>
                <span className="block text-xs text-slate-500">{t.help}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function PreferencesForm({ token, prefs, firstName }: { token?: string; prefs: Preferences; firstName?: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(token ? savePreferencesByTokenAction : accountPreferencesAction, null);
  return (
    <form action={action} className="space-y-4">
      {token && <input type="hidden" name="token" value={token} />}
      {token && (
        <div>
          <label htmlFor="nl-first" className="label">First name <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="nl-first" name="firstName" defaultValue={firstName ?? ""} maxLength={80} autoComplete="given-name" className="input" />
        </div>
      )}
      <TopicFields prefs={prefs} />
      <FormMessage state={state} />
      <Btn pending={pending} className="btn-primary w-full sm:w-auto">Save preferences</Btn>
    </form>
  );
}

export function AccountSubscribeForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(accountSubscribeAction, null);
  if (state?.ok) return <Done message={state.message} />;
  return (
    <form action={action} className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
        <span className="text-sm text-slate-700">
          Yes, send the T-County Weekly to <strong>{email}</strong>: local events, community stories, business spotlights, things to do and occasional labeled promotions from local businesses.{" "}
          <Link href="/newsletter/#privacy" className="font-semibold text-brand-700 hover:underline">How we use your email</Link>
        </span>
      </label>
      <FormMessage state={state} />
      <Btn pending={pending} className="btn-primary w-full sm:w-auto">Get the T-County Weekly</Btn>
      <p className="text-xs text-slate-500">We&rsquo;ll email you a link to confirm. Free to subscribe. Unsubscribe anytime.</p>
    </form>
  );
}

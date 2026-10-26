"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { PRIVACY_PATH, SIGNUP_BUTTON, SIGNUP_DESCRIPTION, SIGNUP_DISCLAIMER, SIGNUP_HEADLINE, type SignupSource } from "@/lib/newsletter/copy";
import { subscribeAction } from "./actions";

type Props = {
  source: Exclude<SignupSource, "admin_invite">;
  variant?: "card" | "compact" | "inline";
  /** Dark background (site footer). */
  tone?: "light" | "dark";
  title?: string | null;
  subtitle?: string | null;
  className?: string;
};

/**
 * T-County Weekly signup (double opt-in). Inline success/error, no reload.
 * Variants: card (homepage, /explore/, /newsletter/), compact (footer), inline (articles, events).
 */
export function NewsletterSignup({ source, variant = "card", tone = "light", title, subtitle, className }: Props) {
  const id = useId();
  const [state, action, pending] = useActionState<ActionState, FormData>(subscribeAction, null);
  const dark = tone === "dark";
  const done = !!state?.ok;
  const headline = title || SIGNUP_HEADLINE;
  const description = subtitle || SIGNUP_DESCRIPTION;
  const showName = variant === "card";

  const disclaimer = (
    <p className={cn("text-xs", dark ? "text-slate-400" : "text-slate-500")}>
      {SIGNUP_DISCLAIMER}{" "}
      <Link href={PRIVACY_PATH} className={cn("underline underline-offset-2", dark ? "hover:text-white" : "hover:text-brand-700")}>How we use your email</Link>
    </p>
  );

  const success = (
    <div role="status" aria-live="polite" className={cn("flex items-start gap-3 rounded-xl p-4", dark ? "bg-white/10 text-white" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200")}>
      <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", dark ? "text-emerald-300" : "text-emerald-600")} aria-hidden />
      <p className="text-sm">{state?.message}</p>
    </div>
  );

  const fields = (
    <>
      {/* Honeypot (hidden from people and screen readers) */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="source" value={source} />
    </>
  );

  const error = state?.error ? (
    <p id={`${id}-err`} role="alert" className={cn("text-sm font-medium", dark ? "text-red-300" : "text-red-700")}>{state.error}</p>
  ) : null;

  const submit = (
    <button type="submit" disabled={pending} className={cn("btn-primary shrink-0", variant === "card" && "w-full sm:w-auto")}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Mail className="h-4 w-4" aria-hidden />}
      {SIGNUP_BUTTON}
    </button>
  );

  const emailInput = (
    <div className="min-w-0 flex-1">
      <label htmlFor={`${id}-email`} className={cn(variant === "card" ? "label" : "sr-only", dark && "text-slate-200")}>Email address</label>
      <input
        id={`${id}-email`} name="email" type="email" required autoComplete="email" inputMode="email" maxLength={254}
        placeholder="you@example.com" className="input" aria-invalid={!!state?.fieldErrors?.email || undefined}
        aria-describedby={state?.error ? `${id}-err` : undefined}
      />
    </div>
  );

  if (variant === "compact") {
    return (
      <div className={cn(className)}>
        <h2 className={cn("font-display text-xl font-semibold", dark ? "text-white" : "text-navy-900")}>{headline}</h2>
        <p className={cn("mt-1 text-sm", dark ? "text-slate-300" : "text-slate-600")}>{description}</p>
        <div className="mt-4">
          {done ? success : (
            <form action={action} className="relative space-y-2" noValidate={false}>
              {fields}
              <div className="flex flex-col gap-2 sm:flex-row">{emailInput}{submit}</div>
              {error}
              {disclaimer}
            </form>
          )}
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <aside aria-labelledby={`${id}-h`} className={cn("rounded-2xl border border-brand-100 bg-brand-50/60 p-5 sm:p-6", className)}>
        <div className="flex items-start gap-3">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm sm:flex"><Mail className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-h`} className="font-display text-xl font-semibold text-navy-900">{headline}</h2>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
            <div className="mt-4">
              {done ? success : (
                <form action={action} className="relative space-y-2">
                  {fields}
                  <div className="flex flex-col gap-2 sm:flex-row">{emailInput}{submit}</div>
                  {error}
                  {disclaimer}
                </form>
              )}
            </div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-3xl bg-cream ring-1 ring-amber-200/70", className)}>
      <div className="grid gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-10">
        <div>
          <p className="eyebrow">The T-County Weekly</p>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight text-navy-900 text-balance sm:text-4xl">{headline}</h2>
          <p className="mt-3 text-slate-700 sm:text-lg">{description}</p>
        </div>
        <div>
          {done ? success : (
            <form action={action} className="relative space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
              {fields}
              {showName && (
                <div>
                  <label htmlFor={`${id}-first`} className="label">First name <span className="font-normal text-slate-400">(optional)</span></label>
                  <input id={`${id}-first`} name="firstName" type="text" autoComplete="given-name" maxLength={80} className="input" />
                </div>
              )}
              {emailInput}
              {error}
              {submit}
              {disclaimer}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

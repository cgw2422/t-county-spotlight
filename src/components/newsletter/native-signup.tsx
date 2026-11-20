"use client";
import { useActionState, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivacyPolicyLink } from "@/components/ui/privacy-link";
import { SIGNUP_FIELD_LABEL, SUCCESS_OUTCOMES, type SignupPlacement } from "@/lib/newsletter/copy";
import type { SignupState } from "@/lib/beehiiv/signup";
import { beehiivSignupAction } from "./actions";

type Props = {
  /** Sent to beehiiv as utm_campaign (validated again on the server). */
  placement: SignupPlacement;
  heading: string;
  description: string;
  button: string;
  footnote: string;
  /**
   * stacked: heading, then form (homepage hero aside, footer, articles, events, account).
   * wide: heading beside the form when there is room (/newsletter/, homepage section, /explore/).
   */
  layout?: "stacked" | "wide";
  headingId?: string;
  /** Admin preview: renders the real form but never submits. */
  preview?: boolean;
  /** h1 on /subscribe/ (the page's own heading); h2 everywhere else. */
  headingAs?: "h1" | "h2";
  /** Revealed below the message only after a success state (subscribed / already subscribed), e.g. the account invitation. */
  afterSuccess?: React.ReactNode;
  className?: string;
};

/**
 * T County Connect's own newsletter signup (provider beehiiv). One email field;
 * the server action forwards it to beehiiv's API. Inline, polite status
 * messages; no redirect, no iframe, no third-party script. Without JavaScript
 * the form still posts to the same server action.
 */
export function NativeSignupForm({ placement, heading, description, button, footnote, layout = "stacked", headingId, preview = false, headingAs = "h2", afterSuccess, className }: Props) {
  const Heading = headingAs;
  const id = useId();
  const hid = headingId ?? `${id}-h`;
  const pathname = usePathname();
  const [state, formAction, pending] = useActionState<SignupState, FormData>(beehiivSignupAction, null);
  const [previewNote, setPreviewNote] = useState(false);
  const done = !!state?.ok;
  const succeeded = done && !!state?.outcome && (SUCCESS_OUTCOMES as readonly string[]).includes(state.outcome);
  const error = state?.error ?? null;
  const msgId = `${id}-msg`;
  const wide = layout === "wide";

  return (
    <section
      aria-labelledby={hid}
      data-testid="native-signup"
      data-placement={placement}
      className={cn("@container rounded-2xl bg-cream p-5 text-navy-900 shadow-lg ring-1 ring-navy-900/10 sm:p-6", wide && "sm:p-8", className)}
    >
      <div className={cn(wide && "@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:items-center @3xl:gap-8")}>
        <div className="min-w-0">
          <Heading id={hid} className={cn("font-display font-bold leading-snug text-navy-900 text-balance", headingAs === "h1" ? "text-2xl sm:text-3xl" : wide ? "text-2xl @3xl:text-3xl" : "text-xl")}>{heading}</Heading>
          <p className={cn("mt-1.5 text-navy-900", wide ? "text-base" : "text-sm")}>{description}</p>
        </div>

        <div className={cn("min-w-0", wide ? "mt-5 @3xl:mt-0" : "mt-4")}>
          {done ? (
            <div role="status" aria-live="polite" data-testid="native-signup-message" data-outcome={state?.outcome}
              className="flex items-start gap-2.5 rounded-xl bg-white p-4 text-sm font-medium text-navy-900 ring-1 ring-hillside-200">
              {succeeded
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-hillside-600" aria-hidden />
                : <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-hillside-600" aria-hidden />}
              <p>{state?.message}</p>
            </div>
          ) : (
            <form
              action={formAction}
              data-testid="native-signup-form"
              className="relative"
              onSubmit={preview ? (e) => { e.preventDefault(); setPreviewNote(true); } : undefined}
            >
              {/* Honeypot: hidden from people and assistive tech. */}
              <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor={`${id}-website`}>Website</label>
                <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
              </div>
              <input type="hidden" name="placement" value={placement} />
              <input type="hidden" name="page" value={pathname || "/"} />

              <label htmlFor={`${id}-email`} className="mb-1.5 block font-display text-sm font-bold text-navy-900">{SIGNUP_FIELD_LABEL}</label>
              <div className="flex flex-col gap-2 @sm:flex-row">
                <input
                  id={`${id}-email`}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  maxLength={254}
                  defaultValue={state?.email ?? ""}
                  aria-invalid={!!state?.fieldErrors?.email || undefined}
                  aria-describedby={error ? msgId : undefined}
                  className="block min-h-11 w-full min-w-0 flex-1 rounded-lg border border-navy-900/25 bg-white px-3 py-2.5 text-base text-navy-900 shadow-sm placeholder:text-slate-500 focus:border-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sunset-500 focus-visible:ring-offset-1 focus-visible:ring-offset-cream"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="btn-accent min-h-11 w-full shrink-0 px-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-900 @sm:w-auto"
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {button}
                </button>
              </div>
              <div aria-live="polite" role="status" className="empty:hidden">
                {error && <p id={msgId} data-testid="native-signup-error" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
                {previewNote && <p className="mt-2 text-sm text-navy-900">Preview only — nothing was sent. Use &ldquo;Send a test signup&rdquo; to try a real address.</p>}
              </div>
            </form>
          )}
          <p className="mt-3 text-xs text-navy-900">{footnote} <PrivacyPolicyLink hash="newsletter" /></p>
          {succeeded && afterSuccess}
        </div>
      </div>
    </section>
  );
}

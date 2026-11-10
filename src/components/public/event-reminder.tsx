"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BellRing, Check, Loader2 } from "lucide-react";
import { enableSavedEventRemindersAction } from "@/app/(site)/account/actions";
import { SAVED_CHANGE_SIGNAL, loginHref, registerHref } from "@/lib/resident-accounts";

/**
 * Small "reminder the day before" note under an upcoming event's actions.
 * - Guests: reminders need a free account (Create free account / Sign in, source=event).
 * - Members who saved the event: one click turns on the existing "Saved event reminders"
 *   email update (explicit consent; never on by default).
 * - Members who haven't saved it: nothing, unless reminders are on ("Save this event…").
 */
export function EventReminder({ eventId, eventPath, signedIn, initialSaved, remindersOn, verified }: {
  eventId: string; eventPath: string; signedIn: boolean; initialSaved: boolean; remindersOn: boolean; verified: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [on, setOn] = useState(remindersOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ type: string; targetId: string; saved: boolean }>).detail;
      if (d && d.type === "EVENT" && d.targetId === eventId) setSaved(d.saved);
    };
    window.addEventListener(SAVED_CHANGE_SIGNAL, onSaved);
    return () => window.removeEventListener(SAVED_CHANGE_SIGNAL, onSaved);
  }, [eventId]);

  if (!signedIn) {
    return (
      <p className="mt-3 flex items-start gap-2 text-sm text-slate-600" data-testid="event-reminder-guest">
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
        <span>
          Want an email reminder the day before? Reminders need a free account.{" "}
          <Link href={registerHref("event", eventPath)} className="font-semibold text-brand-700 hover:underline">Create free account</Link>{" "}
          or <Link href={loginHref(eventPath, "event")} className="font-semibold text-brand-700 hover:underline">sign in</Link>.
        </span>
      </p>
    );
  }

  const unverified = !verified ? (
    <> Confirm your email address first to receive it. <Link href="/account/profile/" className="font-semibold text-brand-700 hover:underline">Send a new link</Link>.</>
  ) : null;

  if (on) {
    return (
      <p className="mt-3 flex items-start gap-2 text-sm text-slate-600" data-testid={saved ? "event-reminder-on" : "event-reminder-save-first"}>
        <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-hillside-600" aria-hidden />
        <span>
          {saved ? "You’ll get an email reminder the day before." : "Save this event to get an email reminder the day before."}
          {unverified}{" "}
          <Link href="/account/notifications/" className="font-semibold text-brand-700 hover:underline">Email preferences</Link>
        </span>
      </p>
    );
  }
  if (!saved) return null;
  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200" data-testid="event-reminder-offer">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const r = await enableSavedEventRemindersAction();
          if (r.ok) setOn(true);
          else setError(r.error ?? "Couldn't turn on reminders. Try again.");
        })}
        className="btn-secondary btn-sm min-h-11"
        data-testid="event-reminder-enable"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Get a reminder the day before
      </button>
      <p className="mt-2 text-xs text-slate-500">
        Turns on <strong>Saved event reminders</strong>: one email the day before any event you save. Turn it off any time in{" "}
        <Link href="/account/notifications/" className="font-semibold text-brand-700 hover:underline">email preferences</Link>.
      </p>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

import Link from "next/link";
import { CheckCircle2, Clock, MailX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { findMemberSubscriber } from "@/lib/newsletter/subscribers";
import { FREQUENCY_NOTE, NEWSLETTER_NAME, readPreferences, SIGNUP_DESCRIPTION } from "@/lib/newsletter/copy";
import { formatDate } from "@/lib/utils";
import { AccountSubscribeForm, PreferencesForm, UnsubscribeForm } from "@/components/newsletter/token-forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter", robots: { index: false } };

export default async function AccountNewsletterPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const sub = await findMemberSubscriber(user);
  const active = sub?.status === "ACTIVE";
  const pending = sub?.status === "PENDING";

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-navy-900">The {NEWSLETTER_NAME}</h2>
        <p className="mt-1 text-sm text-slate-600">{SIGNUP_DESCRIPTION} {FREQUENCY_NOTE}</p>

        <div className="mt-4">
          {active ? (
            <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <span>You&rsquo;re subscribed with <strong>{sub!.email}</strong>{sub!.confirmedAt && <> since {formatDate(sub!.confirmedAt)}</>}.</span>
            </p>
          ) : pending ? (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>Almost there — check <strong>{sub!.email}</strong> for a confirmation link. You can request a new one below.</span>
            </p>
          ) : sub ? (
            <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
              <MailX className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              <span>You&rsquo;re not subscribed{sub.unsubscribedAt && <> (unsubscribed {formatDate(sub.unsubscribedAt)})</>}.</span>
            </p>
          ) : (
            <p className="text-sm text-slate-700">You&rsquo;re not subscribed. Creating an account or turning on app alerts never signs you up for email.</p>
          )}
        </div>

        {!active && <div className="mt-5"><AccountSubscribeForm email={user.email} /></div>}
      </section>

      {active && (
        <>
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-navy-900">Topics</h2>
            <p className="mt-1 text-sm text-slate-600">Tell us what you&rsquo;d like to see most.</p>
            <div className="mt-4"><PreferencesForm prefs={readPreferences(sub!.preferences)} /></div>
          </section>
          <section className="card p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-navy-900">Unsubscribe</h2>
            <p className="mt-1 text-sm text-slate-600">Stop receiving the {NEWSLETTER_NAME}. Your account and saved items aren&rsquo;t affected.</p>
            <div className="mt-4"><UnsubscribeForm /></div>
          </section>
        </>
      )}

      <p className="text-sm text-slate-600">
        Email newsletter and app notifications are separate — manage push alerts under <Link href="/account/notifications/" className="font-semibold text-brand-700 hover:underline">Alerts</Link>. <Link href="/newsletter/#privacy" className="font-semibold text-brand-700 hover:underline">How we use your email</Link>
      </p>
    </div>
  );
}

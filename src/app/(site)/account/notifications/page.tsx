import { getCurrentUser } from "@/lib/auth";
import { NOTIFICATION_CATEGORIES, PLANNED_EMAIL_UPDATES, readNotificationPrefs } from "@/lib/notification-categories";
import { ActionForm } from "@/components/account/action-form";
import { PushToggle } from "@/components/account/push-toggle";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveNotificationPrefsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const prefs = readNotificationPrefs(user.notificationPrefs);
  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-navy-900">What would you like to hear about?</h2>
        <p className="mt-1 text-sm text-slate-600">We only send what you choose here. We never send advertising you didn&apos;t ask for.</p>
        <ActionForm action={saveNotificationPrefsAction} className="mt-4 space-y-4">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {NOTIFICATION_CATEGORIES.map((c) => (
              <li key={c.key}>
                <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-navy-900">{c.label}</span>
                    <span className="block text-xs text-slate-500">{c.help}</span>
                  </span>
                  <input type="checkbox" name={c.key} defaultChecked={prefs.categories[c.key]} className="peer sr-only" />
                  <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand-600 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2" />
                </label>
              </li>
            ))}
          </ul>
          <div data-testid="planned-email-updates">
            <h3 className="text-base font-semibold text-navy-900">Planned email updates</h3>
            <p className="mt-1 text-xs text-slate-500">These emails aren&apos;t being sent yet. Opt in now and they&apos;ll start once each one is available. They&apos;re always off unless you turn them on, and every email will have an unsubscribe link.</p>
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {PLANNED_EMAIL_UPDATES.map((c) => (
                <li key={c.key}>
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3">
                    <input type="checkbox" name={`planned_${c.key}`} defaultChecked={prefs.planned[c.key]} className="mt-1 h-5 w-5 shrink-0 accent-brand-600" />
                    <span>
                      <span className="block text-sm font-semibold text-navy-900">{c.label}</span>
                      <span className="block text-xs text-slate-500">{c.help}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Saving…">Save preferences</SubmitButton>
        </ActionForm>
      </section>
      <PushToggle />
    </div>
  );
}

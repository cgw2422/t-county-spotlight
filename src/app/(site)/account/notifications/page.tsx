import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { NOTIFICATION_CATEGORIES, EMAIL_UPDATES, readNotificationPrefs } from "@/lib/notification-categories";
import { memberCommunities } from "@/lib/notifications/run";
import { ActionForm } from "@/components/account/action-form";
import { PushToggle } from "@/components/account/push-toggle";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveNotificationPrefsAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) return null;
  const prefs = readNotificationPrefs(user.notificationPrefs);
  const hasCommunities = memberCommunities(user).length > 0;
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
          <div data-testid="email-updates">
            <h3 className="text-base font-semibold text-navy-900">Email updates</h3>
            <p className="mt-1 text-xs text-slate-500">Short emails to {user.email}, only if you turn them on. Each one has a one-click link to turn it off, and they never include ads or sponsored listings. App alerts below are separate and optional.</p>
            {!user.emailVerifiedAt && (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">Please confirm your email address first — we only send these to confirmed addresses.</p>
            )}
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {EMAIL_UPDATES.map((c) => (
                <li key={c.key}>
                  <label className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3">
                    <input type="checkbox" name={`planned_${c.key}`} defaultChecked={prefs.planned[c.key]} className="mt-1 h-5 w-5 shrink-0 accent-brand-600" />
                    <span>
                      <span className="block text-sm font-semibold text-navy-900">{c.label}</span>
                      <span className="block text-xs text-slate-500">{c.help}</span>
                      {c.key === "new_in_my_communities" && !hasCommunities && (
                        <span className="mt-1 block text-xs font-medium text-amber-800" data-testid="needs-community">
                          Needs at least one community — pick yours on <Link href="/my-t-county/" className="underline">My T County</Link>. Until then this email isn&rsquo;t sent.
                        </span>
                      )}
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

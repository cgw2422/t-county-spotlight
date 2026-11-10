import type { Metadata } from "next";
import Link from "next/link";
import { MailX, XCircle } from "lucide-react";
import { AuthShell } from "@/components/account/auth-shell";
import { maskEmail } from "@/components/newsletter/mask";
import { emailUpdateLabel } from "@/lib/notification-categories";
import { findUnsubscribeTarget } from "@/lib/notifications/preferences";
import { TurnOffForm } from "./form";

export const metadata: Metadata = { title: "Turn off email updates", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Login-free target of the "Turn off …" link in member email updates
 * (lives outside the /account/ layout on purpose, so no sign-in is needed).
 * A signed token names one member and one update type; the button turns off
 * only that update. Nothing changes on a plain page view (link scanners).
 */
export default async function TurnOffEmailUpdatePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const target = await findUnsubscribeTarget(token);
  if (!target) {
    return (
      <AuthShell title="Link not recognized" subtitle="This unsubscribe link isn't valid. Use the link at the bottom of your most recent email, or sign in to manage your email updates.">
        <XCircle className="mx-auto mb-6 h-12 w-12 text-slate-400" aria-hidden />
        <Link href="/account/notifications/" className="btn-secondary w-full">Manage email updates</Link>
      </AuthShell>
    );
  }
  const label = emailUpdateLabel(target.kind);
  const manage = <>Want to change other emails? <Link href="/account/notifications/" className="font-semibold text-brand-700 hover:underline">Manage all email preferences</Link></>;
  if (!target.enabled) {
    return (
      <AuthShell title={`“${label}” is off`} subtitle={`${maskEmail(target.user.email)} won't receive these emails.`} footer={manage}>
        <MailX className="mx-auto mb-6 h-12 w-12 text-slate-400" aria-hidden />
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Turn off “${label}”?`} subtitle={`${maskEmail(target.user.email)} will stop getting these emails. Your other email choices stay the same.`} footer={manage}>
      <TurnOffForm token={token} label={label.toLowerCase()} />
    </AuthShell>
  );
}

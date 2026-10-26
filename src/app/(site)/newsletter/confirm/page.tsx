import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { confirmSubscription } from "@/lib/newsletter/subscribers";
import { NEWSLETTER_NAME } from "@/lib/newsletter/copy";
import { AuthShell } from "@/components/account/auth-shell";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const r = await confirmSubscription(typeof token === "string" ? token : null);

  if (r.status === "confirmed") {
    const prefs = `/newsletter/preferences/?token=${encodeURIComponent(r.unsubscribeToken)}`;
    return (
      <AuthShell title={`You're subscribed${r.firstName ? `, ${r.firstName}` : ""}!`} subtitle={`Thanks for confirming. Watch your inbox for the ${NEWSLETTER_NAME} — we just sent a welcome note.`}>
        <CheckCircle2 className="mx-auto mb-6 h-12 w-12 text-emerald-600" aria-hidden />
        <div className="grid gap-3">
          <Link href="/explore/" className="btn-primary w-full">Explore T-County</Link>
          <Link href={prefs} className="btn-secondary w-full">Choose your topics</Link>
        </div>
      </AuthShell>
    );
  }

  if (r.status === "expired") {
    return (
      <AuthShell title="This link has expired" subtitle="Confirmation links work for 48 hours. Enter your email below and we'll send a fresh one.">
        <Clock className="mx-auto mb-6 h-12 w-12 text-amber-500" aria-hidden />
        <NewsletterSignup source="newsletter_page" variant="compact" title="Send a new confirmation link" subtitle="We’ll email you a fresh link right away." />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Link invalid or already used" subtitle="This confirmation link isn't valid anymore. If you already confirmed, you're all set — there's nothing else to do.">
      <XCircle className="mx-auto mb-6 h-12 w-12 text-slate-400" aria-hidden />
      <NewsletterSignup source="newsletter_page" variant="compact" title="Not subscribed yet?" subtitle="Enter your email and we'll send a new confirmation link." />
    </AuthShell>
  );
}

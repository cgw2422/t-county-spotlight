import type { Metadata } from "next";
import Link from "next/link";
import { XCircle } from "lucide-react";
import { findByUnsubscribeToken } from "@/lib/newsletter/subscribers";
import { FREQUENCY_NOTE, NEWSLETTER_NAME, readPreferences } from "@/lib/newsletter/copy";
import { AuthShell } from "@/components/account/auth-shell";
import { PreferencesForm } from "@/components/newsletter/token-forms";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { maskEmail } from "@/components/newsletter/mask";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function PreferencesPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const sub = await findByUnsubscribeToken(typeof token === "string" ? token : null);
  if (!sub) {
    return (
      <AuthShell title="Link not recognized" subtitle="Use the preferences link at the bottom of your most recent email.">
        <XCircle className="mx-auto mb-6 h-12 w-12 text-slate-400" aria-hidden />
        <Link href="/" className="btn-secondary w-full">Go to the homepage</Link>
      </AuthShell>
    );
  }
  if (sub.status !== "ACTIVE") {
    return (
      <AuthShell title="Not currently subscribed" subtitle={`${maskEmail(sub.email)} isn't receiving the ${NEWSLETTER_NAME}${sub.status === "PENDING" ? " yet — check your inbox for the confirmation link" : ""}.`}>
        <NewsletterSignup source="newsletter_page" variant="compact" title="Subscribe" subtitle="We'll send a link to confirm your address." />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Email preferences" subtitle={<>For {maskEmail(sub.email)}. {FREQUENCY_NOTE}</>}
      footer={<>Don&rsquo;t want the newsletter? <Link href={`/newsletter/unsubscribe/?token=${encodeURIComponent(sub.unsubscribeToken)}`} className="font-semibold text-brand-700 hover:underline">Unsubscribe</Link></>}>
      <PreferencesForm token={sub.unsubscribeToken} prefs={readPreferences(sub.preferences)} firstName={sub.firstName} />
    </AuthShell>
  );
}

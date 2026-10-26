import type { Metadata } from "next";
import Link from "next/link";
import { MailX, XCircle } from "lucide-react";
import { findByUnsubscribeToken } from "@/lib/newsletter/subscribers";
import { NEWSLETTER_NAME } from "@/lib/newsletter/copy";
import { AuthShell } from "@/components/account/auth-shell";
import { UnsubscribeForm } from "@/components/newsletter/token-forms";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { maskEmail } from "@/components/newsletter/mask";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const sub = await findByUnsubscribeToken(typeof token === "string" ? token : null);
  if (!sub) {
    return (
      <AuthShell title="Link not recognized" subtitle="We couldn't find a subscription for this link. Use the unsubscribe link at the bottom of your most recent email.">
        <XCircle className="mx-auto mb-6 h-12 w-12 text-slate-400" aria-hidden />
        <Link href="/" className="btn-secondary w-full">Go to the homepage</Link>
      </AuthShell>
    );
  }
  if (sub.status !== "ACTIVE" && sub.status !== "PENDING") {
    return (
      <AuthShell title="You're unsubscribed" subtitle={`${maskEmail(sub.email)} won't receive the ${NEWSLETTER_NAME}.`}>
        <MailX className="mx-auto mb-6 h-12 w-12 text-slate-400" aria-hidden />
        <NewsletterSignup source="newsletter_page" variant="compact" title="Changed your mind?" subtitle="Subscribe again — we'll send a link to confirm." />
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Unsubscribe from the ${NEWSLETTER_NAME}?`} subtitle={`${maskEmail(sub.email)} will stop receiving the newsletter right away.`}
      footer={sub.status === "ACTIVE" ? <>Prefer fewer topics? <Link href={`/newsletter/preferences/?token=${encodeURIComponent(sub.unsubscribeToken)}`} className="font-semibold text-brand-700 hover:underline">Update your preferences</Link></> : undefined}>
      <UnsubscribeForm token={sub.unsubscribeToken} />
    </AuthShell>
  );
}

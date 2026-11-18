import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/account/auth-shell";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { theName } from "@/lib/newsletter/copy";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getNewsletterConfig();
  return { title: `Thanks for subscribing to ${theName(c.name)}`, robots: { index: false, follow: true } };
}

/** Where beehiiv's embedded form redirects after a signup (set the form's redirect URL to /newsletter/thanks/). */
export default async function NewsletterThanksPage() {
  const c = await getNewsletterConfig();
  return (
    <AuthShell title="Thanks for subscribing!" subtitle={`You're on the list for ${theName(c.name)}. Check your inbox — if you see a confirmation email, open it and tap the link to finish signing up.`}>
      <div data-testid="newsletter-thanks">
        <MailCheck className="mx-auto mb-6 h-12 w-12 text-emerald-600" aria-hidden />
        <p className="mb-6 text-center text-sm text-slate-600">Can&rsquo;t find it? Check your spam or promotions folder. Every issue has an unsubscribe link at the bottom.</p>
        <div className="grid gap-3">
          <Link href="/explore/" className="btn-primary w-full">Explore T County</Link>
          <Link href="/newsletter/#past-editions" className="btn-secondary w-full">Read past editions</Link>
          <Link href="/" className="btn-ghost w-full">Back to the homepage</Link>
        </div>
      </div>
    </AuthShell>
  );
}

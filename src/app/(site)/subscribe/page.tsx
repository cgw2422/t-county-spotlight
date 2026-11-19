import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, UserPlus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { SUBSCRIBE_PAGE, SUBSCRIBE_PATH } from "@/lib/newsletter/copy";
import { registerHref } from "@/lib/resident-accounts";
import { BRAND } from "@/lib/brand";
import { absoluteUrl } from "@/lib/utils";
import { buildMetadata } from "@/components/public/seo";
import { NativeSignupForm } from "@/components/newsletter/native-signup";
import { BuiltinNewsletterSignup } from "@/components/newsletter/builtin-signup";
import { signupAvailable } from "@/components/newsletter/newsletter-signup";

export const dynamic = "force-dynamic";

/**
 * /subscribe/ — public, shareable newsletter signup (e.g. posted on Facebook). No account, name, password or community.
 * The former /newsletter/subscribe/ permanently redirects here (next.config.ts); /newsletter/ stays the archive.
 * Which list it joins follows Admin → Newsletter → Settings → "Signup & sending provider" (the one source of truth):
 *   beehiiv  → our native form → beehiiv (single opt-in + welcome email, utm_campaign "subscribe_page")
 *   built-in → the built-in double opt-in form (email only on this page; source "subscribe_page")
 * After a success (subscribed / already subscribed, beehiiv mode) signed-out visitors are offered a free My T County
 * account (a plain link to /register/); nothing redirects and the email is never passed along. Nothing is sent from
 * our side: beehiiv sends the welcome email.
 * Share preview: ./share-image.png/route.tsx (1200×630) + the tags below.
 */
export async function generateMetadata(): Promise<Metadata> {
  const m = await buildMetadata({ title: SUBSCRIBE_PAGE.heading, description: SUBSCRIBE_PAGE.description, path: SUBSCRIBE_PATH, type: "website" });
  // Share image: ./share-image.png/route.tsx (1200×630, next/og), not the site default.
  const image = { url: absoluteUrl(`${SUBSCRIBE_PATH}share-image.png`), width: 1200, height: 630, type: "image/png", alt: `${SUBSCRIBE_PAGE.heading} — ${BRAND.name}` };
  return {
    ...m,
    openGraph: { type: "website", siteName: BRAND.name, title: SUBSCRIBE_PAGE.heading, description: SUBSCRIBE_PAGE.description, url: absoluteUrl(SUBSCRIBE_PATH), images: [image] },
    twitter: { card: "summary_large_image", title: SUBSCRIBE_PAGE.heading, description: SUBSCRIBE_PAGE.description, images: [image] },
    robots: { index: true, follow: true },
  };
}

/** On-page heading: "T County" never splits across lines (share tags keep the plain text). */
const HEADING = SUBSCRIBE_PAGE.heading.replace("T County", "T\u00a0County");

function AccountNextStep() {
  return (
    <div data-testid="subscribe-next-step" className="mt-5 rounded-xl bg-white p-4 ring-1 ring-navy-900/10 sm:p-5">
      <h2 className="font-display text-lg font-bold text-navy-900">{SUBSCRIBE_PAGE.nextHeading}</h2>
      <p className="mt-1 text-sm text-slate-700">{SUBSCRIBE_PAGE.nextText}</p>
      <Link href={registerHref("newsletter_subscribe")} className="btn-secondary mt-4 min-h-11 w-full border-navy-900/25 text-navy-900 sm:w-auto" data-testid="subscribe-next-register">
        <UserPlus className="h-4 w-4" aria-hidden /> {SUBSCRIBE_PAGE.nextButton}
      </Link>
    </div>
  );
}

export default async function SubscribePage() {
  const [c, user] = await Promise.all([getNewsletterConfig(), getCurrentUser()]);
  return (
    <div className="bg-gradient-to-b from-brand-50/70 to-white pb-12" data-testid="subscribe-page" data-provider={c.provider}>
      <div className="container-page max-w-2xl pt-4 sm:pt-12">
        {!signupAvailable(c) ? (
          <section aria-labelledby="subscribe-unavailable" className="rounded-2xl bg-cream p-6 ring-1 ring-navy-900/10">
            <h1 id="subscribe-unavailable" className="font-display text-2xl font-bold text-navy-900">{HEADING}</h1>
            <p className="mt-2 text-navy-900">{SUBSCRIBE_PAGE.description}</p>
            <p className="mt-4 text-sm text-slate-700" data-testid="subscribe-unavailable">Signups are paused for a moment. Please check back soon.</p>
          </section>
        ) : c.isBeehiiv ? (
          <NativeSignupForm
            placement="subscribe_page"
            headingAs="h1"
            heading={HEADING}
            description={SUBSCRIBE_PAGE.description}
            button={SUBSCRIBE_PAGE.button}
            footnote={SUBSCRIBE_PAGE.footnote}
            afterSuccess={user ? undefined : <AccountNextStep />}
          />
        ) : (
          <BuiltinNewsletterSignup source="subscribe_page" variant="card" emailOnly headingAs="h1" headline={HEADING} description={SUBSCRIBE_PAGE.description} name={c.navLabel} button={SUBSCRIBE_PAGE.button} />
        )}
        <p className="mt-5 text-center">
          <Link href="/newsletter/" className="inline-flex min-h-11 items-center gap-1.5 font-display text-sm font-bold text-brand-700 hover:underline" data-testid="subscribe-archive-link">
            {SUBSCRIBE_PAGE.archiveLink} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      </div>
    </div>
  );
}

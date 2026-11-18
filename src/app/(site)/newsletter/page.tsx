import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getNewsletterConfig, getNewsletterSettings } from "@/lib/newsletter/settings";
import { broadcastProvider } from "@/lib/newsletter/provider";
import { theName, TOPICS } from "@/lib/newsletter/copy";
import { buildMetadata, pageParam, type SearchParams } from "@/components/public/seo";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { IssueList } from "@/components/newsletter/issue-list";
import { Pagination } from "@/components/public/pagination";
import { getIssuePage } from "@/lib/newsletter/issues";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const [c, page] = await Promise.all([getNewsletterConfig(), searchParams.then(pageParam)]);
  return buildMetadata({
    title: page > 1 ? `${c.navLabel} — past editions, page ${page}` : c.navLabel,
    description: `Free weekly email: ${c.tagline}`,
    path: page > 1 ? `/newsletter/?page=${page}` : "/newsletter/",
  });
}

export default async function NewsletterPage({ searchParams }: { searchParams: SearchParams }) {
  const page = pageParam(await searchParams);
  const [s, ns, c, issues] = await Promise.all([getSettings(), getNewsletterSettings(), getNewsletterConfig(), getIssuePage(page)]);
  const provider = broadcastProvider();
  const contact = ns.replyTo || s.contactEmail;
  const FREQUENCY_NOTE = c.frequencyNote;
  const the = theName(c.name);
  return (
    <div className="pb-6">
      <div className="bg-gradient-to-b from-brand-50/70 to-white">
        <div className="container-page max-w-5xl pt-8 sm:pt-12">
          <NewsletterSignup source="newsletter_page" variant="card" eager />
        </div>
      </div>

      <div className="container-page max-w-3xl">
        {issues.total > 0 && (
          <section aria-labelledby="past-editions-title" className="mt-12 scroll-mt-24" id="past-editions" data-testid="past-editions">
            <h2 id="past-editions-title" className="section-title">Past editions</h2>
            <p className="mt-2 text-slate-600">Every issue of {the}, newest first.</p>
            <IssueList issues={issues.rows} className="mt-5" />
            <Pagination page={issues.page} totalPages={issues.totalPages} hrefFor={(p) => (p > 1 ? `/newsletter/?page=${p}#past-editions` : "/newsletter/#past-editions")} />
          </section>
        )}
        <section aria-labelledby="whats-inside" className="mt-12">
          <h2 id="whats-inside" className="section-title">What&rsquo;s inside</h2>
          <p className="mt-3 text-slate-700">{ns.description}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {TOPICS.map((t) => (
              <li key={t.key} className="card p-4">
                <span className="block font-semibold text-navy-900">{t.label}</span>
                <span className="text-sm text-slate-600">{t.help}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-600">{FREQUENCY_NOTE}</p>
        </section>

        <section id="privacy" aria-labelledby="privacy-title" className="mt-12 scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
          <h2 id="privacy-title" className="font-display text-2xl font-semibold text-navy-900">Your email &amp; privacy, in plain language</h2>
          <dl className="mt-5 space-y-5 text-slate-700">
            <div>
              <dt className="font-semibold text-navy-900">What we collect</dt>
              <dd className="mt-1">{c.isBeehiiv
                ? <>Your email address and anything else you choose to enter in the signup form, plus when you subscribed. The form is provided by our newsletter service, <strong>beehiiv</strong>, which stores your subscription — signing up doesn&rsquo;t create a {s.siteName} account.</>
                : <>Your email address, your first name if you choose to give it, where on the site you signed up (for example the homepage or an event page), and the date and time you agreed to receive the newsletter and confirmed your address. If you&rsquo;re signed in, we link the subscription to your account so you can manage it there.</>}</dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">Why we collect it</dt>
              <dd className="mt-1">Only to send you {the}: local events, community stories, business spotlights and things to do around Tuscarawas County. Some issues include <strong>promotional content from local businesses and sponsors</strong>; paid items are always labeled &ldquo;{s.sponsoredLabel}&rdquo;.</dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">How often</dt>
              <dd className="mt-1">{FREQUENCY_NOTE} We&rsquo;ll also send a one-time confirmation email when you sign up and a short welcome message.</dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">How it&rsquo;s sent</dt>
              <dd className="mt-1">{c.isBeehiiv
                ? <>We use the newsletter service <strong>beehiiv</strong> to manage subscriptions and send the newsletter. It processes your email address to deliver our messages and to tell us whether they were delivered, opened or bounced.</>
                : <>We use {provider === "resend" ? <>the email delivery service <strong>Resend</strong></> : "an email delivery service"} to send the newsletter. It processes your email address only to deliver our messages and to tell us whether they were delivered, opened or bounced.</>}</dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">What we never do</dt>
              <dd className="mt-1">We never sell, rent or trade our list. We don&rsquo;t sign you up automatically because you created an account, turned on app notifications, or own a listed business — you only get the newsletter if you ask for it and confirm your email.</dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">How to unsubscribe</dt>
              <dd className="mt-1">Every email has an &ldquo;Unsubscribe&rdquo; link at the bottom — one click, no login needed.{c.isBeehiiv ? <> The same footer has a link to update your email preferences.</> : <> Members can also manage it under <Link href="/account/newsletter/" className="font-semibold text-brand-700 hover:underline">My account → Newsletter</Link>.</>} Once you unsubscribe we keep your address on a do-not-email list so you aren&rsquo;t added again by mistake.</dd>
            </div>
            <div>
              <dt className="font-semibold text-navy-900">Questions</dt>
              <dd className="mt-1">{contact ? <>Email us at <a href={`mailto:${contact}`} className="font-semibold text-brand-700 hover:underline">{contact}</a>.</> : <>Reach us through the contact details at the bottom of any page.</>}{ns.postalAddress && <> Our mailing address: {ns.postalAddress}.</>}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

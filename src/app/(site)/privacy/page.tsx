import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { getNewsletterSettings } from "@/lib/newsletter/settings";
import { stripeConfigured } from "@/lib/stripe";
import { pushConfigured } from "@/lib/push";
import { isApiKeyConfigured as googlePlacesConfigured } from "@/lib/google-places";
import { PROSE_CLASSES } from "@/lib/prose";
import { PageHeader } from "@/components/public/page-header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What T County Connect collects when you visit, create an account, submit something, or subscribe to the newsletter — and how to reach us about it.",
  alternates: { canonical: "/privacy/" },
};
export const dynamic = "force-dynamic";

/** Publication date of this version of the policy. Update it whenever the wording below changes. */
const LAST_UPDATED = "November 20, 2026";
/** Monitored privacy contact; Admin → Settings → Contact email overrides it when set. */
const PRIVACY_CONTACT_FALLBACK = "info@tcountyconnect.com";

/**
 * Public Privacy Policy. Every statement reflects what the code does today; sections for optional features
 * (online payments, push alerts, Google reviews, the built-in newsletter) render only while that feature is on,
 * so the page never describes a provider that isn't in use.
 */
export default async function PrivacyPage() {
  const [settings, newsletter] = await Promise.all([getSettings(), getNewsletterSettings()]);
  const contact = settings.contactEmail?.trim() || PRIVACY_CONTACT_FALLBACK;
  const beehiiv = newsletter.provider === "beehiiv";
  const payments = settings.paymentsEnabled && stripeConfigured();
  const push = pushConfigured();
  const google = googlePlacesConfigured();
  const mail = <a href={`mailto:${contact}`} data-testid="privacy-contact">{contact}</a>;

  return (
    <>
      <PageHeader title="Privacy Policy" subtitle={`Last updated ${LAST_UPDATED}`} crumbs={[{ label: "Privacy Policy" }]} />
      <div className="container-page pb-16">
        <div className={`${PROSE_CLASSES} mx-auto max-w-3xl text-slate-800`} data-testid="privacy-policy">
          <p>
            T County Connect is a local directory and community publication serving Tuscarawas County, Ohio. This policy explains what
            information we collect when you visit, create an account, submit something, or subscribe to our newsletter, and how to reach us about it.
            We don&apos;t sell your information.
          </p>

          <h2 id="information-you-provide">Information you provide</h2>
          <p>We collect what you enter when you:</p>
          <ul>
            <li><strong>Create an account:</strong> your name, email address and password (stored only in scrambled, hashed form). If you use My T County, we also keep your chosen communities and interests, and the things you save or follow.</li>
            <li><strong>Apply for or claim a listing:</strong> your name and email, and the business or organization details you enter. If you need to sign in partway through an application, we hold what you&apos;ve typed (never your password) for up to 2 hours so you don&apos;t lose it.</li>
            <li><strong>Submit something:</strong> an event, a garage sale, a suggestion, a pledge or a volunteer sign-up, including any photos you upload.</li>
            <li><strong>Recommend a business</strong> or <strong>subscribe to the newsletter</strong>.</li>
          </ul>
          <p>We use this information to run the site, review submissions, manage accounts and listings, send the emails you ask for, and respond to you.</p>

          <h2 id="public">What becomes public</h2>
          <p>Once our team approves a listing or submission, some of it is shown on the site:</p>
          <ul>
            <li><strong>Business listings:</strong> the business name, phone, website, address, town, category, description, hours and photos. The applicant&apos;s name and email stay private. An email address appears on the listing only if the owner chooses to show one.</li>
            <li><strong>Nonprofit and church listings:</strong> the organization&apos;s name, description, phone, website and town. The organization email is shown unless you hide it in your organization settings. The EIN (tax ID) is used only to verify the organization and is never shown publicly.</li>
            <li><strong>Events:</strong> the event details, including the venue, address and organizer. Your email stays private.</li>
            <li><strong>Garage sales:</strong> the sale details, with either the exact address or only the general area, whichever you choose. Your name and email stay private.</li>
            <li><strong>Suggestions (&ldquo;Share something&rdquo;):</strong> these aren&apos;t published as submitted. Our team may use the details to create a listing or post. Your name and email stay private.</li>
            <li><strong>Pledges and volunteer sign-ups:</strong> not shown publicly. Your name, email, phone and message are sent to the organization you&apos;re helping.</li>
            <li><strong>Business recommendations:</strong> only the total number of recommendations is shown. Business owners see the count, not who recommended them. Our staff can see who made a recommendation, to keep recommendations genuine.</li>
          </ul>

          <h2 id="newsletter">Newsletter</h2>
          {beehiiv ? (
            <p>
              If you choose to subscribe, we use beehiiv to manage subscriptions and send the newsletter. When you sign up on our site, we send beehiiv your
              email address and the page you signed up from. beehiiv handles your subscription under its own{" "}
              <a href="https://www.beehiiv.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.
            </p>
          ) : (
            <p>
              If you choose to subscribe, we keep your email address, the communities you pick, and the date and wording of the consent you gave. We send
              the newsletter through our email delivery provider, which tells us whether newsletter emails were opened or links were clicked.
            </p>
          )}
          <p>
            You can unsubscribe using the link in any newsletter email. Unsubscribing doesn&apos;t close your site account or stop essential account messages,
            such as password resets. Deleting your site account doesn&apos;t unsubscribe you from the newsletter, so unsubscribe separately if you want both.
          </p>

          <h2 id="usage">Cookies and site usage</h2>
          <ul>
            <li><strong>Cookies:</strong> a sign-in cookie that keeps you signed in for up to 30 days, and cookies that remember the community you picked (for up to a year). We don&apos;t use advertising cookies.</li>
            <li><strong>Storage in your browser:</strong> items you save before signing in, your preferences, and whether you&apos;ve seen tips such as the &ldquo;add to home screen&rdquo; prompt.</li>
            <li><strong>Sign-in records:</strong> when you sign in, we record the IP address and browser of that session to help keep your account secure. Sessions expire after 30 days.</li>
            <li>
              <strong>Usage counts:</strong> we count things like page visits, saves, and taps on a business&apos;s website, phone or directions links, using our own
              system. We don&apos;t use third-party analytics or advertising trackers. These counts aren&apos;t linked to your account. To count distinct visitors each
              day, we store a one-way code made from your IP address, browser and the date, not your IP address itself. If your browser sends Global Privacy
              Control or Do Not Track, we don&apos;t record these counts.
            </li>
            <li><strong>Preventing abuse:</strong> we use IP addresses briefly to limit repeated sign-in attempts and form submissions, and we keep a one-way code of the IP address with each business recommendation.</li>
          </ul>

          <h2 id="service-providers">Service providers and other services</h2>
          <p>
            We use service providers to host the site and its database, store uploaded photos, and deliver email. They handle information only to provide
            those services to us.
            {payments && <> If you buy an optional business membership, Stripe processes the payment. We never receive or store your card number.</>}
          </p>
          {push && (
            <p>
              If you turn on alerts, your browser&apos;s push service delivers them. We store the subscription details your browser provides and your alert
              choices. You can turn alerts off in your account or your browser settings.
            </p>
          )}
          <p>
            Some articles include videos from YouTube or Vimeo
            {google ? ", and some business pages show Google reviews with reviewer photos loaded from Google" : ""}. When those load, your browser connects to
            those services, which have their own privacy policies.
          </p>

          <h2 id="retention">Keeping and deleting information</h2>
          <p>
            We keep information as long as we need it to run the site, manage accounts, listings and subscriptions, and meet legal or recordkeeping
            obligations. Sign-in sessions expire after 30 days.
          </p>
          <p>
            You can delete your account yourself from <Link href="/account/profile/">Account → Profile → Delete account</Link>. This removes your account,
            saved items, follows, alert settings and recommendations. It doesn&apos;t remove published listings or posts, details you gave with other
            submissions (such as a garage sale or a volunteer sign-up), or your newsletter subscription. Email us if you&apos;d like those removed too.
            Some records may need to be kept for security, billing or legal reasons.
          </p>

          <h2 id="requests">Your requests</h2>
          <p>
            You can ask us what information we have about you, ask us to correct it, or ask us to delete it. Email {mail} and tell us which email address
            you used on the site.
          </p>

          <h2 id="contact">Contact</h2>
          <p>For privacy questions or requests, email {mail}.</p>
          <p>If we change this policy, we&apos;ll update this page and the date at the top.</p>
        </div>
      </div>
    </>
  );
}

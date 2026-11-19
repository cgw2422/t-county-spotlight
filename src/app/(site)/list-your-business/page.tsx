import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { loadApplicationDraft, signInToApplicationHref } from "@/lib/application-flow";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { registerNewsletterNote, verifyRegisterNewsletterToken } from "@/lib/newsletter/register-flash";
import { APPLICATION_NEWSLETTER_FAILED, SUBSCRIBE_PATH } from "@/lib/newsletter/copy";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata, param, type SearchParams } from "@/components/public/seo";
import { ApplicationForm, type ApplicationDefaults } from "./form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "List Your Business",
    description: "Add your Tuscarawas County business to the T County Connect directory — free listing, events, specials and more.",
    path: "/list-your-business/",
  });
}

function ContactLine({ contactEmail }: { contactEmail: string }) {
  return contactEmail
    ? <>If you need access, contact <a className="font-semibold underline" href={`mailto:${contactEmail}`}>T County Connect</a>.</>
    : <>If you need access, contact T County Connect.</>;
}

/** Shown after submitting (only to the account the application belongs to). */
async function Confirmation({ appId, userId, accountNew, dup, nlToken }: { appId: string; userId: string; accountNew: boolean; dup: boolean; nlToken: string }) {
  const app = await db.businessApplication.findFirst({ where: { id: appId, userId }, select: { id: true, businessName: true, email: true, data: true, businessId: true, status: true } });
  if (!app) return null;
  const nlResult = verifyRegisterNewsletterToken(nlToken, userId);
  const note = nlResult ? registerNewsletterNote(nlResult) : null;
  const claim = !!(app.data && typeof app.data === "object" && !Array.isArray(app.data) && (app.data as Record<string, unknown>).claim);
  return (
    <div role="status" className="card p-6 text-center sm:p-8" data-testid="lyb-confirmation">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden />
      <h2 className="mt-4 font-display text-2xl font-semibold text-navy-900">{dup ? "We already have your request" : claim ? "Claim request received" : "Application received"}</h2>
      <p className="mx-auto mt-2 max-w-md text-slate-600">
        Thanks! Your request for <strong>{app.businessName}</strong> is under review. Our team will reach out at {app.email} within a few business days.
      </p>
      {accountNew && (
        <p className="mx-auto mt-3 max-w-md rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" data-testid="lyb-confirmation-account">
          Your free T County Connect account is ready and you&rsquo;re signed in. We sent a link to confirm your email address.
        </p>
      )}
      <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">You can use your T County Connect account now. You&rsquo;ll be able to manage the listing once your request is approved.</p>
      {note && (
        <p data-testid="lyb-confirmation-newsletter" data-tone={note.tone}
          className={note.tone === "problem" ? "mx-auto mt-3 max-w-md rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" : note.tone === "success" ? "mx-auto mt-3 max-w-md text-sm font-medium text-hillside-700" : "mx-auto mt-3 max-w-md text-sm text-slate-600"}>
          {nlResult === "failed" ? <>{APPLICATION_NEWSLETTER_FAILED} <Link href={SUBSCRIBE_PATH} className="font-semibold underline underline-offset-2">our newsletter signup page</Link>.</> : note.text}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/my-t-county/" className="btn-primary">Go to My T County</Link>
        <Link href="/businesses/" className="btn-secondary">Browse the directory</Link>
      </div>
    </div>
  );
}

export default async function ListYourBusinessPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const claimSlug = param(sp, "claim");
  const draftToken = param(sp, "draft") || undefined;
  const submitted = param(sp, "submitted");
  const [user, categories, claim, cmsPage, settings, nl, draft] = await Promise.all([
    getCurrentUser(),
    db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    claimSlug ? db.business.findFirst({ where: { slug: claimSlug, status: "PUBLISHED", deletedAt: null }, select: { slug: true, name: true, _count: { select: { owners: { where: { role: "OWNER" } } } } } }) : null,
    // A migrated WordPress page at this URL provides the intro copy.
    db.page.findFirst({ where: { status: "PUBLISHED", deletedAt: null, OR: [{ slug: "list-your-business" }, { legacyPath: "/list-your-business/" }] }, select: { content: true } }),
    getSettings(),
    getNewsletterConfig(),
    loadApplicationDraft(draftToken),
  ]);
  const claimed = !!claim && claim._count.owners > 0;
  const perks = ["A free profile with hours, photos and contact info", "Your events on the county calendar", "Specials and announcements (with membership)", "Consideration for an editorial spotlight"];
  // Prefill: a saved draft (after "sign in to continue"), then the account's own name/email.
  const fromDraft = (draft ?? {}) as ApplicationDefaults;
  const defaults: ApplicationDefaults = {
    ...fromDraft,
    businessName: fromDraft.businessName || claim?.name,
    email: user?.email ?? fromDraft.email,
    contactName: user ? (fromDraft.contactName || user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined) : undefined,
  };
  const confirmation = submitted && user
    ? await Confirmation({ appId: submitted, userId: user.id, accountNew: param(sp, "account") === "new", dup: param(sp, "dup") === "1", nlToken: param(sp, "nl") })
    : null;

  return (
    <>
      <PageHeader
        eyebrow={claim ? "Claim your listing" : "Free listing"}
        title={claim ? `Claim ${claim.name}` : "List your business"}
        subtitle={claim ? (claimed ? "This listing is already managed by its owner." : "Tell us how you’re connected to this business and we’ll verify and connect it to your account.") : "Join the directory that helps Tuscarawas County residents find and support local."}
        crumbs={[{ label: "List your business" }]}
      />
      <div className="container-page py-8 sm:py-12">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_minmax(0,640px)]">
          <div className="lg:pt-2">
            {cmsPage?.content ? (
              <div className={`${PROSE_CLASSES} text-slate-800`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(cmsPage.content) }} />
            ) : (
              <>
                <h2 className="section-title">Why list with us?</h2>
                <p className="mt-3 text-slate-600">T County Connect celebrates the people and businesses of Tuscarawas County. A listing helps neighbors discover you.</p>
              </>
            )}
            <ul className="mt-6 space-y-3">
              {perks.map((p) => <li key={p} className="flex gap-3 text-slate-700"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />{p}</li>)}
            </ul>
            <p className="mt-6 flex gap-2 text-sm text-slate-500"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Every application is reviewed by a real person. We&rsquo;ll reach out within a few business days.</p>
          </div>
          <div className="relative">
            {confirmation ?? (claimed ? (
              <div className="card p-6 sm:p-8" data-testid="lyb-claimed">
                <ShieldCheck className="h-10 w-10 text-hillside-600" aria-hidden />
                <h2 className="mt-3 font-display text-xl font-bold text-navy-900">This listing is already managed</h2>
                <p className="mt-2 text-slate-600">{claim!.name} already has an owner on T County Connect, so it can&rsquo;t be claimed. <ContactLine contactEmail={settings.contactEmail} /></p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={`/business/${claim!.slug}/`} className="btn-secondary">Back to the listing</Link>
                  <Link href="/list-your-business/" className="btn-ghost">List a different business</Link>
                </div>
              </div>
            ) : (
              <ApplicationForm
                key={user ? "in" : "out"}
                categories={categories.map((c) => c.name)}
                cities={TUSCARAWAS_CITIES}
                defaults={defaults}
                claimSlug={claim?.slug}
                signedIn={!!user}
                signInHref={signInToApplicationHref({ claimSlug: claim?.slug, draft: draftToken })}
                startWithCreate={param(sp, "start") === "create"}
                draftToken={draft ? draftToken : undefined}
                newsletterMode={nl.isBeehiiv ? "beehiiv" : "builtin"}
                newsletterTagline={nl.tagline}
              />
            ))}
            {!confirmation && !claimed && user && (
              <p className="mt-3 text-xs text-slate-500" data-testid="lyb-signed-in-as">Signed in as {user.email}.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

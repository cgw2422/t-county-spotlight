import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, MailWarning, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { CLAIM_STATUS_BADGE, CLAIM_STATUS_LABEL, KIND_LABEL, claimHref, orgHref } from "@/lib/gives/constants";
import { loadPublicOrg } from "@/lib/gives/public";
import { PageHeader } from "@/components/public/page-header";
import { ActionForm } from "@/components/account/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ClaimForm } from "@/components/gives/claim-form";
import { resendVerificationAction } from "@/app/(site)/account/actions";
import { resendClaimVerificationAction, withdrawClaimAction } from "../actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ submitted?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await loadPublicOrg((await params).slug);
  return { title: o ? `Claim ${o.name}` : "Claim a listing", robots: { index: false, follow: false } };
}

export default async function ClaimListingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { submitted } = await searchParams;
  const o = await loadPublicOrg(slug);
  if (!o) notFound();
  const user = await getCurrentUser();
  const here = claimHref(o);
  const next = encodeURIComponent(here);
  const [member, claims] = user
    ? await Promise.all([
        db.organizationMember.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: o.id } }, select: { role: true } }),
        db.organizationClaim.findMany({ where: { organizationId: o.id, userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
      ])
    : [null, []];
  const pending = claims.find((c) => c.status === "PENDING");
  const last = claims[0];
  const claimed = o.ownershipStatus === "CLAIMED";

  let body: React.ReactNode;
  if (!user) {
    body = (
      <div className="card p-6 text-center sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-navy-900">Sign in to claim this listing</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">Your own TCountySpotlight account is what will manage {o.name}&apos;s page — sign in or create a free account, then come back here to send your request.</p>
        <div className="mx-auto mt-6 grid max-w-sm gap-3">
          <Link href={`/register/?next=${next}`} className="btn-primary min-h-12 text-base">Create a free account</Link>
          <Link href={`/login/?next=${next}`} className="btn-secondary min-h-12 text-base">Sign in</Link>
        </div>
      </div>
    );
  } else if (member) {
    body = (
      <div className="card p-6 sm:p-8">
        <p className="flex items-center gap-2 font-semibold text-navy-900"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> You already manage {o.name}.</p>
        <Link href={`/organization/${o.id}/`} className="btn-primary mt-4">Go to the organization dashboard</Link>
      </div>
    );
  } else if (pending) {
    body = (
      <div className="card space-y-4 p-6 sm:p-8">
        {submitted && <p role="status" className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Thanks — your request was sent to our team.</p>}
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-navy-900">Your request</h2><span className={CLAIM_STATUS_BADGE.PENDING}>Pending review</span></div>
        <p className="text-sm text-slate-600">Sent {formatDate(pending.createdAt)} as {pending.role}. Organization email: {pending.email}.</p>
        <h3 className="font-semibold text-navy-900">What happens next</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>{pending.emailVerifiedAt ? <>Your organization email is confirmed.</> : <>Check {pending.email} for a confirmation link (valid for 48 hours).</>}</li>
          <li>Our team checks your affiliation — for example by calling the organization&apos;s public phone number. This usually takes a few days.</li>
          <li>Once approved, you&apos;ll get an email and can manage the page from your organization dashboard. It&apos;s always free.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          {!pending.emailVerifiedAt && (
            <ActionForm action={resendClaimVerificationAction} className="space-y-2">
              <input type="hidden" name="claimId" value={pending.id} />
              <SubmitButton className="btn-secondary btn-sm" pendingText="Sending…">Resend confirmation link</SubmitButton>
            </ActionForm>
          )}
          <ActionForm action={withdrawClaimAction} className="space-y-2">
            <input type="hidden" name="claimId" value={pending.id} />
            <SubmitButton className="btn-ghost btn-sm text-red-700" pendingText="Withdrawing…">Withdraw request</SubmitButton>
          </ActionForm>
        </div>
      </div>
    );
  } else if (!user.emailVerifiedAt) {
    body = (
      <div className="card p-6 sm:p-8">
        <p className="flex items-start gap-2 font-semibold text-amber-900"><MailWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Please confirm your account email first</p>
        <p className="mt-2 text-sm text-slate-600">To protect organizations, only accounts with a confirmed email can request to manage a listing. We sent a link to {user.email}.</p>
        <ActionForm action={resendVerificationAction} className="mt-4 space-y-2">
          <SubmitButton className="btn-secondary btn-sm" pendingText="Sending…">Resend confirmation email</SubmitButton>
        </ActionForm>
      </div>
    );
  } else {
    body = (
      <div className="card p-5 sm:p-8">
        {last && last.status !== "PENDING" && (
          <p className="mb-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Your previous request ({formatDate(last.createdAt)}) was <span className={CLAIM_STATUS_BADGE[last.status]}>{CLAIM_STATUS_LABEL[last.status]}</span>{last.status === "REJECTED" && last.reviewNote ? <> — {last.reviewNote}</> : null}. You can send a new one.</p>
        )}
        {claimed && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">This listing is already managed.</p>
            <p className="mt-1">Contact the current managers through TCountySpotlight, or send a request to be added — our team reviews every request.</p>
          </div>
        )}
        <ClaimForm slug={o.slug} orgName={o.name} name={user.name ?? ""} requestOnly={claimed} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="T-County Gives · Always free"
        title={claimed ? `Request to manage ${o.name}` : `Claim ${o.name}`}
        subtitle={`${KIND_LABEL[o.kind]}${o.city ? ` · ${o.city}` : ""}`}
        crumbs={[{ label: "T-County Gives", href: "/gives/" }, { label: o.name, href: orgHref(o) }, { label: "Claim listing" }]}
      />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">{body}</div>
          <aside className="space-y-3 text-sm text-slate-600">
            <div className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
              <p>We confirm every request by hand before anyone can edit a listing. Personal email addresses alone aren&apos;t enough — an address at the organization&apos;s own domain or a call to its public phone number helps.</p>
            </div>
            <div className="flex gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <Clock className="h-5 w-5 shrink-0 text-sunset-600" aria-hidden />
              <p>Reviews usually take a few days. You can follow your request on your <Link href="/account/" className="font-semibold text-brand-700 hover:underline">account page</Link>.</p>
            </div>
            <p className="px-1"><Link href={orgHref(o)} className="font-semibold text-brand-700 hover:underline">← Back to {o.name}</Link></p>
          </aside>
        </div>
      </div>
    </>
  );
}

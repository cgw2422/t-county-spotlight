import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { claimHref } from "@/lib/gives/constants";
import { AuthShell } from "@/components/account/auth-shell";

export const metadata: Metadata = { title: "Confirm organization email", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Confirms the organization email on an ownership claim (link from the claim email). */
export default async function VerifyClaimEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const raw = typeof token === "string" && token.length >= 20 && token.length <= 100 ? token : null;
  const claim = raw
    ? await db.organizationClaim.findUnique({ where: { verifyTokenHash: hashToken(raw) }, include: { organization: { select: { name: true, slug: true } } } })
    : null;
  if (claim && claim.status === "PENDING" && claim.verifyExpiresAt && claim.verifyExpiresAt > new Date()) {
    const n = await db.organizationClaim.updateMany({ where: { id: claim.id, verifyTokenHash: claim.verifyTokenHash, status: "PENDING" }, data: { emailVerifiedAt: new Date(), verifyTokenHash: null, verifyExpiresAt: null } });
    if (n.count) await audit(claim.userId, "organization_claim.email_verified", "OrganizationClaim", claim.id, { organizationId: claim.organizationId });
    return (
      <AuthShell title="Email confirmed" subtitle={`Thanks! ${claim.email} is confirmed for your request to manage ${claim.organization.name}.`}>
        <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600" aria-hidden />
        <p className="mb-6 text-center text-sm text-slate-600">Our team still reviews every request before access is granted. We&apos;ll email you when it&apos;s decided.</p>
        <Link href={claimHref(claim.organization)} className="btn-primary w-full">View my request</Link>
      </AuthShell>
    );
  }
  const expired = !!claim && claim.status === "PENDING";
  return (
    <AuthShell title={expired ? "Link expired" : "Link not valid"} subtitle={expired ? "This confirmation link has expired. Sign in and resend it from your request." : "This confirmation link is invalid or has already been used."}>
      <XCircle className="mx-auto mb-6 h-12 w-12 text-red-500" aria-hidden />
      <Link href={claim ? claimHref(claim.organization) : "/account/"} className="btn-primary w-full">{claim ? "Go to my request" : "Go to my account"}</Link>
    </AuthShell>
  );
}

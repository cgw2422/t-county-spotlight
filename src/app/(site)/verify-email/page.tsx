import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { findValidToken } from "@/lib/tokens";
import { AuthShell } from "@/components/account/auth-shell";
import { recordServerSignal } from "@/lib/analytics";
import { parseRegisterSource } from "@/lib/resident-accounts";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const row = await findValidToken(token, "EMAIL_VERIFY");
  let verified = false;
  if (row) {
    await db.$transaction([
      db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
      db.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    verified = true;
    // First confirmation only: aggregate funnel signal (by the source recorded at registration) and
    // link a newsletter signup made with this same address to the account (status is unchanged).
    if (!row.user.emailVerifiedAt) {
      const reg = await db.auditLog.findFirst({ where: { action: "user.register", entityType: "User", entityId: row.userId }, select: { details: true } });
      const details = reg?.details && typeof reg.details === "object" && !Array.isArray(reg.details) ? (reg.details as Record<string, unknown>) : {};
      await recordServerSignal("email_verified", parseRegisterSource(details.source));
      const linked = await db.newsletterSubscriber.findUnique({ where: { userId: row.userId }, select: { id: true } });
      if (!linked) await db.newsletterSubscriber.updateMany({ where: { email: row.user.email.toLowerCase(), userId: null }, data: { userId: row.userId } }).catch(() => {});
    }
  }
  const user = await getCurrentUser();
  const alreadyVerified = !verified && user?.emailVerifiedAt;
  if (verified || alreadyVerified) {
    return (
      <AuthShell title="Email confirmed" subtitle="Thanks! Your email address is confirmed.">
        <CheckCircle2 className="mx-auto mb-6 h-12 w-12 text-emerald-600" aria-hidden />
        <Link href={user ? "/my-t-county/" : "/login/?next=%2Fmy-t-county%2F"} className="btn-primary w-full">{user ? "Go to My T County" : "Sign in"}</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Link expired" subtitle="This confirmation link is invalid, has already been used, or has expired.">
      <XCircle className="mx-auto mb-6 h-12 w-12 text-red-500" aria-hidden />
      {user ? (
        <Link href="/account/profile/" className="btn-primary w-full">Send a new link from my account</Link>
      ) : (
        <Link href="/login/?next=%2Faccount%2F" className="btn-primary w-full">Sign in to send a new link</Link>
      )}
    </AuthShell>
  );
}

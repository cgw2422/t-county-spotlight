import type { Metadata } from "next";
import Link from "next/link";
import { findValidToken } from "@/lib/tokens";
import { AuthShell } from "@/components/account/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = await findValidToken(token, "PASSWORD_RESET");
  if (!valid || !token) {
    return (
      <AuthShell title="Link expired" subtitle="This password reset link is invalid, has already been used, or has expired.">
        <Link href="/forgot-password/" className="btn-primary w-full">Request a new link</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password" subtitle={`For ${valid.user.email}. You'll be signed out on all other devices.`}>
      <ResetForm token={token} />
    </AuthShell>
  );
}

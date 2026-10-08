import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, safeNext } from "@/lib/tokens";
import { AuthShell } from "@/components/account/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; locked?: string; reset?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeForRole(user.role));
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to save businesses and events, follow your favorites, and manage your listing."
      footer={<>New here? <Link href={`/register/${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">Create a free account</Link></>}
    >
      {sp.locked && <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Too many incorrect codes. Please sign in again.</p>}
      <LoginForm next={next} />
    </AuthShell>
  );
}

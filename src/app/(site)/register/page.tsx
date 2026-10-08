import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeForRole, safeNext } from "@/lib/tokens";
import { AuthShell } from "@/components/account/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create a free account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; business?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next) ?? undefined;
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeForRole(user.role));
  return (
    <AuthShell
      title="Join TCountySpotlight"
      subtitle="Save places and events, follow local businesses, and get the best of Tuscarawas County."
      footer={<>Already have an account? <Link href={`/login/${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">Sign in</Link></>}
    >
      <RegisterForm next={next} business={sp.business === "1"} />
    </AuthShell>
  );
}

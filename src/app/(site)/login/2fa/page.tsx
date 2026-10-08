import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPending2faSession } from "@/lib/auth";
import { safeNext } from "@/lib/tokens";
import { AuthShell } from "@/components/account/auth-shell";
import { TwoFactorForm } from "./twofa-form";
import { cancel2faAction } from "../actions";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const pending = await getPending2faSession();
  if (!pending) redirect("/login/");
  return (
    <AuthShell title="Two-step verification" subtitle="Open your authenticator app and enter the 6-digit code for TCountySpotlight.">
      <TwoFactorForm next={safeNext(sp.next) ?? undefined} />
      <form action={cancel2faAction} className="mt-4 text-center">
        <button type="submit" className="text-sm font-medium text-slate-600 hover:underline">Cancel and sign in as someone else</button>
      </form>
    </AuthShell>
  );
}

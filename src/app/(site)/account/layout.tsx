import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, Heart, LayoutDashboard, MailWarning, Shield, Store, Bell } from "lucide-react";
import { getCurrentUser, getOwnedBusinesses, isStaff } from "@/lib/auth";
import { AccountTabs } from "@/components/account/account-tabs";
import { ActionForm } from "@/components/account/action-form";
import { LogoutButton } from "@/components/account/logout-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { OhioMark } from "@/components/site/logo";
import { resendVerificationAction } from "./actions";

export const metadata: Metadata = { title: "My account", robots: { index: false } };
export const dynamic = "force-dynamic";

function SignedOut() {
  const perks = [
    { icon: Bookmark, title: "Save favorites", text: "Keep businesses, events, specials and stories in one place." },
    { icon: Heart, title: "Follow local businesses", text: "See what's new from the places you love." },
    { icon: Bell, title: "Choose your alerts", text: "Weekend guides and event reminders — only if you want them." },
  ];
  return (
    <div className="bg-gradient-to-b from-brand-50/70 to-white">
      <div className="container-page max-w-lg py-10 text-center sm:py-16">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-800 text-white shadow"><OhioMark className="h-9 w-9" /></span>
        <h1 className="mt-5 font-display text-3xl font-semibold text-navy-900">Your T-County, saved</h1>
        <p className="mt-2 text-slate-600">Create a free account to keep track of what you love around Tuscarawas County.</p>
        <ul className="mt-8 space-y-3 text-left">
          {perks.map(({ icon: Icon, title, text }) => (
            <li key={title} className="card flex gap-4 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden /></span>
              <span><span className="block font-semibold text-navy-900">{title}</span><span className="text-sm text-slate-600">{text}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-8 grid gap-3">
          <Link href="/register/" className="btn-primary w-full">Create a free account</Link>
          <Link href="/login/?next=%2Faccount%2F" className="btn-secondary w-full">Sign in</Link>
        </div>
        <p className="mt-6 text-sm text-slate-600">Own a local business? <Link href="/list-your-business/" className="font-semibold text-brand-700 hover:underline">List it for free</Link></p>
      </div>
    </div>
  );
}

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return <SignedOut />;
  const businesses = await getOwnedBusinesses(user.id);
  const initials = (user.name || user.email).split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="container-page max-w-3xl pb-10 pt-6 sm:pt-10">
      <header className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-navy-800 text-lg font-bold text-white" aria-hidden>{initials}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-semibold text-navy-900 sm:text-3xl">{user.name || "My account"}</h1>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
        </div>
        <div className="hidden sm:block"><LogoutButton className="btn-ghost btn-sm" /></div>
      </header>

      {(businesses.length > 0 || isStaff(user)) && (
        <div className="mt-5 flex flex-wrap gap-2">
          {businesses.length > 0 && (
            <Link href="/dashboard/" className="btn-accent btn-sm"><Store className="h-4 w-4" aria-hidden /> {businesses.length === 1 ? `Manage ${businesses[0].name}` : "Business dashboard"}</Link>
          )}
          {isStaff(user) && <Link href="/admin/" className="btn-secondary btn-sm"><Shield className="h-4 w-4" aria-hidden /> Admin</Link>}
        </div>
      )}

      {!user.emailVerifiedAt && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span><strong>Please confirm your email.</strong> We sent a link to {user.email}. Confirming helps you recover your account.</span>
          </p>
          <ActionForm action={resendVerificationAction} className="mt-3 space-y-2">
            <SubmitButton className="btn-secondary btn-sm" pendingText="Sending…">Resend confirmation email</SubmitButton>
          </ActionForm>
        </div>
      )}

      <div className="mt-6"><AccountTabs /></div>
      <div className="mt-6">{children}</div>

      <div className="mt-10 flex flex-col items-center gap-3 border-t border-slate-200 pt-6 sm:hidden">
        <LogoutButton className="btn-secondary w-full" formClassName="w-full" />
        {businesses.length === 0 && !isStaff(user) && (
          <Link href="/list-your-business/" className="flex items-center gap-1 text-sm font-medium text-brand-700"><LayoutDashboard className="h-4 w-4" aria-hidden /> Own a business? List it for free</Link>
        )}
      </div>
    </div>
  );
}

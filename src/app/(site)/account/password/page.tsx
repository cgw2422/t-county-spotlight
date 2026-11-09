import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { changePasswordAction } from "../actions";

export const metadata: Metadata = { title: "Change password", robots: { index: false } };
export const dynamic = "force-dynamic";

/** /account/password/ — the layout swaps in the forced-change form when a temporary password is in use. */
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) return null;
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-navy-900">Change password</h2>
      <p className="mt-1 text-sm text-slate-600">Changing your password signs you out everywhere else.</p>
      <div className="mt-4">
        {user.passwordHash ? <ChangePasswordForm action={changePasswordAction} /> : (
          <p className="text-sm text-slate-600">Your account doesn&apos;t have a password yet. <Link href="/forgot-password/" className="font-semibold text-brand-700 hover:underline">Email me a link to set one</Link>.</p>
        )}
      </div>
    </section>
  );
}

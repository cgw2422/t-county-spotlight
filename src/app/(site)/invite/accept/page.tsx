import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/account/auth-shell";
import { ACCESS_ROLE_LABEL, findInvitation, fromDbRole, invitationListingRef, loadListing } from "@/lib/listing-access";
import { AcceptInvitationForm } from "./accept-form";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const COPY = {
  invalid: { title: "Invitation not found", text: "This invitation link isn't valid. Check that you opened the full link from your email." },
  expired: { title: "Invitation expired", text: "This invitation has expired. Invitations are valid for 7 days." },
  used: { title: "Invitation already used", text: "This invitation has already been accepted. Sign in with your email and password." },
  revoked: { title: "Invitation no longer valid", text: "This invitation was replaced by a newer one or withdrawn." },
} as const;

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const found = await findInvitation(token);
  if (found.state !== "valid" || !token) {
    const c = COPY[found.state === "valid" ? "invalid" : found.state];
    return (
      <AuthShell title={c.title} subtitle={c.text}>
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">Need access? Ask the person who invited you — or the T County Connect team — for a new invitation.</p>
          <Link href="/login/" className="btn-primary w-full">Sign in</Link>
          <Link href="/forgot-password/" className="btn-ghost w-full">Forgot your password?</Link>
        </div>
      </AuthShell>
    );
  }
  const inv = found.invitation;
  const ref = invitationListingRef(inv);
  const listing = ref ? await loadListing(ref) : null;
  const role = ref ? ACCESS_ROLE_LABEL[fromDbRole(ref.kind, inv.role)].toLowerCase() : "manager";
  const needsPassword = !inv.user.passwordHash;
  return (
    <AuthShell
      title="You're invited"
      subtitle={<>Join T County Connect as {/^[aeiou]/.test(role) ? "an" : "a"} {role}{listing ? <> of <strong className="text-navy-900">{listing.name}</strong></> : null}. {needsPassword ? "Choose a password to finish setting up your account." : "You already have an account — accept, then sign in with your existing password."}</>}
    >
      <AcceptInvitationForm token={token} email={inv.user.email} needsPassword={needsPassword} />
    </AuthShell>
  );
}

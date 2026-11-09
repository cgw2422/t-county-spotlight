"use server";
import { redirect } from "next/navigation";
import { clientIp, createSession, destroySession, hashPassword, passwordProblem } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { acceptInvitation, findInvitation, invitationListingRef, loadListing } from "@/lib/listing-access";
import type { ActionState } from "@/components/ui/form-message";

const EXPIRED = "This invitation link is no longer valid — it may have expired, been used already, or been replaced by a newer one. Please ask the person who invited you for a new invitation.";

export async function acceptInvitationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`invite-accept:${ip}`, 10, 15 * 60_000).ok) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");

  const found = await findInvitation(token);
  if (found.state !== "valid") return { error: EXPIRED };
  const inv = found.invitation;
  const needsPassword = !inv.user.passwordHash;
  if (needsPassword) {
    const problem = passwordProblem(password);
    if (problem) return { error: problem, fieldErrors: { password: problem } };
    if (password !== confirm) return { error: "The two passwords don't match.", fieldErrors: { confirm: "Passwords don't match." } };
  }
  const result = await acceptInvitation(inv.id, needsPassword ? await hashPassword(password) : null).catch(() => null);
  if (!result) return { error: EXPIRED };
  const ref = invitationListingRef(inv);
  const listing = ref ? await loadListing(ref) : null;
  await audit(result.user.id, "invitation.accept", "AccountInvitation", inv.id, { email: result.user.email, listing: listing?.name ?? null, kind: ref?.kind ?? null, listingId: ref?.id ?? null, passwordSet: needsPassword });

  if (!needsPassword) {
    // Existing password is never changed by an invitation: just sign in normally.
    redirect(`/login/?next=${encodeURIComponent(listing?.dashboardPath ?? "/dashboard/")}`);
  }
  await destroySession();
  if (result.user.totpEnabled && result.user.totpSecret) {
    await createSession(result.user.id, { needs2fa: true });
    redirect(`/login/2fa/?next=${encodeURIComponent(listing?.dashboardPath ?? "/dashboard/")}`);
  }
  await createSession(result.user.id);
  redirect(`${listing?.dashboardPath ?? (ref?.kind === "organization" ? "/organization/" : "/dashboard/")}?welcome=1`);
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, passwordProblem, requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { createUserToken } from "@/lib/tokens";
import { absoluteUrl } from "@/lib/utils";
import { oneLine } from "@/lib/text";
import { BRAND } from "@/lib/brand";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { soleOwnershipBlocks } from "@/lib/sole-ownership";
import { SoleOwnerError, softDeleteAccount } from "@/lib/account-deletion";
import { getMembership, grantExistingUser, loadListing, removeListingAccess } from "@/lib/listing-access";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, parseForm, zOpt } from "../_lib/form";

const ROLES = ["ADMIN", "EDITOR", "BUSINESS_OWNER", "MEMBER"] as const;

async function otherActiveAdmins(excludeId: string) {
  return db.user.count({ where: { role: "ADMIN", status: "ACTIVE", NOT: { id: excludeId } } });
}

export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = parseForm(z.object({ id: z.string().min(1), role: z.enum(ROLES), name: zOpt(120) }), fd);
  if (p.error) return p.error;
  const u = await db.user.findUnique({ where: { id: p.data.id } });
  if (!u) return { error: "User not found." };
  if (u.role !== p.data.role) {
    if (u.id === me.id) return { error: "You can't change your own role. Ask another administrator." };
    if (u.role === "ADMIN" && (await otherActiveAdmins(u.id)) === 0) return { error: "This is the last active administrator. Promote someone else first." };
  }
  await db.user.update({ where: { id: u.id }, data: { role: p.data.role, name: p.data.name } });
  if (u.role !== p.data.role) {
    // Role change: end existing sessions so permissions apply immediately.
    if (u.id !== me.id) await db.session.deleteMany({ where: { userId: u.id } });
    await audit(me.id, "user.role", "User", u.id, { email: u.email, from: u.role, to: p.data.role });
  } else {
    await audit(me.id, "user.update", "User", u.id, { email: u.email });
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${u.id}`);
  return { ok: true, message: u.role !== p.data.role ? `Role changed to ${p.data.role.replace("_", " ").toLowerCase()}.` : "User saved." };
}

/**
 * Block / Unblock (status SUSPENDED ↔ ACTIVE). Blocking signs the person out everywhere (every session row is
 * deleted, and session lookups / sign-in / reset links already refuse non-ACTIVE accounts), and approvals can't
 * grant ownership to a blocked account. Their account, listing links and data stay, so unblocking restores
 * everything as it was: same password, nothing re-approved. No newsletter (beehiiv) calls.
 */
export async function setUserStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(["ACTIVE", "SUSPENDED"]) }), fd);
  if (p.error) return p.error;
  const u = await db.user.findUnique({ where: { id: p.data.id } });
  if (!u) return { error: "User not found." };
  if (u.status === "DELETED") return { error: "This account was deleted and can't be blocked or unblocked." };
  if (u.status === p.data.status) return { ok: true, message: p.data.status === "SUSPENDED" ? "This account is already blocked." : "This account is already active." };
  if (p.data.status === "SUSPENDED") {
    if (u.id === me.id) return { error: "You can't block your own account." };
    if (u.role === "ADMIN" && (await otherActiveAdmins(u.id)) === 0) return { error: "You can't block the last active administrator." };
  }
  const blocking = p.data.status === "SUSPENDED";
  const [, sessions] = await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { status: p.data.status } }),
    // Blocking: every session ends now (an open browser is signed out on its next request).
    ...(blocking ? [db.session.deleteMany({ where: { userId: u.id } })] : []),
  ]);
  await audit(me.id, blocking ? "user.block" : "user.unblock", "User", u.id, { email: u.email, ...(blocking ? { sessionsRevoked: (sessions as { count: number }).count } : {}) });
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${u.id}`);
  return { ok: true, message: p.data.status === "SUSPENDED" ? "User blocked and signed out everywhere." : "User unblocked. They can sign in with their existing password." };
}

const LISTING_KINDS = ["business", "organization"] as const;

/**
 * Before deleting an account that is the ONLY owner of a business or organization: either transfer ownership
 * to another existing account (Listing Access grant, their password unchanged) or return the listing to admin
 * management (the owner link is removed; the listing stays and becomes unclaimed, so it can be claimed again).
 */
export async function resolveSoleOwnership(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const p = parseForm(z.object({ id: z.string().min(1).max(40), kind: z.enum(LISTING_KINDS), listingId: z.string().min(1).max(40), mode: z.enum(["transfer", "return"]), email: zOpt(254) }), fd);
  if (p.error) return p.error;
  const u = await db.user.findUnique({ where: { id: p.data.id } });
  if (!u || u.status === "DELETED") return { error: "User not found." };
  const listing = await loadListing({ kind: p.data.kind, id: p.data.listingId });
  if (!listing) return { error: "Listing not found." };
  const membership = await getMembership(listing, u.id);
  if (!membership || membership.role !== "OWNER") return { error: "This person isn't an owner of that listing any more." };
  const actor = { id: me.id, name: me.name, email: me.email };
  const entity = listing.kind === "business" ? "Business" : "Organization";
  if (p.data.mode === "transfer") {
    const email = z.email().safeParse((p.data.email ?? "").toLowerCase());
    if (!email.success) return { error: "Enter the email address of the account to transfer to.", fieldErrors: { email: "Enter a valid email" } };
    const target = await db.user.findUnique({ where: { email: email.data } });
    if (!target || target.status === "DELETED") return { error: `No account uses ${email.data}. Transfers go to an existing account — ask them to create a free account first, or use Listing Access to invite them.`, fieldErrors: { email: "No account with this email" } };
    if (target.id === u.id) return { error: "Choose a different account to transfer to.", fieldErrors: { email: "That's the same account" } };
    if (target.status !== "ACTIVE") return { error: `${target.email} is blocked. Unblock it first or choose another account.`, fieldErrors: { email: "Account is blocked" } };
    const r = await grantExistingUser(listing, target, "OWNER", actor, { notify: true });
    if (!r.ok) return { error: r.error };
    await audit(me.id, "user.ownership_transfer", entity, listing.id, { name: listing.name, from: u.email, to: target.email, kind: listing.kind });
    revalidatePath(`/admin/users/${u.id}`, "layout");
    return { ok: true, message: `${target.email} is now an owner of ${listing.name}. ${r.message}` };
  }
  const r = await removeListingAccess(listing, u.id, actor);
  if (!r.ok) return { error: r.error };
  await audit(me.id, "user.ownership_return", entity, listing.id, { name: listing.name, from: u.email, kind: listing.kind });
  revalidatePath(`/admin/users/${u.id}`, "layout");
  return { ok: true, message: `${listing.name} is back under admin management. The listing stays as it is and is now unclaimed, so it can be claimed again.` };
}

/** Admin → Users → Delete account (ADMIN only). Soft delete + anonymization; see src/lib/account-deletion.ts. */
export async function deleteUserAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const id = String(fd.get("id") ?? "").slice(0, 40);
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return { error: "User not found." };
  if (u.status === "DELETED") return { error: "This account was already deleted." };
  if (u.id === me.id) return { error: "You can't delete your own account from here. Ask another administrator." };
  if (u.role === "ADMIN" && (await otherActiveAdmins(u.id)) === 0) return { error: "You can't delete the last active administrator." };
  if (String(fd.get("confirmEmail") ?? "").trim().toLowerCase() !== u.email.toLowerCase()) return { error: "Type the account's email address exactly to confirm.", fieldErrors: { confirmEmail: "Doesn't match" } };
  const blocks = await soleOwnershipBlocks(u.id);
  if (blocks.length) return { error: `Resolve ownership first: ${u.email} is the only owner of ${blocks.map((b) => b.name).join(", ")}. Transfer each listing or return it to admin management.` };
  let r;
  try {
    r = await softDeleteAccount(u.id, me.id);
  } catch (e) {
    if (e instanceof SoleOwnerError) return { error: `Resolve ownership first: still the only owner of ${e.names.join(", ")}.` };
    throw e;
  }
  await audit(me.id, "user.admin_delete", "User", u.id, { ref: r.ref, role: u.role, businessLinks: r.businessLinks, organizationLinks: r.organizationLinks, sessionsRevoked: r.sessions });
  revalidatePath("/admin/users");
  redirect("/admin/users/?deleted=1");
}

/** A) Email a secure, expiring, single-use reset link (only the token's SHA-256 hash is stored). */
export async function sendPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const u = await db.user.findUnique({ where: { id: String(fd.get("id") ?? "") } });
  if (!u) return { error: "User not found." };
  if (u.status !== "ACTIVE") return { error: "Unblock the account before sending a reset link." };
  if (!rateLimit(`admin-reset-link:${me.id}`, 30, 60 * 60_000).ok) return { error: "Too many reset links sent recently. Please wait a while." };
  // createUserToken replaces any earlier unused reset link for this user.
  const token = await createUserToken(u.id, "PASSWORD_RESET", 2 * 3600_000);
  const link = absoluteUrl(`/reset-password/?token=${encodeURIComponent(token)}`);
  const r = await sendEmail(u.email, `Reset your ${BRAND.name} password`, `Hi${u.firstName || u.name ? ` ${oneLine(u.firstName || u.name, 60)}` : ""},\n\nAn administrator sent you a link to set a new password:\n\n${link}\n\nThis link expires in 2 hours and can be used once. If you didn't expect this, you can ignore it — your password won't change.\n\n— ${BRAND.name}`);
  await audit(me.id, "user.password_reset_link", "User", u.id, { email: u.email, delivered: r.delivered });
  return { ok: true, message: r.delivered ? `Reset link emailed to ${u.email}.` : `Email isn't configured, so the reset link was logged on the server (expires in 2 hours).` };
}

/**
 * B) Set a temporary password. Stores only the bcrypt hash, forces a change at
 * next sign-in and signs the user out everywhere. Admins can never view
 * existing passwords, and can't use this on themselves (use /account/).
 */
export async function setTemporaryPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const u = await db.user.findUnique({ where: { id: String(fd.get("id") ?? "") } });
  if (!u) return { error: "User not found." };
  if (u.id === me.id) return { error: "You can't set a temporary password on your own account. Change your password from My account instead." };
  if (u.status !== "ACTIVE") return { error: "Unblock the account before setting a password." };
  const password = String(fd.get("tempPassword") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem, fieldErrors: { tempPassword: problem } };
  if (password !== String(fd.get("tempConfirm") ?? "")) return { error: "The temporary passwords don't match.", fieldErrors: { tempConfirm: "Passwords don't match." } };
  if (!rateLimit(`temp-pw:${me.id}`, 20, 60 * 60_000).ok) return { error: "Too many temporary passwords set recently. Please wait a while and try again." };
  const [, sessions] = await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true, passwordChangedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: u.id } }),
    db.verificationToken.deleteMany({ where: { userId: u.id, type: "PASSWORD_RESET", usedAt: null } }),
  ]);
  await audit(me.id, "user.temp_password_set", "User", u.id, { email: u.email, sessionsRevoked: sessions.count, mustChangePassword: true });
  revalidatePath(`/admin/users/${u.id}`);
  return { ok: true, message: `Temporary password set for ${u.email}. They were signed out everywhere and must choose a new password when they next sign in. Share it securely — it isn't emailed.` };
}

export async function linkUserBusinesses(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const u = await db.user.findUnique({ where: { id } });
  if (!u) return { error: "User not found." };
  const ids = getAll(fd, "businesses");
  const current = await db.businessOwner.findMany({ where: { userId: id }, select: { businessId: true } });
  const removed = current.filter((c) => !ids.includes(c.businessId)).map((c) => c.businessId);
  const added = ids.filter((b) => !current.some((c) => c.businessId === b));
  await db.$transaction([
    db.businessOwner.deleteMany({ where: { userId: id, businessId: { in: removed } } }),
    ...added.map((businessId) => db.businessOwner.create({ data: { userId: id, businessId } })),
    ...(added.length && u.role === "MEMBER" ? [db.user.update({ where: { id }, data: { role: "BUSINESS_OWNER" } })] : []),
  ]);
  await audit(me.id, "user.link_business", "User", id, { email: u.email, added, removed, roleChanged: added.length > 0 && u.role === "MEMBER" });
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, message: added.length && u.role === "MEMBER" ? "Businesses linked; role changed to Business Owner." : "Business ownership saved." };
}

export async function revokeSessions(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (id === me.id) return { error: "Use Sign out for your own account." };
  const r = await db.session.deleteMany({ where: { userId: id } });
  await audit(me.id, "user.sessions_revoke", "User", id, { count: r.count });
  revalidatePath(`/admin/users/${id}`);
  return { ok: true, message: `Signed out of ${r.count} session${r.count === 1 ? "" : "s"}.` };
}

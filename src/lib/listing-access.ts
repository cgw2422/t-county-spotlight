import "server-only";
import { db } from "./db";
import { hashToken, randomToken } from "./auth";
import { audit } from "./audit";
import { sendEmail } from "./email";
import { absoluteUrl, formatDate } from "./utils";
import { decodePlainText, escapeHtml, oneLine } from "./text";
import { recomputeOwnership } from "./gives/ownership";
import { BRAND } from "./brand";
import type { InvitationStatus, OrgMemberRole, OwnerRole, User } from "@/generated/prisma/client";

/**
 * Listing Access: who can manage a business or organization (nonprofit /
 * church) listing, plus email invitations for people without a password.
 * Shared by the admin business + organization editors and /invite/accept/.
 *
 * Security notes:
 *  - Invitation tokens are 32 random bytes; only the SHA-256 hash is stored.
 *  - Nothing here ever reads, returns, logs or audits a password or a raw token.
 *  - Removing access deletes only the membership row — never the user.
 */

export type ListingKind = "business" | "organization";
export type ListingRef = { kind: ListingKind; id: string };
/** UI-level role. Organizations map MANAGER → ADMIN; EDITOR is organization-only. */
export type AccessRole = "OWNER" | "MANAGER" | "EDITOR";

export const INVITE_TTL_MS = 7 * 86400_000;
export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = { OWNER: "Owner", MANAGER: "Manager", EDITOR: "Editor" };

export function rolesFor(kind: ListingKind): AccessRole[] {
  return kind === "business" ? ["OWNER", "MANAGER"] : ["OWNER", "MANAGER", "EDITOR"];
}

export function toDbRole(kind: ListingKind, role: AccessRole): OwnerRole | OrgMemberRole {
  if (kind === "business") return role === "OWNER" ? "OWNER" : "MANAGER";
  return role === "OWNER" ? "OWNER" : role === "MANAGER" ? "ADMIN" : "EDITOR";
}

export function fromDbRole(kind: ListingKind, role: string): AccessRole {
  if (role === "OWNER") return "OWNER";
  if (kind === "organization" && role === "EDITOR") return "EDITOR";
  return "MANAGER"; // business MANAGER, organization ADMIN
}

export function parseAccessRole(kind: ListingKind, v: unknown): AccessRole | null {
  return typeof v === "string" && (rolesFor(kind) as string[]).includes(v) ? (v as AccessRole) : null;
}

export async function loadListing(ref: ListingRef) {
  if (!ref.id || ref.id.length > 40) return null;
  if (ref.kind === "business") {
    const b = await db.business.findUnique({ where: { id: ref.id }, select: { id: true, name: true } });
    return b ? { ...ref, name: decodePlainText(b.name), dashboardPath: `/dashboard/${b.id}/`, adminPath: `/admin/businesses/${b.id}/` } : null;
  }
  const o = await db.organization.findUnique({ where: { id: ref.id }, select: { id: true, name: true } });
  return o ? { ...ref, name: decodePlainText(o.name), dashboardPath: `/organization/${o.id}/`, adminPath: `/admin/organizations/${o.id}/` } : null;
}
export type Listing = NonNullable<Awaited<ReturnType<typeof loadListing>>>;

const listingWhere = (ref: ListingRef) => (ref.kind === "business" ? { businessId: ref.id } : { organizationId: ref.id });

export async function getMembership(ref: ListingRef, userId: string) {
  if (ref.kind === "business") {
    return db.businessOwner.findUnique({ where: { userId_businessId: { userId, businessId: ref.id } } });
  }
  return db.organizationMember.findUnique({ where: { userId_organizationId: { userId, organizationId: ref.id } } });
}

/** Adds or updates one membership. Never removes the user's other memberships. */
async function upsertMembership(ref: ListingRef, userId: string, role: AccessRole) {
  const dbRole = toDbRole(ref.kind, role);
  if (ref.kind === "business") {
    await db.businessOwner.upsert({
      where: { userId_businessId: { userId, businessId: ref.id } },
      create: { userId, businessId: ref.id, role: dbRole as OwnerRole },
      update: { role: dbRole as OwnerRole },
    });
  } else {
    await db.organizationMember.upsert({
      where: { userId_organizationId: { userId, organizationId: ref.id } },
      create: { userId, organizationId: ref.id, role: dbRole as OrgMemberRole },
      update: { role: dbRole as OrgMemberRole },
    });
    await recomputeOwnership(ref.id);
  }
}

/** Business managers need the BUSINESS_OWNER role for /dashboard/ (members are upgraded; staff roles never change). */
async function ensureBusinessRole(ref: ListingRef, user: Pick<User, "id" | "role" | "email">, actorId: string) {
  if (ref.kind !== "business" || user.role !== "MEMBER") return;
  await db.user.update({ where: { id: user.id }, data: { role: "BUSINESS_OWNER" } });
  await audit(actorId, "user.role", "User", user.id, { email: user.email, from: "MEMBER", to: "BUSINESS_OWNER" });
}

// ───────────────────────── Table rows ─────────────────────────

export type AccountStatus = "Active" | "Invitation pending" | "Suspended" | "Must change password" | "No password set";
export type InvitationDisplay = "Pending" | "Accepted" | "Expired" | "Revoked";

export function accountStatus(u: Pick<User, "status" | "passwordHash" | "mustChangePassword">, invitation?: InvitationDisplay | null): AccountStatus {
  if (u.status !== "ACTIVE") return "Suspended";
  if (!u.passwordHash) return invitation === "Pending" ? "Invitation pending" : "No password set";
  if (u.mustChangePassword) return "Must change password";
  return "Active";
}

export function invitationDisplay(inv: { status: InvitationStatus; expiresAt: Date } | null | undefined, now = new Date()): InvitationDisplay | null {
  if (!inv) return null;
  if (inv.status === "PENDING") return inv.expiresAt < now ? "Expired" : "Pending";
  return ({ ACCEPTED: "Accepted", EXPIRED: "Expired", REVOKED: "Revoked" } as const)[inv.status];
}

export type ListingAccessRow = {
  userId: string;
  name: string;
  email: string;
  role: AccessRole;
  accountStatus: AccountStatus;
  invitation: InvitationDisplay | null;
  invitationSentAt: string | null;
  invitationExpiresAt: string | null;
  lastLoginAt: string | null;
  isStaffUser: boolean;
};

export async function listingAccessRows(ref: ListingRef): Promise<ListingAccessRow[]> {
  const userSelect = { id: true, email: true, name: true, firstName: true, lastName: true, role: true, status: true, passwordHash: true, mustChangePassword: true, lastLoginAt: true } as const;
  const members = ref.kind === "business"
    ? await db.businessOwner.findMany({ where: { businessId: ref.id }, include: { user: { select: userSelect } }, orderBy: { createdAt: "asc" } })
    : await db.organizationMember.findMany({ where: { organizationId: ref.id }, include: { user: { select: userSelect } }, orderBy: { createdAt: "asc" } });
  const invites = await db.accountInvitation.findMany({
    where: { ...listingWhere(ref), userId: { in: members.map((m) => m.userId) } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, status: true, expiresAt: true, lastSentAt: true },
  });
  const now = new Date();
  return members.map((m) => {
    const inv = invites.find((i) => i.userId === m.userId);
    const invitation = invitationDisplay(inv, now);
    const u = m.user;
    return {
      userId: u.id,
      // passwordHash is only used to compute a status label; it never leaves the server.
      name: u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "",
      email: u.email,
      role: fromDbRole(ref.kind, m.role),
      accountStatus: accountStatus(u, invitation),
      invitation,
      invitationSentAt: inv?.lastSentAt.toISOString() ?? null,
      invitationExpiresAt: inv?.expiresAt.toISOString() ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      isStaffUser: u.role === "ADMIN" || u.role === "EDITOR",
    };
  });
}

// ───────────────────────── Emails ─────────────────────────

function emailHtml(paragraphs: string[], cta?: { href: string; label: string }) {
  // Every interpolated value is escaped; names are plain text.
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(p)}</p>`).join("");
  const button = cta
    ? `<p style="margin:20px 0"><a href="${escapeHtml(cta.href)}" style="background:#0B2340;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">${escapeHtml(cta.label)}</a></p><p style="margin:0 0 14px;font-size:13px;color:#475569">Or paste this link into your browser:<br>${escapeHtml(cta.href)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#F7F8F5;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:24px">${body}${button}<p style="margin:16px 0 0;color:#64748b;font-size:13px">— ${escapeHtml(BRAND.name)}</p></div></body></html>`;
}

async function sendInvitationEmail(opts: { to: string; firstName?: string | null; listing: Listing; role: AccessRole; token: string; expiresAt: Date }) {
  const link = absoluteUrl(`/invite/accept/?token=${encodeURIComponent(opts.token)}`);
  const name = oneLine(opts.listing.name);
  const hi = `Hi${opts.firstName ? ` ${oneLine(opts.firstName, 60)}` : ""},`;
  const lines = [
    hi,
    `You've been invited to manage ${name} on ${BRAND.name} as ${/^[aeiou]/i.test(ACCESS_ROLE_LABEL[opts.role]) ? "an" : "a"} ${ACCESS_ROLE_LABEL[opts.role].toLowerCase()}.`,
    `Choose your password to accept the invitation and open your dashboard. The link expires on ${formatDate(opts.expiresAt)} and can be used once.`,
    `If you weren't expecting this, you can ignore this email — no account changes are made until you accept.`,
  ];
  const text = `${lines[0]}\n\n${lines[1]}\n\n${lines[2]}\n\n${link}\n\n${lines[3]}\n\n— ${BRAND.name}`;
  return sendEmail(opts.to, oneLine(`You're invited to manage ${name} on ${BRAND.name}`, 200), text, emailHtml(lines, { href: link, label: "Accept invitation" }));
}

async function sendAccessGrantedEmail(opts: { to: string; name?: string | null; listing: Listing; role: AccessRole }) {
  const name = oneLine(opts.listing.name);
  const link = absoluteUrl(opts.listing.dashboardPath);
  const lines = [
    `Hi${opts.name ? ` ${oneLine(opts.name, 60)}` : ""},`,
    `You've been given ${ACCESS_ROLE_LABEL[opts.role].toLowerCase()} access to ${name} on ${BRAND.name}.`,
    `Sign in with your existing account to manage the listing. Your password hasn't changed.`,
  ];
  const text = `${lines[0]}\n\n${lines[1]}\n\n${lines[2]}\n\n${link}\n\n— ${BRAND.name}`;
  return sendEmail(opts.to, oneLine(`You now have access to ${name} on ${BRAND.name}`, 200), text, emailHtml(lines, { href: link, label: "Open dashboard" }));
}

// ───────────────────────── Invitations ─────────────────────────

/** Creates a new PENDING invitation (revoking older pending ones for the same user + listing) and emails it. */
async function issueInvitation(opts: { user: Pick<User, "id" | "email" | "firstName" | "name">; listing: Listing; role: AccessRole; actor: { id: string; name: string | null } }) {
  const { user, listing, role, actor } = opts;
  await db.accountInvitation.updateMany({ where: { userId: user.id, ...listingWhere(listing), status: "PENDING" }, data: { status: "REVOKED" } });
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const inv = await db.accountInvitation.create({
    data: {
      userId: user.id, email: user.email, tokenHash: hashToken(token), expiresAt, role: toDbRole(listing.kind, role), invitedById: actor.id,
      ...(listing.kind === "business" ? { businessId: listing.id } : { organizationId: listing.id }),
    },
  });
  const r = await sendInvitationEmail({ to: user.email, firstName: user.firstName || user.name, listing, role, token, expiresAt });
  await audit(actor.id, "invitation.send", "AccountInvitation", inv.id, { email: user.email, listing: listing.name, kind: listing.kind, listingId: listing.id, role, delivered: r.delivered });
  return { invitationId: inv.id, delivered: r.delivered };
}

export async function resendInvitation(listing: Listing, userId: string, actor: { id: string; name: string | null }) {
  const inv = await db.accountInvitation.findFirst({ where: { userId, ...listingWhere(listing) }, orderBy: { createdAt: "desc" }, include: { user: true } });
  if (!inv) {
    // Account without a password and no invitation yet (e.g. created by an older flow): send a first one.
    const [m, user] = await Promise.all([getMembership(listing, userId), db.user.findUnique({ where: { id: userId } })]);
    if (!m || !user) return { error: "That person doesn't have access to this listing." };
    if (user.passwordHash) return { error: "This person already has a password — they can sign in." };
    if (user.status !== "ACTIVE") return { error: "That account is suspended." };
    const r = await issueInvitation({ user, listing, role: fromDbRole(listing.kind, m.role), actor });
    return { message: r.delivered ? `Invitation emailed to ${user.email}.` : `Invitation created for ${user.email} (email isn't configured here, so it was logged on the server).` };
  }
  if (inv.status === "ACCEPTED" || inv.user.passwordHash) return { error: "This invitation was already accepted — they can sign in with their own password." };
  if (inv.status === "REVOKED" && !(await getMembership(listing, userId))) return { error: "This invitation was revoked. Add the person again to send a new one." };
  if (inv.user.status !== "ACTIVE") return { error: "That account is suspended." };
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  // Replacing the hash invalidates the old link.
  await db.accountInvitation.update({
    where: { id: inv.id },
    data: { tokenHash: hashToken(token), expiresAt, status: "PENDING", sendCount: { increment: 1 }, lastSentAt: new Date() },
  });
  const role = fromDbRole(listing.kind, inv.role);
  const r = await sendInvitationEmail({ to: inv.user.email, firstName: inv.user.firstName || inv.user.name, listing, role, token, expiresAt });
  await audit(actor.id, "invitation.resend", "AccountInvitation", inv.id, { email: inv.user.email, listing: listing.name, kind: listing.kind, listingId: listing.id, sendCount: inv.sendCount + 1, delivered: r.delivered });
  return { message: r.delivered ? `Invitation re-sent to ${inv.user.email}. The previous link no longer works.` : `New invitation created for ${inv.user.email} (email isn't configured here, so it was logged on the server). The previous link no longer works.` };
}

async function revokePendingInvitations(listing: ListingRef & { name?: string }, userId: string, actorId: string) {
  const pending = await db.accountInvitation.findMany({ where: { userId, ...listingWhere(listing), status: "PENDING" }, select: { id: true, email: true } });
  if (!pending.length) return 0;
  await db.accountInvitation.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: "REVOKED" } });
  for (const p of pending) await audit(actorId, "invitation.revoke", "AccountInvitation", p.id, { email: p.email, listing: listing.name ?? null, kind: listing.kind, listingId: listing.id });
  return pending.length;
}

export type InvitationLookup =
  | { state: "valid"; invitation: NonNullable<Awaited<ReturnType<typeof findInvitationRow>>> }
  | { state: "invalid" | "expired" | "used" | "revoked" };

function findInvitationRow(token: string) {
  return db.accountInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
}

/** Looks up an invitation by raw token without consuming it. */
export async function findInvitation(token: string | null | undefined): Promise<InvitationLookup> {
  if (!token || token.length < 20 || token.length > 200) return { state: "invalid" };
  const inv = await findInvitationRow(token);
  if (!inv) return { state: "invalid" };
  if (inv.status === "ACCEPTED") return { state: "used" };
  if (inv.status === "REVOKED") return { state: "revoked" };
  if (inv.status === "EXPIRED" || inv.expiresAt < new Date()) {
    if (inv.status === "PENDING") await db.accountInvitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    return { state: "expired" };
  }
  if (inv.user.status !== "ACTIVE") return { state: "revoked" };
  return { state: "valid", invitation: inv };
}

export function invitationListingRef(inv: { businessId: string | null; organizationId: string | null }): ListingRef | null {
  if (inv.businessId) return { kind: "business", id: inv.businessId };
  if (inv.organizationId) return { kind: "organization", id: inv.organizationId };
  return null;
}

/**
 * Marks the invitation accepted, single-use (conditional update), and — when
 * the account has no password yet — sets it. Returns the user, or null if the
 * invitation was consumed concurrently / is no longer valid.
 */
export async function acceptInvitation(invitationId: string, passwordHash: string | null) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const claimed = await tx.accountInvitation.updateMany({
      where: { id: invitationId, status: "PENDING", expiresAt: { gt: now } },
      data: { status: "ACCEPTED", acceptedAt: now },
    });
    if (claimed.count !== 1) return null;
    const inv = await tx.accountInvitation.findUniqueOrThrow({ where: { id: invitationId }, include: { user: true } });
    if (inv.user.status !== "ACTIVE") throw new Error("inactive");
    const data: Parameters<typeof tx.user.update>[0]["data"] = {
      // Opening the emailed link proves the person controls the address.
      emailVerifiedAt: inv.user.emailVerifiedAt ?? now,
    };
    // Sets a password only on accounts that have none — an existing password is never replaced here.
    if (passwordHash && !inv.user.passwordHash) Object.assign(data, { passwordHash, passwordChangedAt: now, mustChangePassword: false, lastLoginAt: now });
    const user = await tx.user.update({ where: { id: inv.userId }, data });
    return { user, invitation: inv };
  });
}

// ───────────────────────── Grant / change / remove ─────────────────────────

type Actor = { id: string; name: string | null; email: string };
export type GrantResult = { ok: true; message: string } | { ok: false; error: string; field?: string };

/** Gives an EXISTING account access. Never changes their password. */
export async function grantExistingUser(listing: Listing, target: User, role: AccessRole, actor: Actor, opts: { notify: boolean }): Promise<GrantResult> {
  if (target.status !== "ACTIVE") return { ok: false, error: `${target.email} is suspended. Reactivate the account first.` };
  const existing = await getMembership(listing, target.id);
  await upsertMembership(listing, target.id, role);
  await ensureBusinessRole(listing, target, actor.id);
  if (existing) {
    const from = fromDbRole(listing.kind, existing.role);
    if (from !== role) await audit(actor.id, "listing_access.role_change", listing.kind === "business" ? "Business" : "Organization", listing.id, { email: target.email, name: listing.name, from, to: role });
  } else {
    await audit(actor.id, "listing_access.add", listing.kind === "business" ? "Business" : "Organization", listing.id, { email: target.email, name: listing.name, role, method: target.passwordHash ? "existing_user" : "invitation", existingUser: true });
  }
  if (!target.passwordHash) {
    // Account exists but never set a password → invitation (lets them set one).
    const r = await issueInvitation({ user: target, listing, role, actor });
    return { ok: true, message: `${target.email} ${existing ? "already had access; role saved and" : "now has access;"} an invitation to set a password was ${r.delivered ? "emailed" : "created (logged on the server — email isn't configured)"}.` };
  }
  if (!existing && opts.notify) await sendAccessGrantedEmail({ to: target.email, name: target.firstName || target.name, listing, role });
  return { ok: true, message: existing ? `${target.email} already had access — role is now ${ACCESS_ROLE_LABEL[role].toLowerCase()}.` : `${target.email} now has ${ACCESS_ROLE_LABEL[role].toLowerCase()} access${opts.notify ? " and was emailed" : ""}. Their password wasn't changed.` };
}

/** OPTION 1: invite by email. Reuses an existing account when there is one. */
export async function inviteByEmail(listing: Listing, input: { email: string; firstName: string; lastName: string; role: AccessRole }, actor: Actor): Promise<GrantResult> {
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) return grantExistingUser(listing, existing, input.role, actor, { notify: true });
  const user = await db.user.create({
    data: {
      email: input.email, firstName: input.firstName, lastName: input.lastName, name: `${input.firstName} ${input.lastName}`.trim(),
      role: listing.kind === "business" ? "BUSINESS_OWNER" : "MEMBER", status: "ACTIVE", passwordHash: null,
    },
  });
  await audit(actor.id, "user.create_invited", "User", user.id, { email: user.email, listing: listing.name, kind: listing.kind, listingId: listing.id });
  await upsertMembership(listing, user.id, input.role);
  await audit(actor.id, "listing_access.add", listing.kind === "business" ? "Business" : "Organization", listing.id, { email: user.email, name: listing.name, role: input.role, method: "invitation", existingUser: false });
  const r = await issueInvitation({ user, listing, role: input.role, actor });
  return { ok: true, message: r.delivered ? `Invitation emailed to ${user.email}. It expires in 7 days.` : `Invitation created for ${user.email}. Email isn't configured here, so it was logged on the server.` };
}

/** OPTION 2: create a NEW account with an admin-chosen temporary password (hash only; must change on first login). */
export async function createWithTemporaryPassword(listing: Listing, input: { email: string; firstName: string; lastName: string; role: AccessRole; passwordHash: string }, actor: Actor): Promise<GrantResult> {
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) {
    return { ok: false, field: "email", error: `An account already exists for ${input.email}. Temporary passwords are only for new accounts — use “Send email invitation” (their password stays the same), or reset their password from their user page.` };
  }
  const now = new Date();
  const user = await db.user.create({
    data: {
      email: input.email, firstName: input.firstName, lastName: input.lastName, name: `${input.firstName} ${input.lastName}`.trim(),
      role: listing.kind === "business" ? "BUSINESS_OWNER" : "MEMBER", status: "ACTIVE",
      passwordHash: input.passwordHash, mustChangePassword: true, passwordChangedAt: now,
    },
  });
  await audit(actor.id, "user.create_temp_password", "User", user.id, { email: user.email, listing: listing.name, kind: listing.kind, listingId: listing.id, mustChangePassword: true });
  await upsertMembership(listing, user.id, input.role);
  await audit(actor.id, "listing_access.add", listing.kind === "business" ? "Business" : "Organization", listing.id, { email: user.email, name: listing.name, role: input.role, method: "temporary_password", existingUser: false });
  return { ok: true, message: `Account created for ${user.email} with ${ACCESS_ROLE_LABEL[input.role].toLowerCase()} access. Share the temporary password securely — they must change it when they first sign in.` };
}

export async function changeListingRole(listing: Listing, userId: string, role: AccessRole, actor: Actor): Promise<GrantResult> {
  const m = await getMembership(listing, userId);
  if (!m) return { ok: false, error: "That person doesn't have access to this listing." };
  const from = fromDbRole(listing.kind, m.role);
  if (from === role) return { ok: true, message: "Role unchanged." };
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  await upsertMembership(listing, userId, role);
  await db.accountInvitation.updateMany({ where: { userId, ...listingWhere(listing), status: "PENDING" }, data: { role: toDbRole(listing.kind, role) } });
  await audit(actor.id, "listing_access.role_change", listing.kind === "business" ? "Business" : "Organization", listing.id, { email: u?.email, name: listing.name, from, to: role });
  return { ok: true, message: `${u?.email ?? "User"} is now ${ACCESS_ROLE_LABEL[role].toLowerCase()}.` };
}

/** Deletes only this listing's membership row (never the user) and revokes pending invitations for it. */
export async function removeListingAccess(listing: Listing, userId: string, actor: Actor): Promise<GrantResult> {
  const m = await getMembership(listing, userId);
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  const revoked = await revokePendingInvitations(listing, userId, actor.id);
  if (!m && !revoked) return { ok: false, error: "That person doesn't have access to this listing." };
  let ownership: string | null = null;
  if (m) {
    if (listing.kind === "business") await db.businessOwner.delete({ where: { userId_businessId: { userId, businessId: listing.id } } });
    else {
      await db.organizationMember.delete({ where: { userId_organizationId: { userId, organizationId: listing.id } } });
      ownership = await recomputeOwnership(listing.id);
    }
    await audit(actor.id, "listing_access.remove", listing.kind === "business" ? "Business" : "Organization", listing.id, { email: u?.email, name: listing.name, revokedInvitations: revoked });
  }
  return { ok: true, message: `Removed ${u?.email ?? "user"}'s access to this listing. Their account and any other listings are unchanged.${ownership === "UNCLAIMED" ? " The listing is now unclaimed." : ""}` };
}

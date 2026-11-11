"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { OWNER_ONLY_MESSAGE, canManageOwnership, requireBusinessAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { ACCESS_ROLE_LABEL, getMembership, grantExistingUser, loadListing } from "@/lib/listing-access";
import type { ActionState } from "@/components/ui/form-message";
import type { OwnerRole } from "@/generated/prisma/client";

/**
 * "Team & ownership" for a business listing (owners + staff only). Every action
 * re-checks access server-side for THIS businessId, only touches BusinessOwner
 * rows of this business, and never leaves the listing without an owner
 * (checked under a row lock on the Business so concurrent changes can't race).
 */

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const ROLES = ["OWNER", "MANAGER"] as const;
const LAST_OWNER = "A listing needs at least one owner. Make someone else an owner first.";

async function ownerContext(fd: FormData) {
  const businessId = str(fd, "businessId", 40);
  const access = await requireBusinessAccess(businessId);
  if (!canManageOwnership(access.role)) return { error: OWNER_ONLY_MESSAGE } as const;
  return { ...access, actor: { id: access.user.id, name: access.user.name, email: access.user.email } } as const;
}

function refresh(businessId: string) {
  revalidatePath(`/dashboard/${businessId}/`, "layout");
  revalidatePath(`/admin/businesses/${businessId}/`);
}

class Blocked extends Error {}

/** Locks the business row and returns its current owner count (inside a transaction). */
async function lockedOwnerCount(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], businessId: string) {
  await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
  return tx.businessOwner.count({ where: { businessId, role: "OWNER" } });
}

export async function addTeamMemberAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await ownerContext(fd);
  if ("error" in ctx) return { error: ctx.error };
  const { business, actor } = ctx;
  const email = z.email().max(254).safeParse(str(fd, "email", 254).toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address.", fieldErrors: { email: "Enter a valid email" } };
  const role = str(fd, "role") as (typeof ROLES)[number];
  if (!ROLES.includes(role)) return { error: "Choose a role.", fieldErrors: { role: "Choose a role" } };
  if (!rateLimit(`biz-team-add:${actor.id}`, 30, 60 * 60_000).ok) return { error: "You've added a lot of people recently. Please wait a while and try again." };

  // Only existing, registered accounts (no new invitation flow from here).
  const target = await db.user.findUnique({ where: { email: email.data } });
  if (!target || !target.passwordHash) {
    return { error: `No registered T County Connect account uses ${email.data} yet. Ask them to create a free account first, then add them here.`, fieldErrors: { email: "No account with this email" } };
  }
  if (target.status !== "ACTIVE") return { error: `The account for ${email.data} isn't active. Contact T County Connect for help.` };
  if (await getMembership({ kind: "business", id: business.id }, target.id)) {
    return { error: `${email.data} is already on your team. Change their role in the list instead.` };
  }
  const listing = await loadListing({ kind: "business", id: business.id });
  if (!listing) return { error: "Listing not found." };
  const r = await grantExistingUser(listing, target, role, actor, { notify: true });
  if (!r.ok) return { error: r.error };
  refresh(business.id);
  return { ok: true, message: `${email.data} is now ${role === "OWNER" ? "an owner" : "a manager"} of ${business.name}. We emailed them.` };
}

export async function changeTeamRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await ownerContext(fd);
  if ("error" in ctx) return { error: ctx.error };
  const { business, actor } = ctx;
  const userId = str(fd, "userId", 40);
  const role = str(fd, "role") as OwnerRole;
  if (!ROLES.includes(role)) return { error: "Choose a role." };
  if (userId === actor.id) return { error: "You can't change your own role here. Ask another owner." };
  let from: OwnerRole;
  let email: string;
  try {
    ({ from, email } = await db.$transaction(async (tx) => {
      const owners = await lockedOwnerCount(tx, business.id);
      const link = await tx.businessOwner.findUnique({ where: { userId_businessId: { userId, businessId: business.id } }, include: { user: { select: { email: true } } } });
      if (!link) throw new Blocked("That person isn't on this listing's team.");
      if (link.role === "OWNER" && role !== "OWNER" && owners <= 1) throw new Blocked(LAST_OWNER);
      if (link.role !== role) {
        await tx.businessOwner.update({ where: { userId_businessId: { userId, businessId: business.id } }, data: { role } });
        await tx.accountInvitation.updateMany({ where: { userId, businessId: business.id, status: "PENDING" }, data: { role } });
      }
      return { from: link.role, email: link.user.email };
    }));
  } catch (e) {
    if (e instanceof Blocked) return { error: e.message };
    throw e;
  }
  if (from === role) return { ok: true, message: "Role unchanged." };
  await audit(actor.id, "listing_access.role_change", "Business", business.id, { email, name: business.name, from, to: role, via: "owner_team_page" });
  refresh(business.id);
  return { ok: true, message: `${email} is now ${ACCESS_ROLE_LABEL[role].toLowerCase()}.` };
}

export async function removeTeamMemberAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await ownerContext(fd);
  if ("error" in ctx) return { error: ctx.error };
  const { business, actor } = ctx;
  const userId = str(fd, "userId", 40);
  if (userId === actor.id) return { error: "You can't remove yourself here. Ask another owner." };
  let email: string;
  let revoked = 0;
  try {
    ({ email, revoked } = await db.$transaction(async (tx) => {
      const owners = await lockedOwnerCount(tx, business.id);
      const link = await tx.businessOwner.findUnique({ where: { userId_businessId: { userId, businessId: business.id } }, include: { user: { select: { email: true } } } });
      if (!link) throw new Blocked("That person isn't on this listing's team.");
      if (link.role === "OWNER" && owners <= 1) throw new Blocked(LAST_OWNER);
      // Only this listing's membership row — never the user account or their other listings.
      await tx.businessOwner.delete({ where: { userId_businessId: { userId, businessId: business.id } } });
      const inv = await tx.accountInvitation.updateMany({ where: { userId, businessId: business.id, status: "PENDING" }, data: { status: "REVOKED" } });
      return { email: link.user.email, revoked: inv.count };
    }));
  } catch (e) {
    if (e instanceof Blocked) return { error: e.message };
    throw e;
  }
  await audit(actor.id, "listing_access.remove", "Business", business.id, { email, name: business.name, revokedInvitations: revoked, via: "owner_team_page" });
  refresh(business.id);
  return { ok: true, message: `Removed ${email} from ${business.name}. Their account and any other listings are unchanged.` };
}

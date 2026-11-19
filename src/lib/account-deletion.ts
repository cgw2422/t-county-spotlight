import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import { soleOwnershipBlocks, type SoleOwnershipBlock } from "./sole-ownership";
import { recomputeOwnership } from "./gives/ownership";
import { Prisma } from "@/generated/prisma/client";

/**
 * Removing an account (Admin → Users → Delete account; parts shared with the self-service delete in
 * src/app/(site)/account/actions.ts).
 *
 * Admin deletion is a SOFT delete: the User row stays with status DELETED and every personal field cleared
 * (email replaced by `deleted-<ref>@invalid`, names, password, 2FA, preferences), and all access is removed
 * (listing/organization links, sessions, tokens, invitations, saved items, follows, push subscriptions).
 * Keeping the row means nothing can cascade: listings, their content, photos, subscriptions and payments
 * (all business-owned), events, articles, media, audit logs and recommendations stay exactly as they are.
 * Pending business applications are closed (REJECTED, "account deleted") so they can never be approved.
 * Newsletter subscriptions (beehiiv or built-in) are not touched.
 */

export const ACCOUNT_DELETED_NOTE = "account deleted";

/** Short, stable, non-reversible reference used in anonymized values and audit entries. */
export function deletedRef(userId: string) {
  return crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

/** Anonymizes records that outlive the account and closes its pending applications (both delete flows). */
export function anonymizeUserRecords(tx: Prisma.TransactionClient, userId: string, opts: { ref: string; reviewedById?: string | null }) {
  return Promise.all([
    tx.event.updateMany({ where: { submittedById: userId }, data: { submitterEmail: null } }),
    // Closed first, so the anonymized copies can never be approved (an approval would otherwise create an account for them).
    tx.businessApplication.updateMany({ where: { userId, status: "PENDING" }, data: { status: "REJECTED", reviewNote: ACCOUNT_DELETED_NOTE, reviewedAt: new Date(), reviewedById: opts.reviewedById ?? null } }),
  ]).then(() => tx.businessApplication.updateMany({ where: { userId }, data: { email: `deleted-${opts.ref}@invalid`, contactName: null, phone: null } }));
}

export type DeletionSummary = {
  businesses: { id: string; name: string; role: string; soleOwner: boolean; subscriptions: number; payments: number }[];
  organizations: { id: string; name: string; role: string; soleOwner: boolean }[];
  soleOwner: SoleOwnershipBlock[];
  pendingApplications: { id: string; businessName: string }[];
  savedItems: number;
  follows: number;
  recommendations: number;
  sessions: number;
  orgClaimsPending: number;
};

export async function accountDeletionSummary(userId: string): Promise<DeletionSummary> {
  const [biz, orgs, sole, pendingApplications, counts, orgClaimsPending] = await Promise.all([
    db.businessOwner.findMany({ where: { userId, business: { deletedAt: null } }, select: { role: true, business: { select: { id: true, name: true, _count: { select: { subscriptions: true, payments: true } } } } }, orderBy: { business: { name: "asc" } } }),
    db.organizationMember.findMany({ where: { userId, organization: { deletedAt: null } }, select: { role: true, organization: { select: { id: true, name: true } } }, orderBy: { organization: { name: "asc" } } }),
    soleOwnershipBlocks(userId),
    db.businessApplication.findMany({ where: { userId, status: "PENDING" }, select: { id: true, businessName: true }, orderBy: { createdAt: "asc" } }),
    db.user.findUnique({ where: { id: userId }, select: { _count: { select: { savedItems: true, follows: true, recommendations: true, sessions: true } } } }),
    db.organizationClaim.count({ where: { userId, status: "PENDING" } }),
  ]);
  const soleIds = new Set(sole.map((s) => `${s.kind}:${s.id}`));
  return {
    businesses: biz.map((b) => ({ id: b.business.id, name: b.business.name, role: b.role, soleOwner: soleIds.has(`business:${b.business.id}`), subscriptions: b.business._count.subscriptions, payments: b.business._count.payments })),
    organizations: orgs.map((o) => ({ id: o.organization.id, name: o.organization.name, role: o.role, soleOwner: soleIds.has(`organization:${o.organization.id}`) })),
    soleOwner: sole,
    pendingApplications,
    savedItems: counts?._count.savedItems ?? 0,
    follows: counts?._count.follows ?? 0,
    recommendations: counts?._count.recommendations ?? 0,
    sessions: counts?._count.sessions ?? 0,
    orgClaimsPending,
  };
}

/** Soft-deletes (anonymizes) the account. The caller has already checked permissions and sole ownership. */
export async function softDeleteAccount(userId: string, actorId: string) {
  const ref = deletedRef(userId);
  const orgIds = (await db.organizationMember.findMany({ where: { userId }, select: { organizationId: true } })).map((m) => m.organizationId);
  const removed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    // Sole ownership re-checked inside the transaction (a listing must never lose its last owner here).
    const soleBiz = await tx.businessOwner.findMany({ where: { userId, role: "OWNER", business: { deletedAt: null } }, select: { business: { select: { name: true, _count: { select: { owners: { where: { role: "OWNER" } } } } } } } });
    const soleOrg = await tx.organizationMember.findMany({ where: { userId, role: "OWNER", organization: { deletedAt: null } }, select: { organization: { select: { name: true, _count: { select: { members: { where: { role: "OWNER" } } } } } } } });
    const blocked = [...soleBiz.filter((b) => b.business._count.owners <= 1).map((b) => b.business.name), ...soleOrg.filter((o) => o.organization._count.members <= 1).map((o) => o.organization.name)];
    if (blocked.length) throw new SoleOwnerError(blocked);

    await anonymizeUserRecords(tx, userId, { ref, reviewedById: actorId });
    const [owners, members, sessions] = await Promise.all([
      tx.businessOwner.deleteMany({ where: { userId } }),
      tx.organizationMember.deleteMany({ where: { userId } }),
      tx.session.deleteMany({ where: { userId } }),
      tx.verificationToken.deleteMany({ where: { userId } }),
      tx.accountInvitation.deleteMany({ where: { userId } }),
      tx.savedItem.deleteMany({ where: { userId } }),
      tx.businessFollow.deleteMany({ where: { userId } }),
      tx.pushSubscription.deleteMany({ where: { userId } }),
      tx.organizationClaim.updateMany({ where: { userId, status: "PENDING" }, data: { status: "WITHDRAWN", reviewNote: ACCOUNT_DELETED_NOTE } }),
    ]);
    await tx.user.update({
      where: { id: userId },
      data: {
        status: "DELETED", role: "MEMBER", email: `deleted-${ref}@invalid`, name: null, firstName: null, lastName: null,
        passwordHash: null, mustChangePassword: false, emailVerifiedAt: null, totpSecret: null, totpEnabled: false,
        notificationPrefs: Prisma.DbNull, homeCommunity: null, extraCommunities: [], interestKeys: [],
      },
    });
    return { businessLinks: owners.count, organizationLinks: members.count, sessions: sessions.count };
  });
  for (const id of orgIds) await recomputeOwnership(id).catch(() => {});
  return { ref, ...removed };
}

export class SoleOwnerError extends Error {
  constructor(public names: string[]) {
    super(`Still the only owner of ${names.join(", ")}.`);
  }
}

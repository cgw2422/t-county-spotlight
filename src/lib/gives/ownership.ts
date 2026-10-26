import "server-only";
import { db } from "@/lib/db";
import type { OrgOwnership, Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Recomputes Organization.ownershipStatus from its members and claims:
 *  - CLAIMED        at least one OrganizationMember
 *  - CLAIM_PENDING  no members, but at least one PENDING claim
 *  - UNCLAIMED      otherwise
 * Ownership never affects publication or moderation status.
 */
export async function recomputeOwnership(orgId: string, tx: Tx = db): Promise<OrgOwnership | null> {
  const [org, members, pending] = await Promise.all([
    tx.organization.findUnique({ where: { id: orgId }, select: { ownershipStatus: true } }),
    tx.organizationMember.count({ where: { organizationId: orgId } }),
    tx.organizationClaim.count({ where: { organizationId: orgId, status: "PENDING" } }),
  ]);
  if (!org) return null;
  const next: OrgOwnership = members > 0 ? "CLAIMED" : pending > 0 ? "CLAIM_PENDING" : "UNCLAIMED";
  if (next !== org.ownershipStatus) await tx.organization.update({ where: { id: orgId }, data: { ownershipStatus: next } });
  return next;
}

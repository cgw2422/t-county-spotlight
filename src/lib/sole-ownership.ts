import "server-only";
import { db } from "./db";

export type SoleOwnershipBlock = {
  kind: "business" | "organization";
  id: string;
  name: string;
  /** Where an owner can add/promote another owner (null when the listing is closed to its owners, e.g. suspended). */
  teamHref: string | null;
};

/**
 * Listings this user is the ONLY owner of: non-deleted businesses where they are
 * the only BusinessOwner with role OWNER, and non-deleted organizations where they
 * are the only OrganizationMember with role OWNER. Deleting the account would leave
 * these without an owner, so account deletion is blocked until ownership is shared
 * or transferred. Managers/admins/editors never block deletion.
 */
export async function soleOwnershipBlocks(userId: string): Promise<SoleOwnershipBlock[]> {
  const [biz, orgs] = await Promise.all([
    db.businessOwner.findMany({
      where: { userId, role: "OWNER", business: { deletedAt: null } },
      select: { business: { select: { id: true, name: true, status: true, _count: { select: { owners: { where: { role: "OWNER" } } } } } } },
    }),
    db.organizationMember.findMany({
      where: { userId, role: "OWNER", organization: { deletedAt: null } },
      select: { organization: { select: { id: true, name: true, status: true, _count: { select: { members: { where: { role: "OWNER" } } } } } } },
    }),
  ]);
  return [
    ...biz.filter((b) => b.business._count.owners <= 1).map((b) => ({
      kind: "business" as const, id: b.business.id, name: b.business.name,
      teamHref: b.business.status === "SUSPENDED" ? null : `/dashboard/${b.business.id}/team/`,
    })),
    ...orgs.filter((o) => o.organization._count.members <= 1).map((o) => ({
      kind: "organization" as const, id: o.organization.id, name: o.organization.name,
      teamHref: ["SUSPENDED", "ARCHIVED"].includes(o.organization.status) ? null : `/organization/${o.organization.id}/team/`,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

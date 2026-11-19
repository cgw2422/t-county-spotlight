import { db } from "@/lib/db";

/**
 * Paid memberships are offered only for APPROVED listings: published and not deleted.
 * Pending applications have no listing access at all, and listings that aren't live yet
 * (draft, pending review) show no paid options and can't start checkout.
 */
export function isListingUpgradeable(b: { status: string; deletedAt?: Date | null }) {
  return b.status === "PUBLISHED" && !b.deletedAt;
}

/** Approved listings this account can upgrade: it must be an OWNER (billing permission) of a published listing. */
export async function getUpgradeableListings(userId: string) {
  const rows = await db.businessOwner.findMany({
    where: { userId, role: "OWNER", user: { status: "ACTIVE" }, business: { status: "PUBLISHED", deletedAt: null } },
    orderBy: { business: { name: "asc" } },
    select: { business: { select: { id: true, name: true, slug: true, city: true } } },
  });
  return rows.map((r) => r.business);
}

export const membershipTabPath = (businessId: string) => `/dashboard/${businessId}/membership/`;

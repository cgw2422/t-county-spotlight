import "server-only";
import { db } from "@/lib/db";

/** True when staff last marked exactly this donation URL as verified (audit log). */
export async function isDonationVerified(orgId: string, url: string | null | undefined) {
  if (!url) return false;
  const last = await db.auditLog.findFirst({
    where: { entityType: "Organization", entityId: orgId, action: { in: ["organization.donation_verified", "organization.donation_unverified"] } },
    orderBy: { createdAt: "desc" },
    select: { action: true, details: true },
  });
  return last?.action === "organization.donation_verified" && (last.details as { url?: string } | null)?.url === url;
}

/** Organizations whose profile a member has edited from the organization dashboard. */
export async function memberEditedOrgIds(orgIds: string[]) {
  if (!orgIds.length) return new Set<string>();
  const rows = await db.auditLog.findMany({
    where: { entityType: "Organization", entityId: { in: orgIds }, action: "organization.member_update" },
    select: { entityId: true },
    distinct: ["entityId"],
  });
  return new Set(rows.map((r) => r.entityId!).filter(Boolean));
}

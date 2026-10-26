import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isStaff, requireUser } from "@/lib/auth";
import { ROLE_RANK, type OrgRoleValue } from "./constants";

/**
 * Server-side organization access check. Staff may access any organization.
 * Members need an OrganizationMember row with at least `minRole`.
 * Suspended, archived and deleted organizations are closed to non-staff.
 * Redirects to /organization/ when access is denied.
 */
export async function requireOrgAccess(orgId: string, minRole: OrgRoleValue = "EDITOR") {
  const user = await requireUser("/organization/");
  if (!orgId || typeof orgId !== "string" || orgId.length > 40) redirect("/organization/");
  if (isStaff(user)) {
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) redirect("/organization/");
    const m = await db.organizationMember.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: orgId } }, select: { role: true } });
    return { user, org, role: (m?.role ?? "OWNER") as OrgRoleValue, staff: true };
  }
  const link = await db.organizationMember.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
    include: { organization: true },
  });
  if (!link || link.organization.deletedAt || ["SUSPENDED", "ARCHIVED"].includes(link.organization.status)) redirect("/organization/");
  if (ROLE_RANK[link.role] < ROLE_RANK[minRole]) redirect(`/organization/${orgId}/?denied=1`);
  return { user, org: link.organization, role: link.role as OrgRoleValue, staff: false };
}

/** Organizations the user belongs to (excludes deleted). */
export async function getUserOrganizations(userId: string) {
  const rows = await db.organizationMember.findMany({
    where: { userId, organization: { deletedAt: null } },
    include: { organization: { select: { id: true, name: true, slug: true, kind: true, status: true, city: true, logoUrl: true, verifiedAt: true } } },
    orderBy: { organization: { name: "asc" } },
  });
  return rows.map((r) => ({ ...r.organization, role: r.role }));
}

/** Where to send a user after sign-in when no `next` was requested. */
export async function postLoginHome(user: { id: string; role: string }, fallback: string) {
  if (user.role === "ADMIN" || user.role === "EDITOR" || user.role === "BUSINESS_OWNER") return fallback;
  const [biz, org] = await Promise.all([
    db.businessOwner.count({ where: { userId: user.id, business: { deletedAt: null } } }),
    db.organizationMember.count({ where: { userId: user.id, organization: { deletedAt: null, status: { notIn: ["SUSPENDED", "ARCHIVED"] } } } }),
  ]);
  if (!biz && org) return "/organization/";
  return fallback;
}

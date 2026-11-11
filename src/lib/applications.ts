import type { Prisma } from "@/generated/prisma/client";

/**
 * Business applications can be either a NEW business or a CLAIM of an existing
 * listing (/list-your-business/?claim=<slug>). Claims store the listing in
 * `data.claim = { businessId, name }` (and `businessId` at submission time).
 */
export type ApplicationClaim = { businessId: string; name: string };

export function applicationClaim(app: { data: Prisma.JsonValue | null; businessId?: string | null; status?: string }): ApplicationClaim | null {
  const data = app.data;
  const claim = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>).claim : null;
  if (claim && typeof claim === "object" && !Array.isArray(claim)) {
    const { businessId, name } = claim as Record<string, unknown>;
    if (typeof businessId === "string" && businessId) return { businessId, name: typeof name === "string" ? name : "" };
  }
  // A new-business application only gets businessId when approved, so a PENDING one with businessId is a claim.
  if (app.status === "PENDING" && app.businessId) return { businessId: app.businessId, name: "" };
  return null;
}

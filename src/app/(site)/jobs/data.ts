import type { Prisma } from "@/generated/prisma/client";

/** Published, unexpired jobs (and only for public businesses). */
export function openJobWhere(extra: Prisma.JobWhereInput = {}): Prisma.JobWhereInput {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }, { OR: [{ businessId: null }, { business: { status: "PUBLISHED", deletedAt: null } }] }],
    ...extra,
  };
}

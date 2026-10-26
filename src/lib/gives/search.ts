import "server-only";
import { db } from "@/lib/db";
import { orgCardSelect, publicOrgWhere } from "./queries";

/** Approved organizations matching a site search query. */
export async function searchOrganizations(q: string, limit: number) {
  const c = { contains: q, mode: "insensitive" as const };
  const where = publicOrgWhere({ OR: [{ name: c }, { tagline: c }, { mission: c }, { orgType: c }, { denomination: c }, { city: c }, { ministries: { has: q } }] });
  const [count, rows] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({ where, select: orgCardSelect, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: limit }),
  ]);
  return { count, rows };
}

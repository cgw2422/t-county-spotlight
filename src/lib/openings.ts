import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { prioritizeByCommunity } from "./my-t-county-shared";
import { isArchivedOpening } from "./openings-shared";

export * from "./openings-shared";

/**
 * Public New & Coming Soon entries: published BusinessUpdate with kind != GENERAL,
 * either unlisted (no business) or connected to a public business listing.
 * Shared contract — used by /new/, the homepage, community pages and search.
 */
export function publicOpeningsWhere(extra: Prisma.BusinessUpdateWhereInput = {}): Prisma.BusinessUpdateWhereInput {
  return {
    AND: [
      { status: "PUBLISHED", kind: { not: "GENERAL" } },
      { OR: [{ businessId: null }, { business: { status: "PUBLISHED", deletedAt: null } }] },
      extra,
    ],
  };
}

/** Opening entries matching a community: the entry's own city or the connected listing's city. */
export function openingCityWhere(city: string): Prisma.BusinessUpdateWhereInput {
  return {
    OR: [
      { city: { equals: city, mode: "insensitive" } },
      { city: null, business: { city: { equals: city, mode: "insensitive" } } },
    ],
  };
}

export const openingCardSelect = {
  id: true, kind: true, title: true, body: true, imageUrl: true, photos: true, businessName: true, address: true, city: true,
  effectiveDate: true, dateNote: true, linkUrl: true, featuredUntil: true, publishedAt: true, createdAt: true,
  business: { select: { id: true, slug: true, name: true, city: true, address: true, coverUrl: true, logoUrl: true } },
} satisfies Prisma.BusinessUpdateSelect;

export type OpeningCard = Prisma.BusinessUpdateGetPayload<{ select: typeof openingCardSelect }>;

/** Community of an entry (its own city first, else the listing's city). */
export function openingCity(o: { city: string | null; business?: { city: string | null } | null }) {
  return o.city || o.business?.city || null;
}

export function openingPhoto(o: { photos: string[]; imageUrl: string | null; business?: { coverUrl: string | null } | null }) {
  return o.photos[0] || o.imageUrl || o.business?.coverUrl || null;
}

/** Sort key: newest announcement first. */
const ORDER: Prisma.BusinessUpdateOrderByWithRelationInput[] = [{ publishedAt: "desc" }, { createdAt: "desc" }];

/** All public openings split into current and "Earlier" (aged) entries. */
export async function getOpenings(opts: { kind?: string | null; city?: string | null } = {}) {
  const extra: Prisma.BusinessUpdateWhereInput[] = [];
  if (opts.kind) extra.push({ kind: opts.kind as Prisma.BusinessUpdateWhereInput["kind"] });
  if (opts.city) extra.push(openingCityWhere(opts.city));
  const rows = await db.businessUpdate.findMany({
    where: publicOpeningsWhere(extra.length ? { AND: extra } : {}),
    orderBy: ORDER,
    take: 300,
    select: openingCardSelect,
  });
  const now = new Date();
  return {
    current: rows.filter((r) => !isArchivedOpening(r, now)),
    earlier: rows.filter((r) => isArchivedOpening(r, now)),
  };
}

/**
 * Homepage entries: featuredUntil null-or-future and not aged into the archive,
 * community-first when a community is chosen.
 */
export async function getHomepageOpenings(communities: (string | null)[], limit = 4) {
  const now = new Date();
  const rows = await db.businessUpdate.findMany({
    where: publicOpeningsWhere({ OR: [{ featuredUntil: null }, { featuredUntil: { gt: now } }] }),
    orderBy: ORDER,
    take: 60,
    select: openingCardSelect,
  });
  const current = rows.filter((r) => !isArchivedOpening(r, now));
  return prioritizeByCommunity(current, openingCity, communities).slice(0, limit);
}

/** The current published opening/relocation entry for a business profile badge (null when none). */
export async function getCurrentOpeningForBusiness(businessId: string) {
  const rows = await db.businessUpdate.findMany({
    where: publicOpeningsWhere({ businessId }),
    orderBy: ORDER,
    take: 5,
    select: openingCardSelect,
  });
  const now = new Date();
  return rows.find((r) => !isArchivedOpening(r, now)) ?? null;
}

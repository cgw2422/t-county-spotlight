import "server-only";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import { businessHref } from "./links";
import { orgHref } from "./gives/constants";

/** Community Pulse — shared labels, public queries and result ordering. */

export const PULSE_SOURCE_LABEL: Record<string, string> = {
  FACEBOOK: "Facebook discussion",
  COMMUNITY_SUBMISSION: "Community submission",
  SURVEY: "Survey",
  EDITORIAL: "Editorial feature",
  OTHER: "Other",
};

export const PULSE_DISPLAY_LABEL: Record<string, string> = {
  RANKED_LIST: "Ranked list",
  BARS: "Comparison bars",
  EDITORIAL_LIST: "Editorial list (no counts)",
};

export const PULSE_SORT_LABEL: Record<string, string> = {
  MENTIONS_DESC: "Highest mentions",
  MANUAL: "Manual order",
};

export function pulseHref(p: { slug: string }) {
  return `/community-pulse/${p.slug}/`;
}

/** Publicly reachable entries: published or archived, not deleted, publication date reached. */
export const publicPulseWhere = (extra: Prisma.CommunityPulseWhereInput = {}, opts: { includeArchived?: boolean } = {}): Prisma.CommunityPulseWhereInput => ({
  status: opts.includeArchived ? { in: ["PUBLISHED", "ARCHIVED"] } : "PUBLISHED",
  deletedAt: null,
  publishedAt: { lte: new Date() },
  ...extra,
});

/** Only link directory profiles that are public. */
export const pulseResultInclude = {
  business: { select: { id: true, slug: true, name: true, status: true, deletedAt: true } },
  organization: { select: { id: true, slug: true, name: true, kind: true, status: true, isPublished: true, deletedAt: true } },
} satisfies Prisma.PulseResultInclude;

export type PulseResultRow = Prisma.PulseResultGetPayload<{ include: typeof pulseResultInclude }>;

/** Internal profile link for a result (only when the linked listing is public). */
export function resultProfileHref(r: PulseResultRow): { href: string; businessId?: string } | null {
  if (r.business && r.business.status === "PUBLISHED" && !r.business.deletedAt) return { href: businessHref(r.business), businessId: r.business.id };
  if (r.organization && r.organization.status === "APPROVED" && r.organization.isPublished && !r.organization.deletedAt) return { href: orgHref(r.organization) };
  return null;
}

/**
 * Orders results as the admin configured: by mentions (ties keep manual order)
 * or strictly by manual order. Paid status never affects ordering.
 */
export function orderResults<T extends { mentions: number | null; sortOrder: number }>(rows: T[], sortMode: string): T[] {
  const byManual = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  if (sortMode === "MANUAL") return byManual;
  return byManual.sort((a, b) => (b.mentions ?? -1) - (a.mentions ?? -1));
}

export const pulseCardSelect = {
  id: true, slug: true, title: true, description: true, featuredImageUrl: true, featuredImageAlt: true, publishedAt: true, status: true,
  displayMode: true, sortMode: true,
  category: { select: { name: true, slug: true } },
  results: { select: { name: true, mentions: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.CommunityPulseSelect;

export type PulseCardData = Prisma.CommunityPulseGetPayload<{ select: typeof pulseCardSelect }>;

/** The featured entry for the homepage hero (only when public). */
export async function getFeaturedPulse() {
  try {
    return await db.communityPulse.findFirst({
      where: publicPulseWhere({ isFeatured: true }),
      orderBy: { publishedAt: "desc" },
      include: { results: { include: pulseResultInclude, orderBy: { sortOrder: "asc" } } },
    });
  } catch (e) {
    console.error("[pulse] featured lookup failed", e);
    return null;
  }
}
export type FeaturedPulse = NonNullable<Awaited<ReturnType<typeof getFeaturedPulse>>>;

export async function getRecentPulses(limit: number, excludeIds: string[] = []) {
  return db.communityPulse.findMany({
    where: publicPulseWhere(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: pulseCardSelect,
  });
}

/** Published entries that mention a business or organization (one row per entry). */
export async function getPulseMentions(where: { businessId?: string; organizationId?: string }) {
  const rows = await db.pulseResult.findMany({
    where: { ...where, pulse: publicPulseWhere({}, { includeArchived: true }) },
    select: { mentions: true, pulse: { select: { id: true, slug: true, title: true, publishedAt: true, displayMode: true, status: true } } },
    orderBy: { pulse: { publishedAt: "desc" } },
    take: 20,
  });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.pulse.id) ? false : (seen.add(r.pulse.id), true)));
}

export function mentionsLabel(n: number) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "mention" : "mentions"}`;
}

/** Shown on every public results page. */
export const PULSE_DISCLOSURE = "Results are manually compiled from community responses and reflect the opinions of participants. They are not official endorsements by T County Connect.";

/** Related entries: same category first, then the most recent. */
export async function getRelatedPulses(p: { id: string; categoryId: string | null }, limit = 3) {
  const same = p.categoryId
    ? await db.communityPulse.findMany({ where: publicPulseWhere({ categoryId: p.categoryId, id: { not: p.id } }), orderBy: { publishedAt: "desc" }, take: limit, select: pulseCardSelect })
    : [];
  if (same.length >= limit) return same;
  const more = await getRecentPulses(limit - same.length, [p.id, ...same.map((s) => s.id)]);
  return [...same, ...more];
}

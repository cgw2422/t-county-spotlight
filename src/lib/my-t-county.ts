import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getCurrentUser } from "./auth";
import { publicPromotionWhere } from "./promotions";
import { attributeWhere } from "./events";
import { getUpcomingOccurrences, publicBusinessWhere, businessCardSelect } from "./queries";
import {
  ALL_COUNTY, COMMUNITY_COOKIE, PROMPT_DISMISSED_COOKIE, SCOPE_COOKIE, cleanCommunities, cleanInterests, communityName,
  interestByKey, prioritizeByCommunity, type InterestKey,
} from "./my-t-county-shared";

export * from "./my-t-county-shared";

export type CommunityPreference = {
  /** Preferred community name (null = All of Tuscarawas County). */
  community: string | null;
  /** Community used to order content right now (null when the visitor switched to "All of T County"). */
  active: string | null;
  extraCommunities: string[];
  interests: InterestKey[];
  /** Whether the visitor has made any choice (or dismissed the prompt). */
  chosen: boolean;
  /** True when the one-time community prompt should be offered. */
  showPrompt: boolean;
  signedIn: boolean;
};

/**
 * Resolves the visitor's community for server components.
 * Signed-in → account fields. Guest → the plain `tct_community` cookie
 * (validated against the allowlist). Guest extras/interests live in
 * localStorage and are only used client-side, so they are empty here.
 */
export const getCommunityPreference = cache(async (): Promise<CommunityPreference> => {
  const [jar, user] = await Promise.all([cookies(), getCurrentUser()]);
  const raw = jar.get(COMMUNITY_COOKIE)?.value ?? "";
  const cookieAll = raw === ALL_COUNTY;
  const cookieCommunity = communityName(raw);
  const dismissed = jar.get(PROMPT_DISMISSED_COOKIE)?.value === "1";
  const scopeAll = jar.get(SCOPE_COOKIE)?.value === ALL_COUNTY;

  let community: string | null;
  let extraCommunities: string[] = [];
  let interests: InterestKey[] = [];
  let chosen: boolean;
  if (user) {
    community = communityName(user.homeCommunity);
    extraCommunities = cleanCommunities(user.extraCommunities, community);
    interests = cleanInterests(user.interestKeys);
    chosen = !!community || cookieAll || !!cookieCommunity || extraCommunities.length > 0 || interests.length > 0;
  } else {
    community = cookieCommunity;
    chosen = cookieAll || !!cookieCommunity;
  }
  return {
    community,
    active: scopeAll ? null : community,
    extraCommunities,
    interests,
    chosen,
    showPrompt: !chosen && !dismissed,
    signedIn: !!user,
  };
});

// ───────────── Panel data for /my-t-county/ ─────────────

const RECENT_BUSINESS_DAYS = 60;

/** Businesses published on T County Connect in the last 60 days (not "openings": we don't track opening dates). */
export async function getRecentlyAddedBusinesses(community: string | null, limit = 4) {
  const since = new Date(Date.now() - RECENT_BUSINESS_DAYS * 86400_000);
  const rows = await db.business.findMany({
    where: publicBusinessWhere({ isFoodTruck: false, publishedAt: { gte: since } }),
    orderBy: { publishedAt: "desc" },
    take: 40,
    select: businessCardSelect(),
  });
  return prioritizeByCommunity(rows, (b) => b.city, [community]).slice(0, limit);
}

const specialSelect = {
  id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true,
  business: { select: { name: true, logoUrl: true, coverUrl: true, city: true } },
} satisfies Prisma.PromotionSelect;

/** Active specials in the default homepage order (sponsored/featured/newest), with the business city for community ordering. */
export async function getSpecialsWithCity(take = 60, featuredIds: string[] = []) {
  const live = await publicPromotionWhere();
  const [featured, rest] = await Promise.all([
    featuredIds.length ? db.promotion.findMany({ where: { ...live, id: { in: featuredIds } }, select: specialSelect }) : [],
    db.promotion.findMany({ where: live, orderBy: [{ isSponsored: "desc" }, { isFeatured: "desc" }, { startsAt: "desc" }], take, select: specialSelect }),
  ]);
  const order = new Map(featuredIds.map((id, i) => [id, i]));
  const pinned = [...featured].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const seen = new Set(pinned.map((x) => x.id));
  return [...pinned, ...rest.filter((x) => !seen.has(x.id))];
}

// ───────────── "Picked for you" ─────────────

export type Pick = { id: string; title: string; href: string; start: string; allDay: boolean; city: string | null; locationName: string | null; reason: string };

/**
 * Upcoming events (next 14 days) that match the visitor's interests, ordered
 * home community first, then additional communities, then the rest of the county.
 */
export async function getPicks(interests: string[], communities: (string | null)[], limit = 6): Promise<Pick[]> {
  const matchers = cleanInterests(interests)
    .map((k) => interestByKey(k)!)
    .map((i): { label: string; where: Prisma.EventWhereInput | null } => ({ label: i.label, where: "attr" in i && i.attr ? attributeWhere(i.attr) : "category" in i && i.category ? ({ category: { slug: i.category } } as Prisma.EventWhereInput) : null }))
    .filter((m): m is { label: string; where: Prisma.EventWhereInput } => !!m.where);
  if (!matchers.length) return [];
  const now = new Date();
  const lists = await Promise.all(matchers.map((m) => getUpcomingOccurrences({ from: now, to: new Date(now.getTime() + 14 * 86400_000), where: m.where, limit: 30 })));
  const seen = new Map<string, Pick>();
  lists.forEach((list, i) => {
    for (const e of list) {
      if (seen.has(e.id)) continue;
      seen.set(e.id, {
        id: e.id, title: e.title, href: `/events/${e.slug}/`, start: e.occurrenceStart.toISOString(), allDay: e.allDay, city: e.city, locationName: e.locationName,
        reason: matchers[i].label,
      });
    }
  });
  const byTime = [...seen.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return prioritizeByCommunity(byTime, (p) => p.city, communities).slice(0, limit);
}

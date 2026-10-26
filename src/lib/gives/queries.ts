import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVE_SIGNUP_STATUSES } from "./constants";

// ───────── Public visibility rules ─────────

/**
 * Organizations visible to the public: approved (moderation), published
 * (publication) and not deleted. Ownership (claimed or not) never matters.
 */
export const publicOrgWhere = (extra: Prisma.OrganizationWhereInput = {}): Prisma.OrganizationWhereInput => ({
  status: "APPROVED",
  isPublished: true,
  deletedAt: null,
  ...extra,
});

/** In-memory twin of `publicOrgWhere` for an already-loaded organization. */
export function isOrgPublic(o: { status: string; isPublished: boolean; deletedAt: Date | null } | null | undefined): boolean {
  return !!o && o.status === "APPROVED" && o.isPublished && !o.deletedAt;
}

/** Needs shown on boards (open or partly met) from public organizations. */
export const openNeedWhere = (extra: Prisma.CommunityNeedWhereInput = {}): Prisma.CommunityNeedWhereInput => ({
  status: { in: ["OPEN", "PARTIALLY_FULFILLED"] },
  deletedAt: null,
  organization: publicOrgWhere(),
  AND: [{ OR: [{ deadline: null }, { deadline: { gte: startOfToday() } }] }, extra],
});

/** Opportunities that are published, from public orgs, and upcoming or ongoing. */
export const openOpportunityWhere = (extra: Prisma.VolunteerOpportunityWhereInput = {}, now = new Date()): Prisma.VolunteerOpportunityWhereInput => ({
  status: "PUBLISHED",
  deletedAt: null,
  organization: publicOrgWhere(),
  OR: [
    { isOngoing: true },
    { endAt: { gte: now } },
    { endAt: null, startAt: { gte: new Date(now.getTime() - 12 * 3600_000) } },
    { endAt: null, startAt: null },
  ],
  AND: [extra],
});

function startOfToday() {
  const d = new Date();
  return new Date(d.getTime() - 24 * 3600_000);
}

// ───────── Card selects ─────────

export const orgCardSelect = {
  id: true, slug: true, name: true, kind: true, orgType: true, tagline: true, mission: true, city: true, logoUrl: true, coverUrl: true,
  verifiedAt: true, isFeatured: true, denomination: true, serviceTimes: true, livestreamUrl: true,
} satisfies Prisma.OrganizationSelect;

export const needCardSelect = {
  id: true, slug: true, title: true, category: true, urgency: true, status: true, quantityNeeded: true, quantityReceived: true, unit: true,
  deadline: true, isWishList: true,
  organization: { select: { id: true, slug: true, name: true, kind: true, city: true, logoUrl: true, verifiedAt: true } },
} satisfies Prisma.CommunityNeedSelect;

export const opportunityCardSelect = {
  id: true, slug: true, title: true, startAt: true, endAt: true, isOngoing: true, locationName: true, city: true, spots: true, minAge: true,
  registrationOpen: true, externalSignupUrl: true,
  organization: { select: { id: true, slug: true, name: true, kind: true, city: true, logoUrl: true, verifiedAt: true } },
} satisfies Prisma.VolunteerOpportunitySelect;

// ───────── Aggregates (never expose PII) ─────────

/** Total pledged quantity per need (non-cancelled pledges). */
export async function pledgedTotals(needIds: string[]) {
  if (!needIds.length) return new Map<string, number>();
  const rows = await db.needPledge.groupBy({ by: ["needId"], where: { needId: { in: needIds }, status: { not: "CANCELLED" } }, _sum: { quantity: true } });
  return new Map(rows.map((r) => [r.needId, r._sum.quantity ?? 0]));
}

/** Active (spot-holding) signups per opportunity. */
export async function activeSignupCounts(oppIds: string[]) {
  if (!oppIds.length) return new Map<string, number>();
  const rows = await db.volunteerSignup.groupBy({ by: ["opportunityId"], where: { opportunityId: { in: oppIds }, status: { in: [...ACTIVE_SIGNUP_STATUSES] } }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.opportunityId, r._count._all]));
}

export function spotsLeft(spots: number | null | undefined, active: number) {
  if (spots == null) return null;
  return Math.max(0, spots - active);
}

export async function givesStats() {
  const [orgs, churches, needs, opportunities] = await Promise.all([
    db.organization.count({ where: publicOrgWhere({ kind: { not: "CHURCH" } }) }),
    db.organization.count({ where: publicOrgWhere({ kind: "CHURCH" }) }),
    db.communityNeed.count({ where: openNeedWhere() }),
    db.volunteerOpportunity.count({ where: openOpportunityWhere() }),
  ]);
  return { orgs, churches, needs, opportunities };
}

// ───────── Mutations helpers ─────────

/**
 * Recomputes CommunityNeed.quantityReceived from pledges the organization
 * confirmed, and moves the status between OPEN / PARTIALLY_FULFILLED /
 * FULFILLED. Draft and closed needs keep their status.
 */
export async function recalcNeed(needId: string) {
  const need = await db.communityNeed.findUnique({ where: { id: needId }, select: { id: true, status: true, quantityNeeded: true } });
  if (!need) return null;
  const agg = await db.needPledge.aggregate({ where: { needId, status: { in: ["RECEIVED", "PARTIALLY_RECEIVED"] } }, _sum: { receivedQuantity: true } });
  const received = agg._sum.receivedQuantity ?? 0;
  let status = need.status;
  if (["OPEN", "PARTIALLY_FULFILLED", "FULFILLED"].includes(need.status)) {
    if (need.quantityNeeded && received >= need.quantityNeeded) status = "FULFILLED";
    else if (received > 0) status = "PARTIALLY_FULFILLED";
    else status = "OPEN";
  }
  return db.communityNeed.update({ where: { id: needId }, data: { quantityReceived: received, status } });
}

/**
 * Email addresses to notify for an organization (org email + members), deduplicated.
 * Listings nobody manages yet (unclaimed / claim pending, no active members) notify
 * the site team (settings.notifyAdminEmail) instead — never an unverified address.
 */
export async function orgRecipients(orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { email: true, members: { select: { user: { select: { email: true, status: true } } } } },
  });
  if (!org) return [];
  const active = org.members.filter((m) => m.user.status === "ACTIVE").map((m) => m.user.email);
  if (!active.length) {
    const staff = (await getSettings()).notifyAdminEmail;
    return staff ? [staff.toLowerCase()] : [];
  }
  const list = [org.email, ...active].filter((e): e is string => !!e);
  return [...new Set(list.map((e) => e.toLowerCase()))];
}

export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const root = slugify(base).slice(0, 70).replace(/-+$/, "") || "item";
  if (!(await exists(root))) return root;
  for (let i = 0; i < 6; i++) {
    const s = `${root}-${crypto.randomBytes(3).toString("hex")}`;
    if (!(await exists(s))) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Slugs that would collide with static routes under /gives/claim/, /gives/, etc. */
export const RESERVED_ORG_SLUGS = new Set(["verify", "new", "register", "claim", "import", "claims", "needs", "volunteer", "organizations"]);

export const orgSlug = (name: string, id?: string) =>
  uniqueSlug(name, async (s) => RESERVED_ORG_SLUGS.has(s) || !!(await db.organization.findFirst({ where: { slug: s, ...(id ? { NOT: { id } } : {}) }, select: { id: true } })));
export const needSlug = (title: string) => uniqueSlug(title, async (s) => !!(await db.communityNeed.findUnique({ where: { slug: s }, select: { id: true } })));
export const opportunitySlug = (title: string) => uniqueSlug(title, async (s) => !!(await db.volunteerOpportunity.findUnique({ where: { slug: s }, select: { id: true } })));

/** Accept only images uploaded through our own storage (or the unchanged existing value). */
export function ownImageUrl(v: string | null | undefined, existing?: string | null): string | null {
  if (!v) return null;
  if (existing && v === existing) return v;
  if (v.startsWith("/media/") && !v.includes("..") && v.length < 500) return v;
  const pub = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  if (pub && v.startsWith(pub + "/")) return v;
  return null;
}

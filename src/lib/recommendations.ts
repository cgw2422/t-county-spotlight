import "server-only";
import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { OWN_LISTING_MESSAGE, visibleRecommendationCount } from "./recommendations-shared";

/**
 * Community recommendations — one thumbs-up per member per business.
 *
 * Integrity rules:
 *  - `Business.recommendationCount` is a cache. It changes only in the same transaction as a
 *    BusinessRecommendation insert/delete (+1 only when a row was really created, −n for n rows
 *    really deleted, never below 0). `reconcileRecommendationCounts()` recomputes it from rows.
 *  - Nobody (owners or staff) can create recommendations or edit counts; staff can only remove rows.
 *  - Membership / plans / entitlements are deliberately NOT consulted anywhere here: paid
 *    listings get no advantage in eligibility, counts, sorting or moderation.
 */

/** Same secret fallback pattern as the form-stamp / notification tokens. */
function ipSecret() {
  return process.env.FORM_SECRET || process.env.DATABASE_URL || "tcounty-form";
}

/** sha256(ip + server secret): a staff-only clustering signal; the raw IP is never stored. */
export function hashRecommendationIp(ip: string | null | undefined) {
  if (!ip || ip === "unknown") return null;
  return crypto.createHash("sha256").update(`${ip}${ipSecret()}`).digest("hex");
}

export const DAILY_NEW_RECOMMENDATION_LIMIT = 50;

export type RecommendResult =
  | { ok: true; recommended: boolean; changed: boolean; count: number; disabled: boolean }
  | { ok: false; status: number; code: "not_found" | "disabled" | "own_listing" | "daily_limit" | "inactive"; error: string };

/** Is this account an owner/manager of the business? (Self-recommendation is not allowed.) */
export async function managesBusiness(userId: string, businessId: string) {
  const link = await db.businessOwner.findUnique({ where: { userId_businessId: { userId, businessId } }, select: { userId: true } });
  return !!link;
}

/** Recommend (idempotent). Eligibility: ACTIVE account, PUBLISHED + not deleted + not disabled listing, not a manager. */
export async function recommendBusiness(user: { id: string; status: string }, businessId: string, ip?: string | null): Promise<RecommendResult> {
  if (user.status !== "ACTIVE") return { ok: false, status: 403, code: "inactive", error: "Your account can't recommend businesses right now." };
  const b = await db.business.findFirst({
    where: { id: businessId, status: "PUBLISHED", deletedAt: null },
    select: { id: true, recommendationsDisabled: true },
  });
  if (!b) return { ok: false, status: 404, code: "not_found", error: "This business can't be recommended right now." };
  if (b.recommendationsDisabled) return { ok: false, status: 409, code: "disabled", error: "Recommendations are turned off for this listing." };
  if (await managesBusiness(user.id, businessId)) return { ok: false, status: 403, code: "own_listing", error: OWN_LISTING_MESSAGE };

  const already = await db.businessRecommendation.findUnique({ where: { userId_businessId: { userId: user.id, businessId } }, select: { id: true } });
  if (!already) {
    const today = await db.businessRecommendation.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
    if (today >= DAILY_NEW_RECOMMENDATION_LIMIT) {
      return { ok: false, status: 429, code: "daily_limit", error: "You've recommended a lot of businesses today. Please try again tomorrow." };
    }
  }

  const ipHash = hashRecommendationIp(ip);
  let changed = false;
  let count = 0;
  try {
    const out = await db.$transaction(async (tx) => {
      // ON CONFLICT DO NOTHING: a duplicate (double-click, two tabs, parallel requests) inserts nothing.
      const created = await tx.businessRecommendation.createMany({ data: [{ userId: user.id, businessId, ipHash }], skipDuplicates: true });
      if (created.count === 1) {
        const upd = await tx.business.update({ where: { id: businessId }, data: { recommendationCount: { increment: 1 } }, select: { recommendationCount: true } });
        return { changed: true, count: upd.recommendationCount };
      }
      const cur = await tx.business.findUniqueOrThrow({ where: { id: businessId }, select: { recommendationCount: true } });
      return { changed: false, count: cur.recommendationCount };
    });
    changed = out.changed;
    count = out.count;
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    // Unique violation: already recommended — idempotent, no count change.
    count = (await db.business.findUnique({ where: { id: businessId }, select: { recommendationCount: true } }))?.recommendationCount ?? 0;
  }
  if (changed) await db.engagementEvent.create({ data: { type: "recommend", businessId, targetType: "BUSINESS", targetId: businessId } }).catch(() => {});
  return { ok: true, recommended: true, changed, count: visibleRecommendationCount({ recommendationCount: count }), disabled: false };
}

/** Remove the member's own recommendation (always allowed; idempotent; never below 0). */
export async function unrecommendBusiness(userId: string, businessId: string): Promise<RecommendResult> {
  const out = await db.$transaction(async (tx) => {
    const del = await tx.businessRecommendation.deleteMany({ where: { userId, businessId } });
    if (del.count > 0) {
      await tx.$executeRaw`UPDATE "Business" SET "recommendationCount" = GREATEST("recommendationCount" - ${del.count}, 0) WHERE "id" = ${businessId}`;
    }
    const cur = await tx.business.findUnique({ where: { id: businessId }, select: { recommendationCount: true, recommendationsDisabled: true } });
    return { removed: del.count, cur };
  });
  if (!out.cur) return { ok: false, status: 404, code: "not_found", error: "Business not found." };
  if (out.removed > 0) await db.engagementEvent.create({ data: { type: "unrecommend", businessId, targetType: "BUSINESS", targetId: businessId } }).catch(() => {});
  return { ok: true, recommended: false, changed: out.removed > 0, count: visibleRecommendationCount(out.cur), disabled: out.cur.recommendationsDisabled };
}

/**
 * Recompute cached counts from rows (all businesses, or just `businessIds`). Heals drift, e.g.
 * after staff removals or account deletions (rows cascade). Returns how many counts were corrected.
 */
export async function reconcileRecommendationCounts(businessIds?: string[]) {
  if (businessIds && businessIds.length === 0) return 0;
  const filter = businessIds ? Prisma.sql`WHERE b2."id" IN (${Prisma.join(businessIds)})` : Prisma.empty;
  return db.$executeRaw`
    UPDATE "Business" b SET "recommendationCount" = sub.n
    FROM (
      SELECT b2."id", COUNT(r."id")::int AS n
      FROM "Business" b2 LEFT JOIN "BusinessRecommendation" r ON r."businessId" = b2."id"
      ${filter}
      GROUP BY b2."id"
    ) sub
    WHERE b."id" = sub."id" AND b."recommendationCount" <> sub.n`;
}

/** The member's recommendation state for one business (profile page). */
export async function getRecommendationState(userId: string | null | undefined, businessId: string) {
  if (!userId) return { recommended: false, manages: false };
  const [rec, manages] = await Promise.all([
    db.businessRecommendation.findUnique({ where: { userId_businessId: { userId, businessId } }, select: { id: true } }),
    managesBusiness(userId, businessId),
  ]);
  return { recommended: !!rec, manages };
}

/** Businesses the member recommends (My T County / account), newest first. Only public listings. */
export async function getUserRecommendations(userId: string, take = 100) {
  return db.businessRecommendation.findMany({
    where: { userId, business: { status: "PUBLISHED", deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, createdAt: true, business: { select: { id: true, slug: true, name: true, city: true } } },
  });
}

// ───────── Staff moderation signals (never public) ─────────

export const UNUSUAL = {
  /** Account created less than this long before recommending. */
  newAccountMs: 48 * 3600_000,
  /** Recommendations for one business from the same ipHash. */
  sameIpPerBusiness: 3,
  /** Recommendations for one business within 24 hours. */
  burstPerBusiness24h: 10,
  /** Businesses recommended by one account within 24 hours. */
  perUser24h: 20,
  /** How far back the panel looks. */
  lookbackDays: 30,
} as const;

export type UnusualActivity = Awaited<ReturnType<typeof getUnusualActivity>>;

/** Heuristic flags for staff review. These are signals, not verdicts — nothing is removed automatically. */
export async function getUnusualActivity(businessId?: string) {
  const since = new Date(Date.now() - UNUSUAL.lookbackDays * 86400_000);
  const biz = businessId ? Prisma.sql`AND r."businessId" = ${businessId}` : Prisma.empty;
  const [newAccounts, ipClusters, bursts, heavyUsers] = await Promise.all([
    db.$queryRaw<{ id: string; businessId: string; businessName: string; userId: string; userName: string | null; email: string; userCreatedAt: Date; createdAt: Date }[]>`
      SELECT r."id", r."businessId", b."name" AS "businessName", r."userId", u."name" AS "userName", u."email", u."createdAt" AS "userCreatedAt", r."createdAt"
      FROM "BusinessRecommendation" r JOIN "User" u ON u."id" = r."userId" JOIN "Business" b ON b."id" = r."businessId"
      WHERE r."createdAt" >= ${since} AND r."createdAt" - u."createdAt" < make_interval(secs => ${UNUSUAL.newAccountMs / 1000}) ${biz}
      ORDER BY r."createdAt" DESC LIMIT 100`,
    db.$queryRaw<{ businessId: string; businessName: string; ipHash: string; n: number; first: Date; last: Date }[]>`
      SELECT r."businessId", b."name" AS "businessName", r."ipHash", COUNT(*)::int AS n, MIN(r."createdAt") AS first, MAX(r."createdAt") AS last
      FROM "BusinessRecommendation" r JOIN "Business" b ON b."id" = r."businessId"
      WHERE r."ipHash" IS NOT NULL ${biz}
      GROUP BY r."businessId", b."name", r."ipHash"
      HAVING COUNT(*) >= ${UNUSUAL.sameIpPerBusiness}
      ORDER BY n DESC LIMIT 50`,
    db.$queryRaw<{ businessId: string; businessName: string; n: number; windowStart: Date }[]>`
      SELECT DISTINCT ON (w."businessId") w."businessId", b."name" AS "businessName", w.n, w."createdAt" AS "windowStart"
      FROM (
        SELECT r."businessId", r."createdAt",
          COUNT(*) OVER (PARTITION BY r."businessId" ORDER BY r."createdAt" RANGE BETWEEN CURRENT ROW AND INTERVAL '24 hours' FOLLOWING)::int AS n
        FROM "BusinessRecommendation" r WHERE r."createdAt" >= ${since} ${biz}
      ) w JOIN "Business" b ON b."id" = w."businessId"
      WHERE w.n >= ${UNUSUAL.burstPerBusiness24h}
      ORDER BY w."businessId", w.n DESC, w."createdAt" ASC LIMIT 50`,
    businessId ? Promise.resolve([] as { userId: string; userName: string | null; email: string; n: number; windowStart: Date }[]) : db.$queryRaw<{ userId: string; userName: string | null; email: string; n: number; windowStart: Date }[]>`
      SELECT DISTINCT ON (w."userId") w."userId", u."name" AS "userName", u."email", w.n, w."createdAt" AS "windowStart"
      FROM (
        SELECT r."userId", r."createdAt",
          COUNT(*) OVER (PARTITION BY r."userId" ORDER BY r."createdAt" RANGE BETWEEN CURRENT ROW AND INTERVAL '24 hours' FOLLOWING)::int AS n
        FROM "BusinessRecommendation" r WHERE r."createdAt" >= ${since}
      ) w JOIN "User" u ON u."id" = w."userId"
      WHERE w.n > ${UNUSUAL.perUser24h}
      ORDER BY w."userId", w.n DESC, w."createdAt" ASC LIMIT 50`,
  ]);
  return { newAccounts, ipClusters, bursts, heavyUsers };
}

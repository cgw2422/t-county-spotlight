import { db } from "./db";
import { descriptionLength } from "./description";
import type { Prisma } from "@/generated/prisma/client";

export { descriptionLength };

/**
 * Per-business-listing membership entitlements — the single source of truth
 * for every membership limit. Enforced on the server (actions, API routes,
 * public rendering); the UI only mirrors them.
 *
 * Entitlements come only from verified subscription records (Stripe webhook
 * synced or manually granted by an admin) — never from a checkout redirect.
 * Organizations (nonprofits, churches) never use these: they're always free.
 */
export type Entitlements = {
  tier: "FREE" | "PREMIUM";
  promotions: boolean;
  events: boolean;
  updates: boolean;
  analytics: boolean;
  /** Gallery photos (logo and cover photo never count). */
  maxPhotos: number;
  /** Events associated with the listing (past and pending included); null = unlimited. */
  maxEvents: number | null;
  /** "About your business" length in characters (plain text). */
  descriptionLimit: number;
  /** Google listing link + Google rating/reviews on the profile. */
  googleReviews: boolean;
  /** Detailed services lists and menus. */
  servicesMenus: boolean;
};

export const FREE_ENTITLEMENTS: Entitlements = {
  tier: "FREE", promotions: false, events: true, updates: false, analytics: false,
  maxPhotos: 3, maxEvents: 3, descriptionLimit: 500, googleReviews: false, servicesMenus: false,
};

/** Defaults for any paid plan; a plan's stored entitlements may override individual values. */
export const PREMIUM_ENTITLEMENTS: Entitlements = {
  tier: "PREMIUM", promotions: true, events: true, updates: true, analytics: true,
  maxPhotos: 20, maxEvents: null, descriptionLimit: 2000, googleReviews: true, servicesMenus: true,
};

type StoredEntitlements = Partial<Omit<Entitlements, "tier">>;

/** Active, verified subscriptions for a business (status + period checked). */
function activeSubscriptionWhere(businessId: string) {
  return {
    businessId,
    status: { in: ["ACTIVE", "TRIALING"] as ("ACTIVE" | "TRIALING")[] },
    OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: new Date() } }],
  };
}

export async function getBusinessEntitlements(businessId: string) {
  const [subs, freePlan] = await Promise.all([
    db.subscription.findMany({ where: activeSubscriptionWhere(businessId), include: { plan: true } }),
    db.membershipPlan.findFirst({ where: { interval: "FREE" }, orderBy: { sortOrder: "asc" }, select: { entitlements: true } }),
  ]);
  // Free limits stay admin-configurable through the Free plan's stored entitlements.
  let ent: Entitlements = { ...FREE_ENTITLEMENTS, ...pick((freePlan?.entitlements ?? {}) as StoredEntitlements), tier: "FREE" };
  for (const s of subs) {
    if (s.plan.interval === "FREE") continue;
    const e = (s.plan.entitlements ?? {}) as StoredEntitlements;
    const planEnt: Entitlements = { ...PREMIUM_ENTITLEMENTS, ...pick(e) };
    ent = ent.tier === "FREE" ? planEnt : {
      tier: "PREMIUM",
      promotions: ent.promotions || planEnt.promotions,
      events: ent.events || planEnt.events,
      updates: ent.updates || planEnt.updates,
      analytics: ent.analytics || planEnt.analytics,
      maxPhotos: Math.max(ent.maxPhotos, planEnt.maxPhotos),
      maxEvents: ent.maxEvents === null || planEnt.maxEvents === null ? null : Math.max(ent.maxEvents, planEnt.maxEvents),
      descriptionLimit: Math.max(ent.descriptionLimit, planEnt.descriptionLimit),
      googleReviews: ent.googleReviews || planEnt.googleReviews,
      servicesMenus: ent.servicesMenus || planEnt.servicesMenus,
    };
  }
  const premiumSub = subs.find((s) => s.plan.interval !== "FREE");
  return { entitlements: ent, subscriptions: subs, plan: premiumSub?.plan ?? subs[0]?.plan ?? null };
}

function pick(e: StoredEntitlements): Partial<Entitlements> {
  const out: Partial<Entitlements> = {};
  for (const k of ["promotions", "events", "updates", "analytics", "googleReviews", "servicesMenus"] as const) if (typeof e[k] === "boolean") out[k] = e[k];
  if (typeof e.maxPhotos === "number") out.maxPhotos = e.maxPhotos;
  if (typeof e.descriptionLimit === "number") out.descriptionLimit = e.descriptionLimit;
  if (e.maxEvents === null || typeof e.maxEvents === "number") out.maxEvents = e.maxEvents ?? null;
  return out;
}


// ───────────── Public visibility of premium content ─────────────

/** Boolean features whose owner-created content is only public while the listing has the entitlement. */
export type GatedFeature = "promotions" | "updates";

/**
 * Prisma BusinessWhereInput matching listings that CURRENTLY have `feature`, using
 * exactly the rules of getBusinessEntitlements: the Free plan's stored entitlements
 * apply to everyone; otherwise an ACTIVE/TRIALING subscription (period not ended)
 * to a non-free plan that doesn't switch the feature off. Returns null when the
 * Free plan itself grants the feature (no restriction needed).
 *
 * Content is never deleted — it reappears automatically when the entitlement returns.
 */
export async function entitledBusinessWhere(feature: GatedFeature, now = new Date()): Promise<Prisma.BusinessWhereInput | null> {
  const plans = await db.membershipPlan.findMany({ select: { id: true, interval: true, sortOrder: true, entitlements: true } });
  const free = plans.filter((p) => p.interval === "FREE").sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const freeEnt = { ...FREE_ENTITLEMENTS, ...pick((free?.entitlements ?? {}) as StoredEntitlements) };
  if (freeEnt[feature]) return null;
  const granting = plans.filter((p) => p.interval !== "FREE" && { ...PREMIUM_ENTITLEMENTS, ...pick((p.entitlements ?? {}) as StoredEntitlements) }[feature]).map((p) => p.id);
  return {
    subscriptions: {
      some: {
        planId: { in: granting },
        status: { in: ["ACTIVE", "TRIALING"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: now } }],
      },
    },
  };
}

/**
 * Where-fragment for PUBLIC BusinessUpdate rows (general updates and New & Coming Soon
 * openings). Rule: updates an owner/manager posted for their listing are premium content
 * and only public while the listing has the `updates` entitlement. Announcements created
 * by staff (submittedById is an ADMIN/EDITOR or unknown/legacy) and announcements with no
 * listing stay public regardless of membership.
 */
export async function publicUpdateEntitlementWhere(now = new Date()): Promise<Prisma.BusinessUpdateWhereInput> {
  const ent = await entitledBusinessWhere("updates", now);
  if (!ent) return {};
  const staff = await db.user.findMany({ where: { role: { in: ["ADMIN", "EDITOR"] } }, select: { id: true } });
  return {
    OR: [
      { businessId: null },
      { submittedById: null },
      { submittedById: { in: staff.map((s) => s.id) } },
      { business: ent },
    ],
  };
}

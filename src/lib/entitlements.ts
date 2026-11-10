import { db } from "./db";

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
  const subs = await db.subscription.findMany({ where: activeSubscriptionWhere(businessId), include: { plan: true } });
  let ent: Entitlements = { ...FREE_ENTITLEMENTS };
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

/** Plain-text length used for description limits (HTML tags and entities don't count). */
export function descriptionLength(html: string | null | undefined) {
  return (html ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().length;
}

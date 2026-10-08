import { db } from "./db";

export type Entitlements = {
  promotions: boolean;
  events: boolean;
  updates: boolean;
  analytics: boolean;
  maxPhotos: number;
};

export const FREE_ENTITLEMENTS: Entitlements = { promotions: false, events: true, updates: false, analytics: false, maxPhotos: 6 };

/**
 * Entitlements come only from verified subscription records (Stripe webhook
 * synced or manually granted by an admin) — never from a checkout redirect.
 */
export async function getBusinessEntitlements(businessId: string) {
  const subs = await db.subscription.findMany({
    where: {
      businessId,
      status: { in: ["ACTIVE", "TRIALING"] },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gte: new Date() } }],
    },
    include: { plan: true },
  });
  const ent: Entitlements = { ...FREE_ENTITLEMENTS };
  for (const s of subs) {
    const e = (s.plan.entitlements ?? {}) as Partial<Entitlements>;
    ent.promotions ||= !!e.promotions;
    ent.events ||= !!e.events;
    ent.updates ||= !!e.updates;
    ent.analytics ||= !!e.analytics;
    ent.maxPhotos = Math.max(ent.maxPhotos, e.maxPhotos ?? 0);
  }
  return { entitlements: ent, subscriptions: subs, plan: subs[0]?.plan ?? null };
}

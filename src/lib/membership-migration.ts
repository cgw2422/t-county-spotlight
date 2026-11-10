/**
 * One-time update of membership plan entitlements and public plan copy to the
 * November 2026 limits. Prices, names, billing periods, Stripe IDs and
 * subscriptions are never changed. Feature lists / descriptions are only
 * replaced when they still equal the originally seeded text.
 */
import type { PrismaClient, Prisma } from "../generated/prisma/client";

const MARKER = "membershipLimitsMigration";
const VERSION = "2026-11-limits-v1";

const FREE_ENT = { promotions: false, events: true, updates: false, analytics: false, maxPhotos: 3, maxEvents: 3, descriptionLimit: 500, googleReviews: false, servicesMenus: false };
const PREMIUM_LIMITS = { maxPhotos: 20, maxEvents: null, descriptionLimit: 2000, googleReviews: true, servicesMenus: true };

const OLD = {
  free: { description: "A standard profile in the T County business directory.", features: ["Standard business profile", "Basic contact information", "Business category", "Associated editorial articles"] },
  insider: { description: "Everything you need to stay in front of local customers.", features: ["Enhanced business profile", "Expanded photo gallery", "Business-managed promotions", "Event submissions", "Business updates", "Engagement analytics"] },
  founding: { features: ["All Business Insider features", "Founding Business badge", "Annual billing — two months free"] },
};
const NEW = {
  free: { description: "Get your business discovered.", features: ["Business profile and contact details", "Up to 3 gallery photos", "500-character business description", "Up to 3 event listings"] },
  insider: { description: "Showcase more of your business.", features: ["Up to 20 gallery photos", "Expanded business description", "Detailed services and menus", "Google reviews integration", "Unlimited event listings", "Everything included in Free"] },
  founding: { features: ["Everything in Business Insider", "Up to 20 gallery photos, services and menus, Google reviews, unlimited events", "Founding Business badge", "Annual billing — two months free"] },
};
const same = (a: unknown, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

export async function runMembershipLimitsMigration(db: PrismaClient, log: (m: string) => void = console.log) {
  const done = await db.setting.findUnique({ where: { key: MARKER } });
  if ((done?.value as { version?: string } | null)?.version === VERSION) return { skipped: true };
  const changes: string[] = [];
  for (const plan of await db.membershipPlan.findMany()) {
    const ent = (plan.entitlements ?? {}) as Record<string, unknown>;
    const data: Prisma.MembershipPlanUpdateInput = {};
    if (plan.interval === "FREE") data.entitlements = { ...ent, ...FREE_ENT };
    else data.entitlements = { ...ent, ...PREMIUM_LIMITS };
    const copy = plan.slug === "free" ? ["free", OLD.free, NEW.free] as const : plan.slug === "business-insider" ? ["insider", OLD.insider, NEW.insider] as const : plan.slug === "founding-business" ? ["founding", OLD.founding, NEW.founding] as const : null;
    if (copy) {
      const [, oldC, newC] = copy;
      if (same(plan.features, oldC.features)) data.features = newC.features;
      if ("description" in oldC && "description" in newC && plan.description === oldC.description) data.description = newC.description;
    }
    await db.membershipPlan.update({ where: { id: plan.id }, data });
    changes.push(`${plan.slug}: entitlements${data.features ? " + features" : ""}${data.description ? " + description" : ""}`);
  }
  await db.setting.upsert({
    where: { key: MARKER },
    create: { key: MARKER, value: { version: VERSION, at: new Date().toISOString(), changes } },
    update: { value: { version: VERSION, at: new Date().toISOString(), changes } },
  });
  log(`[membership] limits applied: ${changes.join("; ") || "no plans"}`);
  return { skipped: false, changes };
}

/**
 * One-time T County Connect rebrand of stored configuration.
 *
 * Only values that still EXACTLY equal the old TCountySpotlight defaults are
 * changed, so anything an administrator customized is kept. Logos/favicons
 * that the WordPress importer copied from the old site are cleared (they are
 * the old brand) — the previous values are saved under `preRebrandBranding`
 * for rollback. Articles, businesses, organizations, users, subscribers and
 * URLs are never touched. Safe to run repeatedly (guarded by a marker).
 */
import type { PrismaClient, Prisma } from "../generated/prisma/client";

const MARKER = "brandMigration";
const VERSION = "tcc-2026-11";

const NAME = "T County Connect";
const HEADLINE = "Discover more of T County.";
const DESCRIPTION = "Explore local businesses, upcoming events, community news, specials, jobs, churches and nonprofits across Tuscarawas County.";

/** key → [old default value, new value] */
const SETTING_DEFAULTS: Record<string, [unknown, unknown]> = {
  siteName: ["TCountySpotlight", NAME],
  pwaName: ["TCountySpotlight", NAME],
  emailFromName: ["TCountySpotlight", NAME],
  tagline: ["Tuscarawas County Spotlight", HEADLINE],
  seoDefaultTitle: ["TCountySpotlight — Discover Tuscarawas County, Ohio", `${NAME} — Discover more of T County`],
  heroHeadline: ["Discover Tuscarawas County", HEADLINE],
  heroSubheadline: ["Local businesses. Community events. Great food. Things to do. Stories that make T-County special.", DESCRIPTION],
  description: ["Local businesses. Community events. Great food. Things to do. Stories that make T-County special.", DESCRIPTION],
  seoDefaultDescription: ["Local businesses, community events, food, specials, and business spotlights from across Tuscarawas County, Ohio.", DESCRIPTION],
  footerText: ["Celebrating the people, places, and businesses of Tuscarawas County, Ohio.", "Bringing local people, businesses, and community information together across Tuscarawas County, Ohio."],
  pwaShortName: ["T-County", "T County"],
  pwaThemeColor: ["#16325c", "#0B2340"],
  pwaBackgroundColor: ["#ffffff", "#F7F8F5"],
};

export async function runBrandMigration(db: PrismaClient, log: (m: string) => void = console.log) {
  const done = await db.setting.findUnique({ where: { key: MARKER } });
  if ((done?.value as { version?: string } | null)?.version === VERSION) return { skipped: true };
  const changes: string[] = [];

  // 1) Site settings still holding old defaults
  for (const [key, [oldV, newV]] of Object.entries(SETTING_DEFAULTS)) {
    const row = await db.setting.findUnique({ where: { key } });
    if (row && row.value === oldV) {
      await db.setting.update({ where: { key }, data: { value: newV as Prisma.InputJsonValue } });
      changes.push(`setting ${key}`);
    }
  }

  // 2) Old-brand logo/favicon copied from the WordPress site → clear (keep a rollback copy)
  const saved: Record<string, unknown> = {};
  for (const key of ["logoUrl", "logoDarkUrl", "faviconUrl"]) {
    const row = await db.setting.findUnique({ where: { key } });
    const url = typeof row?.value === "string" ? row.value : null;
    if (!url) continue;
    const media = await db.media.findFirst({ where: { url }, select: { sourceUrl: true } });
    if (media?.sourceUrl) {
      saved[key] = url;
      await db.setting.update({ where: { key }, data: { value: null as unknown as Prisma.InputJsonValue } });
      changes.push(`cleared imported old-brand ${key}`);
    }
  }
  if (Object.keys(saved).length) {
    await db.setting.upsert({ where: { key: "preRebrandBranding" }, create: { key: "preRebrandBranding", value: saved as Prisma.InputJsonValue }, update: {} });
  }

  // 3) Newsletter settings (stored as one JSON object)
  const nl = await db.setting.findUnique({ where: { key: "newsletter" } });
  if (nl && nl.value && typeof nl.value === "object") {
    const v = { ...(nl.value as Record<string, unknown>) };
    let touched = false;
    if (v.fromName === "T-County Weekly" || v.fromName === "The T-County Weekly" || v.fromName === "TCountySpotlight") { v.fromName = "T County Connect Weekly"; touched = true; }
    if (v.consentVersion === "2026-10-v1") { v.consentVersion = "2026-11-tcc-v1"; touched = true; } // new signups use the new wording
    if (touched) { await db.setting.update({ where: { key: "newsletter" }, data: { value: v as Prisma.InputJsonValue } }); changes.push("newsletter sender name / consent version"); }
  }

  // 4) Seeded homepage hero and menu labels (only if never edited)
  const hero = await db.homepageSection.findUnique({ where: { key: "hero" } });
  if (hero?.title === "Discover Tuscarawas County") {
    await db.homepageSection.update({ where: { key: "hero" }, data: { title: HEADLINE } });
    changes.push("homepage hero headline");
  }
  const menu = await db.menuItem.updateMany({ where: { label: "T-County Weekly newsletter" }, data: { label: "T County Connect Weekly" } });
  if (menu.count) changes.push(`menu label ×${menu.count}`);

  await db.setting.upsert({
    where: { key: MARKER },
    create: { key: MARKER, value: { version: VERSION, at: new Date().toISOString(), changes } },
    update: { value: { version: VERSION, at: new Date().toISOString(), changes } },
  });
  log(`[brand] T County Connect migration applied: ${changes.length ? changes.join(", ") : "nothing to change"}`);
  return { skipped: false, changes };
}

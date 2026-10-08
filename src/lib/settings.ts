import { cache } from "react";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export type SiteSettings = {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
  heroHeadline: string;
  heroSubheadline: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  socials: { facebook?: string; instagram?: string; x?: string; youtube?: string; tiktok?: string; linkedin?: string };
  footerText: string;
  seoDefaultTitle: string;
  seoDefaultDescription: string;
  seoDefaultImage: string | null;
  bannerEnabled: boolean;
  bannerText: string;
  bannerLink: string;
  pwaName: string;
  pwaShortName: string;
  pwaThemeColor: string;
  pwaBackgroundColor: string;
  emailFromName: string;
  emailFromAddress: string;
  notifyAdminEmail: string;
  requireEventApproval: boolean;
  requirePromotionApproval: boolean;
  requireUpdateApproval: boolean;
  paymentsEnabled: boolean;
  stripeMode: "test" | "live";
  membershipIntro: string;
  sponsoredLabel: string;
};

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "TCountySpotlight",
  tagline: "Tuscarawas County Spotlight",
  description: "Local businesses. Community events. Great food. Things to do. Stories that make T-County special.",
  logoUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  heroImageUrl: null,
  heroHeadline: "Discover Tuscarawas County",
  heroSubheadline: "Local businesses. Community events. Great food. Things to do. Stories that make T-County special.",
  contactEmail: "",
  contactPhone: "",
  address: "Tuscarawas County, Ohio",
  socials: {},
  footerText: "Celebrating the people, places, and businesses of Tuscarawas County, Ohio.",
  seoDefaultTitle: "TCountySpotlight — Discover Tuscarawas County, Ohio",
  seoDefaultDescription: "Local businesses, community events, food, specials, and business spotlights from across Tuscarawas County, Ohio.",
  seoDefaultImage: null,
  bannerEnabled: false,
  bannerText: "",
  bannerLink: "",
  pwaName: "TCountySpotlight",
  pwaShortName: "T-County",
  pwaThemeColor: "#16325c",
  pwaBackgroundColor: "#ffffff",
  emailFromName: "TCountySpotlight",
  emailFromAddress: "",
  notifyAdminEmail: "",
  requireEventApproval: true,
  requirePromotionApproval: true,
  requireUpdateApproval: true,
  paymentsEnabled: false,
  stripeMode: "test",
  membershipIntro: "Get your business in front of Tuscarawas County residents.",
  sponsoredLabel: "Sponsored",
};

export const getSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const rows = await db.setting.findMany();
    const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = r.value;
    return out as SiteSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
});

export async function saveSettings(patch: Partial<SiteSettings>) {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    await db.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }
}

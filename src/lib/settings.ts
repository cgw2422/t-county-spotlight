import { BRAND } from "./brand";
import { cache } from "react";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

export type SiteSettings = {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  /** Official T County Connect logo, original artwork. Header logo, favicons, app icons and social images are generated from it. */
  brandLogoUrl: string | null;
  /** Optional official icon/mark artwork. When set, icons use it instead of the mark cropped from the logo. */
  brandIconUrl: string | null;
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
  siteName: BRAND.name,
  tagline: BRAND.headline,
  description: BRAND.description,
  logoUrl: null,
  brandLogoUrl: null,
  brandIconUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  heroImageUrl: null,
  heroHeadline: BRAND.headline,
  heroSubheadline: BRAND.description,
  contactEmail: "",
  contactPhone: "",
  address: "Tuscarawas County, Ohio",
  socials: {},
  footerText: `${BRAND.purpose.replace(/\.$/, "")} across Tuscarawas County, Ohio.`,
  seoDefaultTitle: `${BRAND.name} — ${BRAND.headline.replace(/\.$/, "")}`,
  seoDefaultDescription: BRAND.description,
  seoDefaultImage: null,
  bannerEnabled: false,
  bannerText: "",
  bannerLink: "",
  pwaName: BRAND.name,
  pwaShortName: BRAND.shortName,
  pwaThemeColor: BRAND.colors.navy,
  pwaBackgroundColor: BRAND.colors.offWhite,
  emailFromName: BRAND.name,
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

/**
 * T County Connect — brand constants (client-safe, no server imports).
 * The official name is always written exactly "T County Connect".
 */
export const BRAND = {
  name: "T County Connect",
  shortName: "T County",
  formerName: "TCountySpotlight",
  region: "Tuscarawas County, Ohio",
  headline: "Discover more of T County.",
  description:
    "Explore local businesses, upcoming events, community news, specials, jobs, churches and nonprofits across Tuscarawas County.",
  purpose: "Bringing local people, businesses, and community information together.",
  newsletterName: "T County Connect Weekly",
  colors: {
    navy: "#0B2340", // County Navy
    green: "#387D14", // Hillside Green
    orange: "#FF8508", // Sunrise Orange
    offWhite: "#F7F8F5", // Off White
  },
} as const;

/** The official logo artwork shipped with the site (byte-for-byte original). Used unless an admin uploads a replacement. */
export const DEFAULT_BRAND_LOGO_URL = "/brand-source/t-county-connect-logo.png";

/** Old brand strings — used only to migrate untouched default settings. */
export const LEGACY_BRAND_VALUES = [
  "TCountySpotlight",
  "Tuscarawas County Spotlight",
  "T-County Weekly",
  "The T-County Weekly",
  "TCountySpotlight — Discover Tuscarawas County, Ohio",
] as const;

import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";
import { cache } from "react";
import { DEFAULT_NAV_LABEL, DEFAULT_NEWSLETTER_NAME, DEFAULT_SIGNUP_BUTTON, DEFAULT_SIGNUP_FOOTNOTE, DEFAULT_SIGNUP_HEADING, DEFAULT_SIGNUP_TAGLINE, newsletterCopy, type NewsletterProvider } from "./copy";
import { beehiivEnv } from "@/lib/beehiiv/client";

const KEY = "newsletter";

export type NewsletterSettings = {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  /** Physical postal mailing address (CAN-SPAM). Required before any broadcast. */
  postalAddress: string;
  consentVersion: string;
  description: string;
  /** Name used in prose and emails: "T County Connect" → "the T County Connect newsletter". */
  name: string;
  /** Navigation label and /newsletter/ page title ("Newsletter"). */
  navLabel: string;
  /** Signup card heading ("Get T County Connect in your inbox"). */
  heading: string;
  /** Supporting line under the signup heading. */
  tagline: string;
  /** Signup button ("Sign me up"), built-in and native beehiiv form. */
  button: string;
  /** Line under the native beehiiv form ("Free to join. Unsubscribe anytime."). */
  footnote: string;
  /** "Signup & sending provider". Stays "builtin" until an admin switches it. */
  provider: NewsletterProvider;
};

export const DEFAULT_NEWSLETTER_SETTINGS: NewsletterSettings = {
  fromName: "",
  fromAddress: "",
  replyTo: "",
  postalAddress: "",
  consentVersion: "2026-11-tcc-v1", // bumped: signup wording now names T County Connect Weekly
  description: "Local events, community stories, business spotlights and things to do around Tuscarawas County, Ohio — about once a week.",
  name: DEFAULT_NEWSLETTER_NAME,
  navLabel: DEFAULT_NAV_LABEL,
  heading: DEFAULT_SIGNUP_HEADING,
  tagline: DEFAULT_SIGNUP_TAGLINE,
  button: DEFAULT_SIGNUP_BUTTON,
  footnote: DEFAULT_SIGNUP_FOOTNOTE,
  provider: "builtin",
};

/** Keys from earlier versions that are no longer read (the beehiiv embed URL was replaced by the native form). */
const RETIRED_KEYS = ["beehiivEmbedUrl"] as const;

export async function getNewsletterSettings(): Promise<NewsletterSettings> {
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } });
    const v = (row?.value && typeof row.value === "object" ? row.value : {}) as Partial<NewsletterSettings>;
    const merged = { ...DEFAULT_NEWSLETTER_SETTINGS, ...Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) } as NewsletterSettings;
    for (const k of ["name", "navLabel", "heading", "tagline", "button", "footnote"] as const) if (!merged[k].trim()) merged[k] = DEFAULT_NEWSLETTER_SETTINGS[k];
    if (merged.provider !== "beehiiv") merged.provider = "builtin";
    for (const k of RETIRED_KEYS) delete (merged as Record<string, unknown>)[k];
    return merged;
  } catch {
    return DEFAULT_NEWSLETTER_SETTINGS;
  }
}

/** Fields that follow the code default while they equal it (so a future default change still applies). */
const FOLLOW_DEFAULT = ["name", "navLabel", "heading", "tagline", "button", "footnote", "provider"] as const;

export async function saveNewsletterSettings(patch: Partial<NewsletterSettings>) {
  const merged: Record<string, unknown> = { ...(await getNewsletterSettings()), ...patch };
  for (const k of FOLLOW_DEFAULT) if (merged[k] === DEFAULT_NEWSLETTER_SETTINGS[k]) delete merged[k];
  const value = merged as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/** Sending identity: newsletter settings → NEWSLETTER_FROM env → site email settings. */
export async function newsletterSender() {
  const [ns, site] = await Promise.all([getNewsletterSettings(), getSettings()]);
  const envFrom = process.env.NEWSLETTER_FROM?.trim() || "";
  const address = ns.fromAddress || (envFrom.includes("<") ? "" : envFrom) || site.emailFromAddress || "";
  const name = (ns.fromName || site.emailFromName || DEFAULT_NEWSLETTER_NAME).replace(/["<>\r\n]/g, "");
  const from = address ? `"${name}" <${address}>` : envFrom.includes("<") ? envFrom : "";
  return { from, address: address || (envFrom.match(/<([^>]+)>/)?.[1] ?? ""), name, replyTo: ns.replyTo || undefined, settings: ns, site };
}

export type NewsletterConfig = ReturnType<typeof newsletterCopy> & {
  provider: NewsletterProvider;
  /** provider = beehiiv: signups go through our native form to beehiiv's API; built-in sending is retired. */
  isBeehiiv: boolean;
  /** BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID are set on the server (values never leave the server). */
  beehiivConfigured: boolean;
};

/** Public-facing newsletter config (name, copy, provider). Cached per request. */
export const getNewsletterConfig = cache(async (): Promise<NewsletterConfig> => {
  const s = await getNewsletterSettings();
  return { ...newsletterCopy(s), provider: s.provider, isBeehiiv: s.provider === "beehiiv", beehiivConfigured: !!beehiivEnv() };
});

/** True when built-in campaign sending is retired (provider = beehiiv). Never cached, so a switch applies immediately. */
export async function builtinSendingRetired() {
  return (await getNewsletterSettings()).provider === "beehiiv";
}

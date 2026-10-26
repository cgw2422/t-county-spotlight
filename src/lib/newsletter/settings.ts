import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { Prisma } from "@/generated/prisma/client";
import { NEWSLETTER_NAME } from "./copy";

const KEY = "newsletter";

export type NewsletterSettings = {
  fromName: string;
  fromAddress: string;
  replyTo: string;
  /** Physical postal mailing address (CAN-SPAM). Required before any broadcast. */
  postalAddress: string;
  consentVersion: string;
  description: string;
};

export const DEFAULT_NEWSLETTER_SETTINGS: NewsletterSettings = {
  fromName: NEWSLETTER_NAME,
  fromAddress: "",
  replyTo: "",
  postalAddress: "",
  consentVersion: "2026-10-v1",
  description: "Local events, community stories, business spotlights and things to do around Tuscarawas County, Ohio — about once a week.",
};

export async function getNewsletterSettings(): Promise<NewsletterSettings> {
  try {
    const row = await db.setting.findUnique({ where: { key: KEY } });
    const v = (row?.value && typeof row.value === "object" ? row.value : {}) as Partial<NewsletterSettings>;
    return { ...DEFAULT_NEWSLETTER_SETTINGS, ...Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) };
  } catch {
    return DEFAULT_NEWSLETTER_SETTINGS;
  }
}

export async function saveNewsletterSettings(patch: Partial<NewsletterSettings>) {
  const value = { ...(await getNewsletterSettings()), ...patch } as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/** Sending identity: newsletter settings → NEWSLETTER_FROM env → site email settings. */
export async function newsletterSender() {
  const [ns, site] = await Promise.all([getNewsletterSettings(), getSettings()]);
  const envFrom = process.env.NEWSLETTER_FROM?.trim() || "";
  const address = ns.fromAddress || (envFrom.includes("<") ? "" : envFrom) || site.emailFromAddress || "";
  const name = (ns.fromName || site.emailFromName || NEWSLETTER_NAME).replace(/["<>\r\n]/g, "");
  const from = address ? `"${name}" <${address}>` : envFrom.includes("<") ? envFrom : "";
  return { from, address: address || (envFrom.match(/<([^>]+)>/)?.[1] ?? ""), name, replyTo: ns.replyTo || undefined, settings: ns, site };
}

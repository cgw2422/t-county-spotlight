"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { clientIp } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { countLinks } from "@/lib/garage-sales-shared";
import { cleanLeadInput, submitBusinessLead } from "@/lib/business-leads";
import { LEAD_LIMITS, normalizeWebsite } from "@/lib/business-leads-shared";

export type RecommendState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | null;

const optional = (max: number, msg: string) => z.string().trim().max(max, msg).optional();
const schema = z.object({
  businessName: z.string().trim().min(2, "Enter the business name").max(LEAD_LIMITS.name, `Keep the name under ${LEAD_LIMITS.name} characters`),
  city: z.string().trim().min(2, "Enter the city or town").max(LEAD_LIMITS.city, "That town name is too long"),
  website: optional(LEAD_LIMITS.website, "That link is too long").refine((v) => !v || !!normalizeWebsite(v), "Enter a website or Facebook page address, like example.com or facebook.com/yourbusiness"),
  category: optional(LEAD_LIMITS.category, "Choose a category from the list"),
  reason: optional(LEAD_LIMITS.reason, `Keep this under ${LEAD_LIMITS.reason.toLocaleString()} characters`),
  firstName: optional(LEAD_LIMITS.firstName, "That name is too long"),
  email: z.union([z.literal(""), z.email("Enter a valid email address, or leave it blank").max(LEAD_LIMITS.email)]).optional(),
});

/**
 * Public, no account needed. Never creates a listing and never subscribes anyone to the newsletter: it only records
 * the recommendation for staff review. Spam protection: honeypot, server-side validation, link limits, rate limits.
 */
export async function recommendBusinessAction(_: RecommendState, fd: FormData): Promise<RecommendState> {
  const get = (k: string) => String(fd.get(k) ?? "");
  const values = Object.fromEntries(["businessName", "city", "website", "category", "reason", "firstName", "email"].map((k) => [k, get(k).slice(0, 2000)]));
  // Honeypot: real people never see or fill this field. Bots get a normal-looking success and nothing is stored.
  if (get("website_url").trim()) return { ok: true };

  const r = schema.safeParse(values);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please check the highlighted fields.", fieldErrors, values };
  }
  const d = r.data;
  const field = (k: string, m: string): RecommendState => ({ error: m, fieldErrors: { [k]: m }, values });
  if (countLinks(d.businessName) > 0) return field("businessName", "Links aren't allowed in the business name. Use the website field.");
  if (countLinks(d.city) > 0) return field("city", "Enter just the city or town.");
  if (d.firstName && countLinks(d.firstName) > 0) return field("firstName", "Enter just your first name.");
  if (d.reason && countLinks(d.reason) > LEAD_LIMITS.maxLinksInReason) return field("reason", "Please include at most 2 links here.");
  if (d.category) {
    const ok = await db.businessCategory.findFirst({ where: { name: d.category }, select: { id: true } });
    if (!ok && d.category !== "Other") return field("category", "Choose a category from the list.");
  }

  const ip = await clientIp();
  if (!rateLimit(`lead-submit:${ip}`, 8, 60 * 60_000).ok || !rateLimit(`lead-submit-day:${ip}`, 30, 24 * 3600_000).ok) {
    return { error: "You've sent several recommendations recently. Thank you! Please try again in a little while.", values };
  }
  if (d.email && !rateLimit(`lead-submit-email:${d.email.toLowerCase()}`, 10, 24 * 3600_000).ok) {
    return { error: "This email has sent several recommendations today. Please try again tomorrow.", values };
  }

  await submitBusinessLead(cleanLeadInput({ ...d, website: d.website || null, category: d.category || null, email: d.email || null }), { ip });
  revalidatePath("/admin/business-recommendations/");
  return { ok: true };
}

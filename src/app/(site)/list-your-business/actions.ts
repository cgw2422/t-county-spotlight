"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { audit } from "@/lib/audit";
import { absoluteUrl } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? sanitizePlain(v, max) : undefined));

const schema = z.object({
  businessName: z.string().trim().min(2, "Add your business name").max(150),
  contactName: opt(120),
  email: z.email("Enter a valid email").max(200),
  phone: opt(40),
  website: z.string().trim().max(300).optional().transform((v) => v || undefined)
    .refine((v) => !v || /^(https?:\/\/)?[^\s]+\.[^\s]+$/i.test(v), "Enter a valid website"),
  address: opt(200),
  city: opt(80),
  category: opt(80),
  message: opt(3000),
  wantsSpotlight: z.boolean(),
  wantsJobPosting: z.boolean(),
  claimSlug: z.string().max(120).optional(),
});

export async function submitApplication(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("fax_number")) return { ok: true, message: "Thanks! We received your application." };
  const ip = await clientIp();
  if (!rateLimit(`biz-apply:${ip}`, 5, 60 * 60_000).ok) return { error: "Too many submissions from your connection. Please try again later." };

  const get = (k: string) => fd.get(k)?.toString() || undefined;
  const parsed = schema.safeParse({
    businessName: get("businessName") ?? "", contactName: get("contactName"), email: get("email") ?? "",
    phone: get("phone"), website: get("website"), address: get("address"), city: get("city"), category: get("category"),
    message: get("message"), wantsSpotlight: fd.get("wantsSpotlight") === "on", wantsJobPosting: fd.get("wantsJobPosting") === "on",
    claimSlug: get("claimSlug"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  const user = await getCurrentUser();
  const claim = d.claimSlug ? await db.business.findFirst({ where: { slug: d.claimSlug, deletedAt: null }, select: { id: true, name: true } }) : null;
  const businessName = sanitizePlain(d.businessName, 150);

  // Gentle duplicate guard: same email + business name still pending.
  const dup = await db.businessApplication.findFirst({ where: { email: { equals: d.email, mode: "insensitive" }, businessName: { equals: businessName, mode: "insensitive" }, status: "PENDING" }, select: { id: true } });
  if (dup) return { ok: true, message: "We already have your application and will be in touch soon. Thanks for your patience!" };

  const website = d.website ? (/^https?:\/\//i.test(d.website) ? d.website : `https://${d.website}`) : undefined;
  const app = await db.businessApplication.create({
    data: {
      businessName, contactName: d.contactName, email: d.email.toLowerCase(), phone: d.phone, website,
      address: d.address, city: d.city, category: d.category, message: d.message, wantsSpotlight: d.wantsSpotlight,
      data: { wantsJobPosting: d.wantsJobPosting, claim: claim ? { businessId: claim.id, name: claim.name } : null, source: "public_form" },
      userId: user?.id, businessId: claim?.id,
    },
  });
  await audit(user?.id, "application.submit", "BusinessApplication", app.id, { businessName, claim: !!claim });

  const settings = await getSettings();
  if (settings.notifyAdminEmail) {
    await sendEmail(
      settings.notifyAdminEmail,
      `${claim ? "Listing claim" : "New business application"}: ${businessName}`,
      [
        `Business: ${businessName}${claim ? ` (claiming existing listing)` : ""}`,
        `Contact: ${d.contactName ?? "—"} <${d.email}> ${d.phone ?? ""}`,
        `Town: ${d.city ?? "—"} · Category: ${d.category ?? "—"}`,
        `Wants spotlight: ${d.wantsSpotlight ? "yes" : "no"} · Wants job posting: ${d.wantsJobPosting ? "yes" : "no"}`,
        "", d.message ?? "", "", `Review: ${absoluteUrl("/admin/applications/")}`,
      ].join("\n"),
    );
  }
  await sendEmail(d.email, `We received your application — ${settings.siteName}`, `Hi${d.contactName ? ` ${d.contactName}` : ""},\n\nThanks for applying to list ${businessName} on ${settings.siteName}. Our team reviews every application and will reach out within a few business days.\n\n— ${settings.siteName}`);

  return { ok: true, message: `Thanks! We received your application for ${businessName}. Our team will review it and reach out at ${d.email} within a few business days.` };
}

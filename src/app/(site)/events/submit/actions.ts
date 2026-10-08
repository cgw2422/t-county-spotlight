"use server";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser, isStaff } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { audit } from "@/lib/audit";
import { absoluteUrl, fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { nyDateKey } from "@/components/public/dates";

const optionalUrl = z.string().trim().max(500).optional().transform((v) => v || undefined)
  .refine((v) => !v || /^https?:\/\/[^\s]+\.[^\s]+/i.test(v), "Enter a full link starting with https://");

const schema = z.object({
  title: z.string().trim().min(3, "Add an event title").max(150),
  description: z.string().trim().max(5000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  allDay: z.boolean(),
  locationName: z.string().trim().max(150).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, "Add the town").max(80),
  categoryId: z.string().max(40).optional(),
  organizer: z.string().trim().max(150).optional(),
  ticketUrl: optionalUrl,
  isFree: z.boolean(),
  price: z.string().trim().max(80).optional(),
  imageUrl: z.string().trim().max(500).optional(),
  businessId: z.string().max(40).optional(),
  email: z.string().trim().max(200).optional(),
});

function toHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function submitEvent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // Honeypot: real people never fill this hidden field.
  if (fd.get("company_website")) return { ok: true, message: "Thanks! Your event was submitted for review." };

  const ip = await clientIp();
  if (!rateLimit(`event-submit:${ip}`, 5, 60 * 60_000).ok) return { error: "You’ve submitted several events recently. Please try again in an hour." };

  const user = await getCurrentUser();
  const get = (k: string) => fd.get(k)?.toString() ?? "";
  const parsed = schema.safeParse({
    title: get("title"), description: get("description") || undefined,
    startDate: get("startDate"), startTime: get("startTime"), endDate: get("endDate"), endTime: get("endTime"),
    allDay: fd.get("allDay") === "on",
    locationName: get("locationName") || undefined, address: get("address") || undefined, city: get("city"),
    categoryId: get("categoryId") || undefined, organizer: get("organizer") || undefined,
    ticketUrl: get("ticketUrl") || undefined, isFree: fd.get("isFree") === "on", price: get("price") || undefined,
    imageUrl: get("imageUrl") || undefined, businessId: get("businessId") || undefined, email: get("email") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;

  const email = user?.email ?? d.email;
  if (!user && (!email || !z.email().safeParse(email).success)) return { error: "Please add your email so we can follow up.", fieldErrors: { email: "Enter a valid email" } };
  if (!d.allDay && !d.startTime) return { error: "Add a start time, or mark the event as all day.", fieldErrors: { startTime: "Add a start time" } };

  const startAt = fromDateInput(`${d.startDate}T${d.allDay ? "00:00" : d.startTime}`);
  if (!startAt) return { error: "Invalid start date.", fieldErrors: { startDate: "Invalid date" } };
  if (startAt.getTime() < Date.now() - 86400_000) return { error: "That date has already passed.", fieldErrors: { startDate: "Pick a future date" } };
  let endAt: Date | null = null;
  if (d.endDate || d.endTime) {
    endAt = fromDateInput(`${d.endDate || d.startDate}T${d.allDay ? "23:59" : d.endTime || "23:59"}`);
    if (endAt && endAt < startAt) return { error: "The event ends before it starts.", fieldErrors: { endTime: "Check the end time" } };
  } else if (d.allDay) {
    endAt = fromDateInput(`${d.startDate}T23:59`);
  }

  // Only owners/staff may link an event to a business.
  let businessId: string | null = null;
  if (d.businessId && user) {
    const ok = isStaff(user) || (await db.businessOwner.findUnique({ where: { userId_businessId: { userId: user.id, businessId: d.businessId } } }));
    if (ok) businessId = d.businessId;
  }
  const categoryId = d.categoryId ? (await db.eventCategory.findUnique({ where: { id: d.categoryId }, select: { id: true } }))?.id ?? null : null;
  const imageUrl = d.imageUrl && (d.imageUrl.startsWith("/media/") || /^https:\/\//.test(d.imageUrl)) && user && (isStaff(user) || businessId) ? d.imageUrl : null;

  const title = sanitizePlain(d.title, 150);
  const city = sanitizePlain(d.city, 80);
  const dedupeKey = crypto.createHash("sha256").update(`${title.toLowerCase()}|${nyDateKey(startAt)}|${city.toLowerCase()}`).digest("hex");
  const existing = await db.event.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (existing) return { ok: true, message: "Good news — this event is already on our calendar (or waiting for review). Thanks for letting us know!" };

  const settings = await getSettings();
  const publish = !settings.requireEventApproval && isStaff(user);
  let slug = slugify(`${title} ${nyDateKey(startAt)}`);
  if (await db.event.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;

  try {
    const ev = await db.event.create({
      data: {
        slug, title, dedupeKey, startAt, endAt, allDay: d.allDay,
        description: d.description ? toHtml(sanitizePlain(d.description, 5000)) : null,
        locationName: sanitizePlain(d.locationName, 150) || null,
        address: sanitizePlain(d.address, 200) || null,
        city,
        organizer: sanitizePlain(d.organizer, 150) || null,
        ticketUrl: d.ticketUrl ?? null,
        isFree: d.isFree,
        price: d.isFree ? null : sanitizePlain(d.price, 80) || null,
        imageUrl, businessId, categoryId,
        status: publish ? "PUBLISHED" : "PENDING",
        submittedById: user?.id ?? null,
        submitterEmail: email ?? null,
      },
    });
    await audit(user?.id, publish ? "event.publish" : "event.submit", "Event", ev.id, { title, source: "public_form" });
    if (settings.notifyAdminEmail && !publish) {
      await sendEmail(settings.notifyAdminEmail, `New event submitted: ${title}`, `${title}\n${nyDateKey(startAt)} · ${city}\nSubmitted by: ${email ?? "unknown"}\n\nReview it in the admin: ${absoluteUrl("/admin/events/")}`);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { ok: true, message: "This event has already been submitted. Thanks!" };
    console.error("[event-submit]", e);
    return { error: "Something went wrong saving your event. Please try again." };
  }
  return {
    ok: true,
    message: publish
      ? "Your event is published and now on the calendar."
      : "Thanks! Your event was submitted. Our team reviews submissions within a day or two — we’ll email you once it’s live.",
  };
}

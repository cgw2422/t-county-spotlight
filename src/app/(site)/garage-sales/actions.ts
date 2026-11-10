"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser, isStaff } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizePlain } from "@/lib/sanitize";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { absoluteUrl, TUSCARAWAS_CITIES } from "@/lib/utils";
import { addDaysKey, isDateKey, nyDateKey, startOfNyDay } from "@/components/public/dates";
import type { ActionState } from "@/components/ui/form-message";
import { emailManageLink, findSaleByToken, formAgeSeconds, newManageToken, todayKey, uniqueGarageSaleSlug } from "@/lib/garage-sales";
import { countLinks, GARAGE_SALE_CATEGORIES, GARAGE_SALE_LIMITS, GARAGE_SALE_TYPES } from "@/lib/garage-sales-shared";
import type { GarageSale } from "@/generated/prisma/client";

const TYPE_VALUES = GARAGE_SALE_TYPES.map((t) => t.value) as [string, ...string[]];
const CATEGORY_KEYS = new Set<string>(GARAGE_SALE_CATEGORIES.map((c) => c.key));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z.object({
  title: z.string().trim().min(3, "Add a title (at least 3 characters)").max(120, "Keep the title under 120 characters"),
  saleType: z.enum(TYPE_VALUES, { message: "Choose the kind of sale" }),
  description: z.string().trim().max(2000, "Keep the description under 2,000 characters").optional(),
  startDate: z.string().refine(isDateKey, "Pick the first day"),
  endDate: z.string().refine(isDateKey, "Pick the last day"),
  dailyStart: z.string().regex(HHMM, "Add a start time"),
  dailyEnd: z.string().regex(HHMM, "Add an end time"),
  address: z.string().trim().min(5, "Add the street address").max(200),
  city: z.string().trim().min(2, "Add the town").max(80),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
  addressVisibility: z.enum(["EXACT", "GENERAL"], { message: "Choose how your location is shown" }),
  generalLocation: z.string().trim().max(120, "Keep the general location short").optional(),
  name: z.string().trim().max(100).optional(),
  email: z.email("Enter a valid email").max(200),
});

type Parsed = {
  data: {
    title: string; saleType: GarageSale["saleType"]; description: string | null; itemCategories: string[]; startDate: Date; endDate: Date;
    dailyStart: string; dailyEnd: string; address: string; city: string; zip: string; addressVisibility: "EXACT" | "GENERAL";
    generalLocation: string | null; photos: string[]; submitterName: string | null; submitterEmail: string;
  };
  startKey: string;
} | { error: ActionState };

function fail(message: string, field?: string): { error: ActionState } {
  return { error: { error: message, ...(field ? { fieldErrors: { [field]: message } } : {}) } };
}

/** Validates the shared submit/edit form. `original` relaxes the start-date rule for an ongoing sale. */
async function parseSaleForm(fd: FormData, original?: GarageSale | null): Promise<Parsed> {
  const get = (k: string) => fd.get(k)?.toString() ?? "";
  const r = schema.safeParse({
    title: get("title"), saleType: get("saleType"), description: get("description") || undefined,
    startDate: get("startDate"), endDate: get("endDate") || get("startDate"), dailyStart: get("dailyStart"), dailyEnd: get("dailyEnd"),
    address: get("address"), city: get("city"), zip: get("zip"), addressVisibility: get("addressVisibility"),
    generalLocation: get("generalLocation") || undefined, name: get("name") || undefined, email: get("email").trim().toLowerCase(),
  });
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: { error: "Please fix the highlighted fields.", fieldErrors } };
  }
  const d = r.data;
  const today = todayKey();
  const originalStart = original ? nyDateKey(original.startDate) : null;
  if (d.startDate !== originalStart) {
    if (d.startDate < today) return fail("The first day can't be in the past.", "startDate");
    if (d.startDate > addDaysKey(today, GARAGE_SALE_LIMITS.maxDaysAhead)) return fail(`Sales can be listed up to ${GARAGE_SALE_LIMITS.maxDaysAhead} days ahead.`, "startDate");
  }
  if (d.endDate < d.startDate) return fail("The last day must be on or after the first day.", "endDate");
  if (d.endDate < today) return fail("The last day can't be in the past.", "endDate");
  if (d.endDate > addDaysKey(d.startDate, GARAGE_SALE_LIMITS.maxSpanDays - 1)) return fail(`A sale can run for up to ${GARAGE_SALE_LIMITS.maxSpanDays} days.`, "endDate");
  if (d.dailyEnd <= d.dailyStart) return fail("The end time must be after the start time.", "dailyEnd");

  const generalLocation = sanitizePlain(d.generalLocation, 120) || null;
  if (d.addressVisibility === "GENERAL" && (!generalLocation || generalLocation.length < 3)) return fail("Describe the general location (for example “Near Front Ave & 3rd St”).", "generalLocation");

  const description = sanitizePlain(d.description, 2000) || null;
  if (description && countLinks(description) > GARAGE_SALE_LIMITS.maxLinksInDescription) return fail("Please remove the links from your description.", "description");
  if (countLinks(d.title) > 0) return fail("Links aren't allowed in the title.", "title");

  const itemCategories = [...new Set(fd.getAll("itemCategories").map(String))].filter((k) => CATEGORY_KEYS.has(k));

  const photos = [...new Set(fd.getAll("photos").map(String).filter(Boolean))];
  if (photos.length > GARAGE_SALE_LIMITS.maxPhotos) return fail(`You can add up to ${GARAGE_SALE_LIMITS.maxPhotos} photos.`, "photos");
  if (photos.length) {
    const keep = new Set(original?.photos ?? []);
    const fresh = photos.filter((p) => !keep.has(p));
    const known = fresh.length ? await db.media.count({ where: { url: { in: fresh }, deletedAt: null, mimeType: { startsWith: "image/" } } }) : 0;
    if (known !== fresh.length) return fail("One of the photos couldn't be found. Please upload it again.", "photos");
  }

  const cityInput = sanitizePlain(d.city, 80);
  const city = TUSCARAWAS_CITIES.find((c) => c.toLowerCase() === cityInput.toLowerCase()) ?? cityInput;
  return {
    startKey: d.startDate,
    data: {
      title: sanitizePlain(d.title, 120), saleType: d.saleType as GarageSale["saleType"], description, itemCategories,
      startDate: startOfNyDay(d.startDate), endDate: startOfNyDay(d.endDate), dailyStart: d.dailyStart, dailyEnd: d.dailyEnd,
      address: sanitizePlain(d.address, 200), city, zip: d.zip, addressVisibility: d.addressVisibility, generalLocation,
      photos, submitterName: sanitizePlain(d.name, 100) || null, submitterEmail: d.email,
    },
  };
}

function refresh(slug?: string) {
  revalidatePath("/garage-sales/", "layout");
  revalidatePath("/admin/garage-sales/");
  revalidatePath("/admin/submissions/");
  revalidatePath("/");
  if (slug) revalidatePath(`/garage-sales/${slug}/`);
}

export async function submitGarageSale(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // Honeypot: people never fill this hidden field. Pretend it worked.
  if (fd.get("website_url")) return { ok: true, message: "Thanks! Your sale was submitted for review." };

  const age = formAgeSeconds(String(fd.get("t") ?? ""), String(fd.get("sig") ?? ""));
  if (age === null) return { error: "This form expired. Please reload the page and try again." };
  if (age < GARAGE_SALE_LIMITS.minSecondsOnForm) return { error: "That was quick! Please take a moment to check your details, then submit again." };

  const ip = await clientIp();
  if (!rateLimit(`gs-submit:${ip}`, 5, 60 * 60_000).ok) return { error: "You've submitted several sales recently. Please try again in an hour." };
  if (fd.get("consent") !== "on") return { error: "Please confirm the listing details are accurate.", fieldErrors: { consent: "Required" } };

  const user = await getCurrentUser();
  const p = await parseSaleForm(fd);
  if ("error" in p) return p.error;
  const d = p.data;
  if (!rateLimit(`gs-submit-email:${d.submitterEmail}`, 3, 24 * 3600_000).ok) return { error: "This email has submitted several sales today. Please try again tomorrow." };

  const staff = isStaff(user);
  const { token, hash } = newManageToken();
  const slug = await uniqueGarageSaleSlug(d.title, d.city, p.startKey);
  const now = new Date();
  const sale = await db.garageSale.create({
    data: {
      ...d, slug, userId: user?.id ?? null, manageTokenHash: hash,
      status: staff ? "PUBLISHED" : "PENDING",
      ...(staff ? { publishedAt: now, reviewedById: user!.id, reviewedAt: now } : {}),
    },
  });
  await audit(user?.id, staff ? "garage_sale.publish" : "garage_sale.submit", "GarageSale", sale.id, { title: sale.title, source: "public_form" });
  await emailManageLink(d.submitterEmail, sale.title, token, { published: staff });
  const settings = await getSettings();
  if (settings.notifyAdminEmail && !staff) {
    await sendEmail(settings.notifyAdminEmail, `New garage sale submitted: ${sale.title}`, `${sale.title}\n${p.startKey} · ${sale.city}\n\nReview it: ${absoluteUrl("/admin/submissions/?type=garage_sale")}`);
  }
  refresh(sale.slug);
  return {
    ok: true,
    message: staff
      ? "Your sale is published. We emailed you a private link to edit or remove it."
      : "Thanks! We'll review your sale shortly. We emailed you a private link to edit or remove it — check your inbox.",
  };
}

/** Resolves the sale a manage request refers to: by secret token, or by the signed-in owner. */
async function saleForManage(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (token) {
    const ip = await clientIp();
    if (!rateLimit(`gs-manage:${ip}`, 30, 60 * 60_000).ok) return { error: "Too many attempts. Please try again later." } as const;
    const sale = await findSaleByToken(token);
    return sale ? ({ sale, userId: null } as const) : ({ error: "This manage link isn't valid anymore." } as const);
  }
  const user = await getCurrentUser();
  const id = String(fd.get("saleId") ?? "");
  if (!user || !id) return { error: "Please sign in to manage your sale." } as const;
  const sale = await db.garageSale.findUnique({ where: { id } });
  if (!sale || sale.userId !== user.id) return { error: "Sale not found." } as const;
  return { sale, userId: user.id } as const;
}

export async function updateGarageSale(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("website_url")) return { ok: true, message: "Saved." };
  const r = await saleForManage(fd);
  if ("error" in r) return { error: r.error };
  const { sale } = r;
  if (sale.status === "REMOVED") return { error: "This sale was removed and can't be edited." };
  const p = await parseSaleForm(fd, sale);
  if ("error" in p) return p.error;
  const goesBackToReview = sale.status !== "PENDING";
  const emailChanged = p.data.submitterEmail !== sale.submitterEmail;
  await db.garageSale.update({
    where: { id: sale.id },
    data: { ...p.data, status: "PENDING", rejectionReason: null, ...(goesBackToReview ? { reviewedAt: null, reviewedById: null } : {}) },
  });
  await audit(r.userId, "garage_sale.edit", "GarageSale", sale.id, { title: p.data.title, from: sale.status, by: r.userId ? "account" : "manage_link" });
  if (emailChanged) {
    // Re-issue the manage link to the new address; the old link stops working.
    const { token, hash } = newManageToken();
    await db.garageSale.update({ where: { id: sale.id }, data: { manageTokenHash: hash } });
    await emailManageLink(p.data.submitterEmail, p.data.title, token, { published: false, resubmitted: true });
  }
  refresh(sale.slug);
  return {
    ok: true,
    message: goesBackToReview
      ? "Changes saved. Your sale will be reviewed again before it shows publicly."
      : `Changes saved. Your sale is still waiting for review.${emailChanged ? " We sent a new manage link to your new email." : ""}`,
  };
}

export async function removeGarageSale(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await saleForManage(fd);
  if ("error" in r) return { error: r.error };
  if (r.sale.status === "REMOVED") return { ok: true, message: "This sale is already removed." };
  await db.garageSale.update({ where: { id: r.sale.id }, data: { status: "REMOVED", removedAt: new Date() } });
  await audit(r.userId, "garage_sale.remove", "GarageSale", r.sale.id, { title: r.sale.title, by: r.userId ? "account" : "manage_link" });
  refresh(r.sale.slug);
  return { ok: true, message: "Your sale was removed. Thanks for letting us know!" };
}

"use server";
import { focusFromForm } from "@/lib/cover";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireBusinessAccess } from "@/lib/auth";
import { descriptionLength, getBusinessEntitlements } from "@/lib/entitlements";
import { addPhotosWithinLimit, createEventWithinLimit, photoLimitMessage } from "@/lib/listing-limits";
import { sanitizePlain } from "@/lib/sanitize";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { googleListingFromForm } from "@/lib/google-places";
import { fromDateInput, slugify } from "@/lib/utils";
import { getOrCreateCustomer, getStripe } from "@/lib/stripe";
import { absoluteUrl } from "@/lib/utils";
import { DAYS, normalizeUrl, textToHtml } from "@/components/dashboard/text";
import { echoValues, type FormState } from "@/components/dashboard/fields";
import type { Prisma } from "@/generated/prisma/client";

// ───────────── helpers ─────────────

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string, max = 300) => {
  const v = str(fd, k).slice(0, max);
  return v || null;
};

/** Accept only images uploaded through our own storage (or the unchanged existing value). */
function imageUrl(v: string | null, existing?: string | null): string | null {
  if (!v) return null;
  if (existing && v === existing) return v;
  if (v.startsWith("/media/") && !v.includes("..")) return v;
  const pub = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  if (pub && v.startsWith(pub + "/")) return v;
  return null;
}

async function access(fd: FormData) {
  const businessId = str(fd, "businessId");
  if (!businessId) redirect("/dashboard/");
  return requireBusinessAccess(businessId);
}

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const root = slugify(base).slice(0, 60);
  if (!(await exists(root))) return root;
  for (let i = 0; i < 5; i++) {
    const s = `${root}-${crypto.randomBytes(3).toString("hex")}`;
    if (!(await exists(s))) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

const phoneRe = /^[0-9+().\-\s xext]{7,30}$/i;

// ───────────── Profile ─────────────

export async function updateProfileAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business } = await access(fd);
  const name = str(fd, "name").slice(0, 120);
  if (!name) return { values: echoValues(fd), error: "Please enter your business name.", fieldErrors: { name: "Required" } };

  const fieldErrors: Record<string, string> = {};
  const websiteRaw = str(fd, "website");
  const website = normalizeUrl(websiteRaw);
  if (websiteRaw && !website) fieldErrors.website = "That doesn't look like a web address (example: www.mybusiness.com).";
  const phone = opt(fd, "phone", 30);
  if (phone && !phoneRe.test(phone)) fieldErrors.phone = "Please enter a valid phone number.";
  const emailRaw = opt(fd, "email", 254);
  const email = emailRaw ? z.string().email().safeParse(emailRaw.toLowerCase()) : null;
  if (email && !email.success) fieldErrors.email = "Please enter a valid email address.";
  const zip = opt(fd, "zip", 10);
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) fieldErrors.zip = "Please enter a 5-digit ZIP code.";

  const socials: Record<string, string> = {};
  for (const k of ["facebook", "instagram", "x", "tiktok", "youtube", "linkedin"]) {
    const raw = str(fd, `social_${k}`);
    if (!raw) continue;
    const u = normalizeUrl(raw);
    if (!u) fieldErrors[`social_${k}`] = "Please paste the full link to your page.";
    else socials[k] = u;
  }

  const hours = DAYS.map((day) => {
    const closed = fd.get(`closed_${day}`) === "on";
    const open = str(fd, `open_${day}`).slice(0, 5);
    const close = str(fd, `close_${day}`).slice(0, 5);
    return { day, open: closed ? "" : open, close: closed ? "" : close, closed };
  });
  const hasHours = hours.some((h) => h.closed || h.open || h.close);
  for (const h of hours) if (!h.closed && !!h.open !== !!h.close) fieldErrors.hours = `Please give both an opening and closing time for ${h.day} (or mark it closed).`;

  const { entitlements } = await getBusinessEntitlements(business.id);
  // Google listing fields are a Premium feature: without it, submitted Google fields are ignored and stored values kept.
  const google = entitlements.googleReviews ? await googleListingFromForm(fd, business) : ({ skip: true } as const);
  if (!google.skip && google.fieldErrors) Object.assign(fieldErrors, google.fieldErrors);

  // Only rewrite the description when the owner actually changed the text (keeps imported formatting otherwise).
  const norm = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\r\n/g, "\n").trim();
  const desc = norm(fd.get("description")).slice(0, 8000);
  const descChanged = desc !== norm(fd.get("descriptionOriginal"));
  const descHtml = desc ? textToHtml(desc) : null;
  if (descChanged && descriptionLength(descHtml) > entitlements.descriptionLimit) {
    fieldErrors.description = `Please shorten your description to ${entitlements.descriptionLimit.toLocaleString("en-US")} characters or fewer (it's ${descriptionLength(descHtml).toLocaleString("en-US")} now).`;
  }

  if (Object.keys(fieldErrors).length) return { values: echoValues(fd), error: "Please fix the highlighted fields.", fieldErrors };

  const categoryIds = fd.getAll("categoryIds").map(String).slice(0, 5);
  const validCats = categoryIds.length ? await db.businessCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true } }) : [];

  const data: Prisma.BusinessUpdateInput = {
    name,
    tagline: opt(fd, "tagline", 160),
    logoUrl: imageUrl(opt(fd, "logoUrl", 500), business.logoUrl),
    coverUrl: imageUrl(opt(fd, "coverUrl", 500), business.coverUrl),
    ...focusFromForm(fd),
    address: opt(fd, "address", 200),
    city: opt(fd, "city", 80),
    zip,
    phone,
    email: email && email.success ? email.data : null,
    emailPublic: fd.get("emailPublic") === "on",
    website,
    socials,
    hours: hasHours ? hours : [],
    categories: { set: validCats },
    ...(!google.skip && !google.fieldErrors ? google.data : {}),
  };
  if (descChanged) data.description = descHtml;

  await db.business.update({ where: { id: business.id }, data });
  await audit(user.id, "business.owner_update", "Business", business.id, { fields: Object.keys(data) });
  if (!google.skip && !google.fieldErrors && google.changes) await audit(user.id, "business.google_listing", "Business", business.id, google.changes as Prisma.InputJsonValue);
  revalidatePath(`/dashboard/${business.id}/`, "layout");
  revalidatePath(`/business/${business.slug}/`);
  return { message: `Saved! Your changes are live on your listing.${!google.skip && !google.fieldErrors && google.note ? ` ${google.note}` : ""}` };
}

// ───────────── Photos ─────────────
// Gallery photos only — the logo and cover photo never count toward the plan limit.

export type GalleryAddResult = { ok: boolean; added: number; rejected: number; error?: string; message?: string };

/**
 * Adds already-uploaded gallery photos (from the multi-photo uploader). Runs under a
 * Business row lock so simultaneous uploads or replayed calls can't exceed the plan limit.
 */
export async function addGalleryPhotos(businessId: string, items: { url: string; alt?: string | null }[]): Promise<GalleryAddResult> {
  if (typeof businessId !== "string" || !businessId) return { ok: false, added: 0, rejected: 0, error: "Missing listing." };
  const { user, business } = await requireBusinessAccess(businessId);
  const list = (Array.isArray(items) ? items : []).slice(0, 50);
  const clean = list
    .map((i) => ({ url: imageUrl(typeof i?.url === "string" ? i.url.slice(0, 500) : null), alt: sanitizePlain(typeof i?.alt === "string" ? i.alt : "", 200) || null }))
    .filter((i): i is { url: string; alt: string | null } => !!i.url);
  if (!clean.length) return { ok: false, added: 0, rejected: list.length, error: "Please upload a photo first." };
  const { entitlements } = await getBusinessEntitlements(business.id);
  const r = await addPhotosWithinLimit(business.id, entitlements.maxPhotos, clean);
  if (r.added) await audit(user.id, "business.photo_add", "Business", business.id, { added: r.added, rejected: r.rejected, urls: clean.slice(0, r.added).map((c) => c.url) });
  revalidatePath(`/dashboard/${business.id}/`, "layout");
  revalidatePath(`/business/${business.slug}/`);
  const limitMsg = photoLimitMessage(entitlements.maxPhotos, entitlements.tier === "PREMIUM");
  if (!r.added) return { ok: false, added: 0, rejected: r.rejected, error: limitMsg };
  const msg = `Added ${r.added} photo${r.added === 1 ? "" : "s"}.`;
  return r.rejected
    ? { ok: true, added: r.added, rejected: r.rejected, message: msg, error: `${r.rejected} photo${r.rejected === 1 ? " wasn't" : "s weren't"} added. ${limitMsg}` }
    : { ok: true, added: r.added, rejected: 0, message: msg };
}

export async function deletePhotoAction(fd: FormData) {
  const { user, business } = await access(fd);
  const photo = await db.businessPhoto.findFirst({ where: { id: str(fd, "photoId"), businessId: business.id } });
  if (photo) {
    await db.businessPhoto.delete({ where: { id: photo.id } });
    await audit(user.id, "business.photo_remove", "Business", business.id, { photoId: photo.id, url: photo.url });
  }
  revalidatePath(`/dashboard/${business.id}/`, "layout");
  revalidatePath(`/business/${business.slug}/`);
}

export async function movePhotoAction(fd: FormData) {
  const { business } = await access(fd);
  const photos = await db.businessPhoto.findMany({ where: { businessId: business.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const i = photos.findIndex((p) => p.id === str(fd, "photoId"));
  const j = str(fd, "dir") === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= photos.length) return;
  [photos[i], photos[j]] = [photos[j], photos[i]];
  await db.$transaction(photos.map((p, idx) => db.businessPhoto.update({ where: { id: p.id }, data: { sortOrder: idx } })));
  revalidatePath(`/dashboard/${business.id}/photos/`);
  revalidatePath(`/business/${business.slug}/`);
}

/** Exactly one primary photo per listing (shown first and used when there's no cover photo). */
export async function setPrimaryPhotoAction(fd: FormData) {
  const { user, business } = await access(fd);
  const photo = await db.businessPhoto.findFirst({ where: { id: str(fd, "photoId"), businessId: business.id } });
  if (!photo) return;
  await db.$transaction([
    db.businessPhoto.updateMany({ where: { businessId: business.id, isPrimary: true }, data: { isPrimary: false } }),
    db.businessPhoto.update({ where: { id: photo.id }, data: { isPrimary: true } }),
  ]);
  await audit(user.id, "business.photo_primary", "Business", business.id, { photoId: photo.id });
  revalidatePath(`/dashboard/${business.id}/photos/`);
  revalidatePath(`/business/${business.slug}/`);
}

export async function updatePhotoAltAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { business } = await access(fd);
  const photo = await db.businessPhoto.findFirst({ where: { id: str(fd, "photoId"), businessId: business.id }, select: { id: true } });
  if (!photo) return { error: "Photo not found." };
  await db.businessPhoto.update({ where: { id: photo.id }, data: { alt: sanitizePlain(str(fd, "alt"), 200) || null } });
  revalidatePath(`/dashboard/${business.id}/photos/`);
  revalidatePath(`/business/${business.slug}/`);
  return { ok: true, message: "Description saved." };
}

/** Over the plan limit (after a downgrade): the owner picks which photos stay public — at most maxPhotos. */
export async function setVisiblePhotosAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business } = await access(fd);
  const { entitlements } = await getBusinessEntitlements(business.id);
  const ids = [...new Set(fd.getAll("visible").map(String))];
  if (ids.length > entitlements.maxPhotos) return { error: `Please choose no more than ${entitlements.maxPhotos} photos.` };
  const owned = await db.businessPhoto.findMany({ where: { businessId: business.id, id: { in: ids } }, select: { id: true } });
  await db.$transaction([
    db.businessPhoto.updateMany({ where: { businessId: business.id }, data: { visibleOnFree: false } }),
    db.businessPhoto.updateMany({ where: { businessId: business.id, id: { in: owned.map((o) => o.id) } }, data: { visibleOnFree: true } }),
  ]);
  await audit(user.id, "business.photo_visibility", "Business", business.id, { visible: owned.map((o) => o.id), maxPhotos: entitlements.maxPhotos });
  revalidatePath(`/dashboard/${business.id}/photos/`);
  revalidatePath(`/business/${business.slug}/`);
  return { ok: true, message: owned.length ? `Saved — ${owned.length} photo${owned.length === 1 ? "" : "s"} will show on your listing.` : "Saved — your first photos will show on your listing." };
}

// ───────────── Events ─────────────

export async function saveEventAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business } = await access(fd);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.events) return { values: echoValues(fd), error: "Event submissions aren't included in your current plan." };
  const eventId = opt(fd, "eventId", 40);
  const existing = eventId ? await db.event.findFirst({ where: { id: eventId, businessId: business.id, deletedAt: null } }) : null;
  if (eventId && !existing) return { values: echoValues(fd), error: "Event not found." };
  if (existing && !["PENDING", "REJECTED", "DRAFT"].includes(existing.status)) return { values: echoValues(fd), error: "This event is already published. Contact us if it needs changes." };

  const title = str(fd, "title").slice(0, 160);
  const allDay = fd.get("allDay") === "on";
  const startAt = fromDateInput(str(fd, "startAt"));
  const endAt = fromDateInput(str(fd, "endAt"));
  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Please give your event a name.";
  if (!startAt) fieldErrors.startAt = "Please choose when the event starts.";
  if (startAt && endAt && endAt < startAt) fieldErrors.endAt = "The end must be after the start.";
  if (startAt && !existing && startAt < new Date(Date.now() - 86400_000)) fieldErrors.startAt = "This date is in the past.";
  const ticketRaw = str(fd, "ticketUrl");
  const ticketUrl = normalizeUrl(ticketRaw);
  if (ticketRaw && !ticketUrl) fieldErrors.ticketUrl = "Please enter a full web address.";
  if (Object.keys(fieldErrors).length) return { values: echoValues(fd), error: "Please fix the highlighted fields.", fieldErrors };

  const categoryId = opt(fd, "categoryId", 40);
  const validCat = categoryId ? await db.eventCategory.findUnique({ where: { id: categoryId }, select: { id: true } }) : null;
  const settings = await getSettings();
  const status = settings.requireEventApproval ? "PENDING" : "PUBLISHED";
  const desc = String(fd.get("description") ?? "").slice(0, 8000);
  const data = {
    title,
    description: desc.trim() ? textToHtml(desc) : null,
    imageUrl: imageUrl(opt(fd, "imageUrl", 500), existing?.imageUrl),
    startAt: startAt!,
    endAt,
    allDay,
    locationName: opt(fd, "locationName", 160) ?? business.name,
    address: opt(fd, "address", 200),
    city: opt(fd, "city", 80),
    ticketUrl,
    isFree: fd.get("isFree") === "on",
    price: opt(fd, "price", 80),
    categoryId: validCat?.id ?? null,
    organizer: business.name,
    status,
    rejectionReason: null,
  } as const;

  if (existing) {
    await db.event.update({ where: { id: existing.id }, data });
    await audit(user.id, "event.owner_update", "Event", existing.id, { businessId: business.id, status });
  } else {
    const slug = await uniqueSlug(title, async (s) => !!(await db.event.findUnique({ where: { slug: s }, select: { id: true } })));
    const created = await createEventWithinLimit(business.id, entitlements.maxEvents, (tx) =>
      tx.event.create({ data: { ...data, slug, businessId: business.id, submittedById: user.id, submitterEmail: user.email } }));
    if (!created.ok) return { values: echoValues(fd), error: created.error };
    const ev = created.value;
    await audit(user.id, status === "PUBLISHED" ? "event.owner_publish" : "event.owner_submit", "Event", ev.id, { businessId: business.id });
  }
  revalidatePath(`/dashboard/${business.id}/events/`);
  redirect(`/dashboard/${business.id}/events/?saved=${status === "PUBLISHED" ? "published" : "pending"}`);
}

export async function withdrawEventAction(fd: FormData) {
  const { user, business } = await access(fd);
  const ev = await db.event.findFirst({ where: { id: str(fd, "eventId"), businessId: business.id, deletedAt: null } });
  if (ev && ["PENDING", "REJECTED", "DRAFT"].includes(ev.status)) {
    await db.event.update({ where: { id: ev.id }, data: { deletedAt: new Date() } });
    await audit(user.id, "event.owner_withdraw", "Event", ev.id, { businessId: business.id });
  }
  revalidatePath(`/dashboard/${business.id}/events/`);
  redirect(`/dashboard/${business.id}/events/`);
}

/**
 * Remove an event from the listing (any status). Soft delete: the row stays for history
 * (deletedAt + ARCHIVED), disappears from the public calendar and frees an event slot.
 */
export async function removeEventAction(fd: FormData) {
  const { user, business } = await access(fd);
  const ev = await db.event.findFirst({ where: { id: str(fd, "eventId"), businessId: business.id, deletedAt: null } });
  if (ev) {
    await db.event.update({ where: { id: ev.id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
    await audit(user.id, "event.owner_remove", "Event", ev.id, { businessId: business.id, from: ev.status, title: ev.title });
  }
  revalidatePath(`/dashboard/${business.id}/`, "layout");
  revalidatePath(`/business/${business.slug}/`);
  revalidatePath("/events/");
  redirect(`/dashboard/${business.id}/events/?saved=removed`);
}

// ───────────── Specials (promotions) ─────────────

export async function saveSpecialAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business } = await access(fd);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.promotions) return { values: echoValues(fd), error: "Specials are part of a paid membership." };
  const promotionId = opt(fd, "promotionId", 40);
  const existing = promotionId ? await db.promotion.findFirst({ where: { id: promotionId, businessId: business.id, deletedAt: null } }) : null;
  if (promotionId && !existing) return { values: echoValues(fd), error: "Special not found." };
  if (existing && !["DRAFT", "PENDING", "REJECTED"].includes(existing.status)) return { values: echoValues(fd), error: "This special is already approved. End it and create a new one to make changes." };

  const title = str(fd, "title").slice(0, 140);
  const startsAt = fromDateInput(str(fd, "startsAt")) ?? new Date();
  const endsAt = fromDateInput(str(fd, "endsAt"));
  const limitRaw = str(fd, "redemptionLimit");
  const redemptionLimit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Please give your special a short headline.";
  if (endsAt && endsAt < startsAt) fieldErrors.endsAt = "The end date must be after the start date.";
  if (limitRaw && (!Number.isFinite(redemptionLimit) || redemptionLimit! < 1 || redemptionLimit! > 100000)) fieldErrors.redemptionLimit = "Enter a number, or leave blank for no limit.";
  if (Object.keys(fieldErrors).length) return { values: echoValues(fd), error: "Please fix the highlighted fields.", fieldErrors };

  const submit = str(fd, "intent") === "submit";
  const settings = await getSettings();
  const status = !submit ? "DRAFT" : settings.requirePromotionApproval ? "PENDING" : "APPROVED";
  const data = {
    title,
    description: opt(fd, "description", 4000),
    imageUrl: imageUrl(opt(fd, "imageUrl", 500), existing?.imageUrl),
    startsAt,
    endsAt,
    terms: opt(fd, "terms", 2000),
    couponCode: opt(fd, "couponCode", 40),
    redemptionLimit,
    status,
    rejectionReason: null,
  } as const;
  let id = existing?.id;
  if (existing) {
    await db.promotion.update({ where: { id: existing.id }, data });
  } else {
    const slug = await uniqueSlug(`${business.name} ${title}`, async (s) => !!(await db.promotion.findUnique({ where: { slug: s }, select: { id: true } })));
    id = (await db.promotion.create({ data: { ...data, slug, businessId: business.id, createdById: user.id } })).id;
  }
  if (submit) await audit(user.id, status === "APPROVED" ? "promotion.owner_publish" : "promotion.owner_submit", "Promotion", id, { businessId: business.id });
  revalidatePath(`/dashboard/${business.id}/specials/`);
  redirect(`/dashboard/${business.id}/specials/?saved=${status.toLowerCase()}`);
}

export async function endSpecialAction(fd: FormData) {
  const { user, business } = await access(fd);
  const p = await db.promotion.findFirst({ where: { id: str(fd, "promotionId"), businessId: business.id, deletedAt: null } });
  if (p) {
    if (["DRAFT", "PENDING", "REJECTED"].includes(p.status)) await db.promotion.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    else await db.promotion.update({ where: { id: p.id }, data: { status: "UNPUBLISHED" } });
    await audit(user.id, "promotion.owner_end", "Promotion", p.id, { businessId: business.id, from: p.status });
  }
  revalidatePath(`/dashboard/${business.id}/specials/`);
  redirect(`/dashboard/${business.id}/specials/`);
}

// ───────────── Updates ─────────────

export async function createUpdateAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business } = await access(fd);
  const { entitlements } = await getBusinessEntitlements(business.id);
  if (!entitlements.updates) return { values: echoValues(fd), error: "Business updates are part of a paid membership." };
  const title = str(fd, "title").slice(0, 140);
  const body = str(fd, "body").slice(0, 4000);
  if (!title || !body) return { values: echoValues(fd), error: "Please add a headline and a message." };
  const settings = await getSettings();
  const status = settings.requireUpdateApproval ? "PENDING" : "PUBLISHED";
  const u = await db.businessUpdate.create({ data: { businessId: business.id, title, body, imageUrl: imageUrl(opt(fd, "imageUrl", 500)), status } });
  await audit(user.id, status === "PUBLISHED" ? "update.owner_publish" : "update.owner_submit", "BusinessUpdate", u.id, { businessId: business.id });
  revalidatePath(`/dashboard/${business.id}/updates/`);
  return { ok: true, message: status === "PUBLISHED" ? "Posted! Your update is live." : "Sent for review. We'll publish it shortly." };
}

export async function deleteUpdateAction(fd: FormData) {
  const { user, business } = await access(fd);
  const u = await db.businessUpdate.findFirst({ where: { id: str(fd, "updateId"), businessId: business.id } });
  if (u) {
    await db.businessUpdate.delete({ where: { id: u.id } });
    await audit(user.id, "update.owner_delete", "BusinessUpdate", u.id, { businessId: business.id });
  }
  revalidatePath(`/dashboard/${business.id}/updates/`);
}

// ───────────── Membership / Stripe ─────────────

export async function startCheckoutAction(fd: FormData) {
  const { user, business } = await access(fd);
  const back = `/dashboard/${business.id}/membership/`;
  const settings = await getSettings();
  const stripe = getStripe();
  const plan = await db.membershipPlan.findUnique({ where: { id: str(fd, "planId") } });
  if (!settings.paymentsEnabled || !stripe || !plan || !plan.isActive || !plan.stripePriceId || plan.interval === "FREE") redirect(`${back}?checkout=unavailable`);
  const live = await db.subscription.findFirst({ where: { businessId: business.id, planId: plan.id, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } });
  if (live) redirect(`${back}?checkout=already`);

  let url: string | null = null;
  try {
    const customer = await getOrCreateCustomer(stripe, business, user.email);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      client_reference_id: business.id,
      metadata: { businessId: business.id, planId: plan.id, userId: user.id },
      subscription_data: { metadata: { businessId: business.id, planId: plan.id } },
      allow_promotion_codes: true,
      success_url: absoluteUrl(`${back}success/?session_id={CHECKOUT_SESSION_ID}`),
      cancel_url: absoluteUrl(`${back}?checkout=canceled`),
    });
    url = session.url;
    await audit(user.id, "membership.checkout_started", "Business", business.id, { planId: plan.id, sessionId: session.id });
  } catch (e) {
    console.error("[stripe] checkout failed", e);
  }
  redirect(url ?? `${back}?checkout=error`);
}

export async function buySponsorshipAction(fd: FormData) {
  const { user, business } = await access(fd);
  const back = `/dashboard/${business.id}/membership/`;
  const settings = await getSettings();
  const stripe = getStripe();
  const product = await db.sponsorshipProduct.findUnique({ where: { id: str(fd, "productId") } });
  if (!settings.paymentsEnabled || !stripe || !product || !product.isActive || !product.stripePriceId) redirect(`${back}?checkout=unavailable`);
  let url: string | null = null;
  try {
    const customer = await getOrCreateCustomer(stripe, business, user.email);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [{ price: product.stripePriceId, quantity: 1 }],
      client_reference_id: business.id,
      metadata: { businessId: business.id, productId: product.id, userId: user.id },
      invoice_creation: { enabled: true },
      success_url: absoluteUrl(`${back}success/?session_id={CHECKOUT_SESSION_ID}&type=sponsorship`),
      cancel_url: absoluteUrl(`${back}?checkout=canceled`),
    });
    url = session.url;
    await audit(user.id, "sponsorship.checkout_started", "Business", business.id, { productId: product.id, sessionId: session.id });
  } catch (e) {
    console.error("[stripe] sponsorship checkout failed", e);
  }
  redirect(url ?? `${back}?checkout=error`);
}

export async function setCancelAtPeriodEndAction(fd: FormData) {
  const { user, business } = await access(fd);
  const back = `/dashboard/${business.id}/membership/`;
  const cancel = str(fd, "cancel") === "1";
  const sub = await db.subscription.findFirst({ where: { id: str(fd, "subscriptionId"), businessId: business.id, source: "stripe", stripeSubscriptionId: { not: null } } });
  const stripe = getStripe();
  if (!sub || !stripe) redirect(`${back}?billing=unavailable`);
  let ok = false;
  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId!, { cancel_at_period_end: cancel });
    // Reflect immediately; the webhook confirms the authoritative state.
    await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: cancel } });
    await audit(user.id, cancel ? "membership.cancel_requested" : "membership.cancel_reverted", "Subscription", sub.id, { businessId: business.id });
    ok = true;
  } catch (e) {
    console.error("[stripe] cancel update failed", e);
  }
  revalidatePath(back);
  redirect(`${back}?billing=${ok ? (cancel ? "canceled" : "resumed") : "error"}`);
}

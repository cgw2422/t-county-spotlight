"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl, TUSCARAWAS_CITIES } from "@/lib/utils";
import { endOfNyDay, isDateKey, startOfNyDay } from "@/components/public/dates";
import type { ActionState } from "@/components/ui/form-message";
import { OPENING_FEATURED_DAYS, OPENING_LABELS, isOpeningKind, openingHref } from "@/lib/openings-shared";
import { notifySuggestionPublished } from "@/lib/suggestions";
import { parseForm, zOpt } from "../_lib/form";

function refresh(id?: string) {
  revalidatePath("/admin/updates/");
  if (id) revalidatePath(`/admin/updates/${id}/`);
  revalidatePath("/admin/submissions/");
  revalidatePath("/", "layout");
}

/** Homepage placement default for openings: 30 days after first publish. */
function defaultFeaturedUntil(publishedAt: Date) {
  return new Date(publishedAt.getTime() + OPENING_FEATURED_DAYS * 86400_000);
}

export async function moderateUpdate(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), decision: z.enum(["approve", "reject", "unpublish", "delete"]), reason: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const u = await db.businessUpdate.findUnique({ where: { id: p.data.id }, include: { business: { include: { owners: { include: { user: { select: { email: true } } } } } } } });
  if (!u) return { error: "Update not found." };
  const now = new Date();
  const opening = isOpeningKind(u.kind);
  if (p.data.decision === "delete") {
    await db.businessUpdate.delete({ where: { id: u.id } });
  } else if (p.data.decision === "approve") {
    const publishedAt = u.publishedAt ?? now;
    await db.businessUpdate.update({
      where: { id: u.id },
      data: {
        status: "PUBLISHED", publishedAt, reviewedById: user.id, reviewedAt: now, rejectionReason: null,
        ...(opening && !u.featuredUntil ? { featuredUntil: defaultFeaturedUntil(publishedAt) } : {}),
      },
    });
  } else if (p.data.decision === "reject") {
    await db.businessUpdate.update({ where: { id: u.id }, data: { status: "ARCHIVED", rejectionReason: p.data.reason, reviewedById: user.id, reviewedAt: now } });
  } else {
    await db.businessUpdate.update({ where: { id: u.id }, data: { status: "DRAFT" } });
  }
  await audit(user.id, `business_update.${p.data.decision}`, "BusinessUpdate", u.id, { title: u.title, kind: u.kind, business: u.business?.name ?? u.businessName, reason: p.data.reason });
  if (u.status === "PENDING" && (p.data.decision === "approve" || p.data.decision === "reject")) {
    const recipients = new Set((u.business?.owners ?? []).map((o) => o.user.email));
    if (u.submittedById) {
      const submitter = await db.user.findUnique({ where: { id: u.submittedById }, select: { email: true } });
      if (submitter) recipients.add(submitter.email);
    }
    const what = opening ? `“${OPENING_LABELS[u.kind as keyof typeof OPENING_LABELS]}” announcement` : "update";
    for (const email of recipients) {
      await sendEmail(email, p.data.decision === "approve" ? `Your update “${u.title}” is live` : `Your update “${u.title}” wasn't approved`,
        p.data.decision === "approve"
          ? `Your ${what} for ${u.business?.name ?? u.businessName ?? "your business"} is now visible on T County Connect.${opening ? `\n\n${absoluteUrl(openingHref(u))}` : ""}`
          : `We couldn't publish your ${what} “${u.title}”.${p.data.reason ? `\n\nReason: ${p.data.reason}` : ""}`);
    }
  }
  if (p.data.decision === "approve" && u.status !== "PUBLISHED" && opening) await notifySuggestionPublished(`BusinessUpdate:${u.id}`, openingHref(u));
  refresh(u.id);
  return { ok: true, message: { approve: "Update approved.", reject: "Update rejected.", unpublish: "Update unpublished.", delete: "Update deleted." }[p.data.decision] };
}

const KINDS = ["GENERAL", "COMING_SOON", "RECENTLY_OPENED", "RELOCATING", "EXPANDING"] as const;
const STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "ARCHIVED"] as const;
const dateKeyOpt = z.string().trim().optional().transform((v) => (v ? v : null)).refine((v) => !v || isDateKey(v), "Use a valid date");

const openingSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(KINDS),
  status: z.enum(STATUSES),
  businessId: zOpt(40),
  businessName: zOpt(160),
  address: zOpt(200),
  city: zOpt(100),
  cityOther: zOpt(100),
  title: z.string().trim().min(1, "Add a title").max(160, "Keep the title under 160 characters"),
  body: z.string().trim().max(6000, "Keep the description under 6,000 characters").optional().transform((v) => v ?? ""),
  effectiveDate: dateKeyOpt,
  dateNote: zOpt(80),
  linkUrl: zOpt(500).refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Link must start with https://"),
  featuredUntil: dateKeyOpt,
  photos: z.string().optional(),
});

function parsePhotos(raw: string | undefined): string[] {
  try {
    const arr = JSON.parse(raw || "[]");
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((p) => (typeof p === "string" ? p : p?.url)).filter((u): u is string => typeof u === "string" && (u.startsWith("/") || /^https?:\/\//.test(u))))].slice(0, 12);
  } catch {
    return [];
  }
}

/** Staff create/edit for New & Coming Soon entries (and general business updates). */
export async function saveOpening(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(openingSchema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const existing = d.id ? await db.businessUpdate.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Update not found." };

  const businessId: string | null = d.businessId;
  if (businessId) {
    const b = await db.business.findFirst({ where: { id: businessId, deletedAt: null }, select: { id: true } });
    if (!b) return { error: "That business listing couldn't be found.", fieldErrors: { businessId: "Not found" } };
  }
  if (!businessId && !d.businessName) return { error: "Connect a business listing or enter the business name.", fieldErrors: { businessName: "Required when no listing is connected" } };
  if (d.kind === "GENERAL" && !businessId) return { error: "General updates must be connected to a business listing.", fieldErrors: { kind: "Choose an opening status" } };

  const cityRaw = d.city === "__other" ? d.cityOther : d.city;
  const city = cityRaw ? TUSCARAWAS_CITIES.find((c) => c.toLowerCase() === cityRaw.toLowerCase()) ?? sanitizePlain(cityRaw, 100) : null;
  const photos = parsePhotos(d.photos);
  const now = new Date();
  const publishing = d.status === "PUBLISHED";
  const publishedAt = publishing ? existing?.publishedAt ?? now : existing?.publishedAt ?? null;
  const featuredUntil = d.featuredUntil
    ? endOfNyDay(d.featuredUntil)
    : publishing && isOpeningKind(d.kind) ? defaultFeaturedUntil(publishedAt!) : null;

  const data = {
    kind: d.kind, status: d.status, businessId,
    businessName: businessId ? null : sanitizePlain(d.businessName, 160),
    address: d.address ? sanitizePlain(d.address, 200) : null,
    city,
    title: sanitizePlain(d.title, 160),
    body: sanitizePlain(d.body, 6000),
    photos, imageUrl: photos[0] ?? null,
    effectiveDate: d.effectiveDate ? startOfNyDay(d.effectiveDate) : null,
    dateNote: d.dateNote ? sanitizePlain(d.dateNote, 80) : null,
    linkUrl: d.linkUrl,
    featuredUntil, publishedAt,
    ...(publishing && existing?.status !== "PUBLISHED" ? { reviewedById: user.id, reviewedAt: now, rejectionReason: null } : {}),
  };
  const saved = existing
    ? await db.businessUpdate.update({ where: { id: existing.id }, data })
    : await db.businessUpdate.create({ data: { ...data, submittedById: user.id } });
  const becamePublished = publishing && existing?.status !== "PUBLISHED";
  await audit(user.id, existing ? (becamePublished ? "business_update.publish" : "business_update.edit") : "business_update.create", "BusinessUpdate", saved.id, {
    title: saved.title, kind: saved.kind, status: saved.status, from: existing?.status ?? null, effectiveDate: d.effectiveDate, dateNote: data.dateNote,
  });
  if (becamePublished && isOpeningKind(saved.kind)) await notifySuggestionPublished(`BusinessUpdate:${saved.id}`, openingHref(saved));
  refresh(saved.id);
  if (!existing) redirect(`/admin/updates/${saved.id}/?created=1`);
  return { ok: true, message: becamePublished ? "Published." : "Saved." };
}

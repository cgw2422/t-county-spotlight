"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, isUniqueError, parseForm, uniqueSlug, zBool, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED", "UNPUBLISHED"] as const;

const schema = z.object({
  id: z.string().optional(),
  title: zReq("Title", 200),
  slug: zSlugOpt,
  description: zOpt(5000),
  imageUrl: zUrlOpt,
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  terms: zOpt(3000),
  couponCode: zOpt(60),
  redemptionLimit: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(1).max(1_000_000).nullable()),
  status: z.enum(STATUSES).default("APPROVED"),
  isFeatured: zBool,
  isSponsored: zBool,
});

export async function savePromotion(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const businessId = getAll(fd, "business")[0];
  if (!businessId) return { error: "Choose the business offering this special." };
  const existing = d.id ? await db.promotion.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Special not found." };
  const startsAt = fromDateInput(d.startsAt) ?? existing?.startsAt ?? new Date();
  const endsAt = fromDateInput(d.endsAt);
  if (endsAt && endsAt <= startsAt) return { error: "End date must be after the start date." };

  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.title), async (s) => !!(await db.promotion.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } })));
  else if (await db.promotion.findFirst({ where: { slug, NOT: { id: d.id ?? "" } }, select: { id: true } })) return { error: `The slug “${slug}” is already in use.` };

  const data = {
    title: d.title, slug, description: d.description, imageUrl: d.imageUrl, startsAt, endsAt, terms: d.terms, couponCode: d.couponCode,
    redemptionLimit: d.redemptionLimit, status: d.status, isFeatured: d.isFeatured, isSponsored: d.isSponsored, businessId,
  };
  let id = d.id;
  try {
    if (existing) await db.promotion.update({ where: { id: existing.id }, data });
    else id = (await db.promotion.create({ data: { ...data, createdById: user.id } })).id;
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }
  const changed = existing && existing.status !== d.status;
  await audit(user.id, !existing ? "promotion.create" : changed ? `promotion.${d.status === "APPROVED" ? "approve" : d.status.toLowerCase()}` : "promotion.update", "Promotion", id, { title: d.title, status: d.status });
  revalidatePath("/admin/specials");
  revalidatePath("/", "layout");
  if (!existing) redirect(`/admin/specials/${id}/?created=1`);
  return { ok: true, message: "Special saved." };
}

export async function setPromotionStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(STATUSES), reason: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const { id, status, reason } = p.data;
  if (status === "REJECTED" && !reason) return { error: "Add a reason for the business." };
  const pr = await db.promotion.findUnique({ where: { id }, include: { business: { include: { owners: { include: { user: { select: { email: true } } } } } } } });
  if (!pr) return { error: "Special not found." };
  await db.promotion.update({ where: { id }, data: { status, rejectionReason: status === "REJECTED" ? reason : null } });
  const verb = status === "APPROVED" ? "approve" : status === "REJECTED" ? "reject" : status === "UNPUBLISHED" ? "unpublish" : status.toLowerCase();
  await audit(user.id, `promotion.${verb}`, "Promotion", id, { title: pr.title, reason });
  if (pr.status === "PENDING" && (status === "APPROVED" || status === "REJECTED")) {
    for (const o of pr.business.owners) {
      await sendEmail(o.user.email, status === "APPROVED" ? `Your special “${pr.title}” was approved` : `Your special “${pr.title}” needs changes`,
        status === "APPROVED" ? `Your special for ${pr.business.name} is approved and will show on TCountySpotlight during its scheduled dates.` : `We couldn't approve your special “${pr.title}”.\n\nReason: ${reason}\n\nYou can edit and resubmit it from your business dashboard.`);
    }
  }
  revalidatePath("/admin/specials");
  revalidatePath(`/admin/specials/${id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: { approve: "Special approved.", reject: "Special rejected.", unpublish: "Special unpublished." }[verb] ?? "Status updated." };
}

export async function togglePromotionFlag(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), flag: z.enum(["isFeatured", "isSponsored"]), value: zBool }), fd);
  if (p.error) return p.error;
  const pr = await db.promotion.update({ where: { id: p.data.id }, data: { [p.data.flag]: p.data.value } });
  await audit(user.id, p.data.flag === "isFeatured" ? (p.data.value ? "promotion.feature" : "promotion.unfeature") : "promotion.update", "Promotion", pr.id, { title: pr.title, [p.data.flag]: p.data.value });
  revalidatePath("/admin/specials");
  revalidatePath("/", "layout");
  return { ok: true, message: "Updated." };
}

export async function trashPromotion(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const pr = await db.promotion.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(user.id, "promotion.trash", "Promotion", id, { title: pr.title });
  revalidatePath("/admin/specials");
  revalidatePath("/", "layout");
  redirect("/admin/specials/");
}

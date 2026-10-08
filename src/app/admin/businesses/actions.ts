"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { absoluteUrl, fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { Prisma } from "@/generated/prisma/client";
import { getAll, isUniqueError, jsonField, parseForm, uniqueSlug, zBool, zEmailOpt, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "SUSPENDED", "ARCHIVED"] as const;
const SOCIALS = ["facebook", "instagram", "x", "tiktok", "youtube", "linkedin"] as const;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const schema = z.object({
  id: z.string().optional(),
  name: zReq("Business name", 200),
  slug: zSlugOpt,
  tagline: zOpt(200),
  description: z.string().max(200_000).optional().transform((v) => v || null),
  story: z.string().max(500_000).optional().transform((v) => v || null),
  logoUrl: zUrlOpt,
  coverUrl: zUrlOpt,
  address: zOpt(300),
  city: zOpt(100),
  cityOther: zOpt(100),
  zip: zOpt(20).refine((v) => !v || /^\d{5}(-\d{4})?$/.test(v), "ZIP must be 5 digits"),
  phone: zOpt(40),
  email: zEmailOpt,
  emailPublic: zBool,
  website: zUrlOpt,
  status: z.enum(STATUSES).default("DRAFT"),
  isFeatured: zBool,
  isSpotlighted: zBool,
  seoTitle: zOpt(200),
  seoDescription: zOpt(400),
});

type Hours = { day: string; open: string; close: string; closed: boolean }[];

function parseHours(fd: FormData): Hours | null {
  const raw = jsonField<Hours>(fd, "hours", []);
  const out = DAYS.map((day) => {
    const h = raw.find((r) => r.day === day);
    const ok = (t: unknown) => (typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : "");
    return { day, open: ok(h?.open), close: ok(h?.close), closed: !!h?.closed };
  });
  return out.some((h) => h.closed || h.open || h.close) ? out : null;
}

function parseSocials(fd: FormData) {
  const out: Record<string, string> = {};
  for (const k of SOCIALS) {
    const v = String(fd.get(`social_${k}`) ?? "").trim().slice(0, 300);
    if (v) out[k] = /^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, "")}`;
  }
  return Object.keys(out).length ? out : null;
}

export async function saveBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const existing = d.id ? await db.business.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Business not found." };

  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.name), async (s) => !!(await db.business.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } })));
  else if (await db.business.findFirst({ where: { slug, NOT: { id: d.id ?? "" } }, select: { id: true } })) return { error: `The slug “${slug}” is already used by another business.` };

  const categoryIds = getAll(fd, "categories");
  const data = {
    name: d.name, slug, tagline: d.tagline, description: d.description, story: d.story, logoUrl: d.logoUrl, coverUrl: d.coverUrl,
    address: d.address, city: d.city === "__other" ? d.cityOther : d.city, zip: d.zip, phone: d.phone, email: d.email, emailPublic: d.emailPublic,
    website: d.website, status: d.status, isFeatured: d.isFeatured, isSpotlighted: d.isSpotlighted, seoTitle: d.seoTitle, seoDescription: d.seoDescription,
    socials: (parseSocials(fd) as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
    hours: (parseHours(fd) as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
    publishedAt: d.status === "PUBLISHED" ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null,
  };

  let id = d.id;
  try {
    if (existing) {
      await db.business.update({ where: { id: existing.id }, data: { ...data, categories: { set: categoryIds.map((c) => ({ id: c })) } } });
    } else {
      const b = await db.business.create({ data: { ...data, categories: { connect: categoryIds.map((c) => ({ id: c })) } } });
      id = b.id;
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }
  const statusChanged = existing && existing.status !== d.status;
  await audit(user.id, existing ? (statusChanged ? `business.${d.status === "PUBLISHED" ? "publish" : d.status.toLowerCase()}` : "business.update") : "business.create", "Business", id, {
    name: d.name, status: d.status, ...(existing && existing.isSpotlighted !== d.isSpotlighted ? { spotlight: d.isSpotlighted } : {}),
  });
  revalidatePath("/admin/businesses");
  revalidatePath("/", "layout");
  if (!existing) redirect(`/admin/businesses/${id}/?created=1`);
  return { ok: true, message: "Business saved." };
}

export async function savePhotos(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const b = await db.business.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!b) return { error: "Business not found." };
  const photos = jsonField<{ url: string; alt?: string; caption?: string }[]>(fd, "photos", [])
    .filter((x) => typeof x.url === "string" && (x.url.startsWith("/") || /^https?:\/\//.test(x.url)))
    .slice(0, 60);
  await db.$transaction([
    db.businessPhoto.deleteMany({ where: { businessId: id } }),
    db.businessPhoto.createMany({
      data: photos.map((x, i) => ({ businessId: id, url: x.url.slice(0, 2000), alt: x.alt?.slice(0, 300) || null, caption: x.caption?.slice(0, 500) || null, sortOrder: i })),
    }),
  ]);
  await audit(user.id, "business.update", "Business", id, { name: b.name, photos: photos.length });
  revalidatePath(`/admin/businesses/${id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: `Gallery saved (${photos.length} photo${photos.length === 1 ? "" : "s"}).` };
}

export async function setBusinessStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(STATUSES) }), fd);
  if (p.error) return p.error;
  const b = await db.business.update({
    where: { id: p.data.id },
    data: { status: p.data.status, ...(p.data.status === "PUBLISHED" ? { publishedAt: new Date() } : {}) },
  });
  await audit(user.id, `business.${p.data.status === "PUBLISHED" ? "publish" : p.data.status.toLowerCase()}`, "Business", b.id, { name: b.name });
  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${b.id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: `Status changed to ${p.data.status.toLowerCase()}.` };
}

export async function trashBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const b = await db.business.update({ where: { id }, data: { deletedAt: new Date(), status: "ARCHIVED" } });
  await audit(user.id, "business.trash", "Business", b.id, { name: b.name });
  revalidatePath("/admin/businesses");
  revalidatePath("/", "layout");
  redirect("/admin/businesses/?status=deleted");
}

export async function restoreBusiness(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const b = await db.business.update({ where: { id }, data: { deletedAt: null, status: "DRAFT" } });
  await audit(user.id, "business.restore", "Business", b.id, { name: b.name });
  revalidatePath("/admin/businesses");
  return { ok: true, message: "Business restored as a draft." };
}

export async function saveBusinessArticles(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const ids = getAll(fd, "articles");
  await db.$transaction([
    db.articleBusiness.deleteMany({ where: { businessId: id, articleId: { notIn: ids } } }),
    ...ids.map((articleId) => db.articleBusiness.upsert({ where: { articleId_businessId: { articleId, businessId: id } }, create: { articleId, businessId: id }, update: {} })),
  ]);
  await audit(user.id, "business.update", "Business", id, { articles: ids.length });
  revalidatePath(`/admin/businesses/${id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Linked articles saved." };
}

/** Links (or creates) a user as owner. New users get no password and must use "Forgot password". */
export async function addOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), email: zReq("Email", 200).toLowerCase().refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"), role: z.enum(["OWNER", "MANAGER"]).default("OWNER"), notify: zBool }), fd);
  if (p.error) return p.error;
  const { id, email, role, notify } = p.data;
  const b = await db.business.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!b) return { error: "Business not found." };
  let u = await db.user.findUnique({ where: { email } });
  let created = false;
  if (!u) {
    u = await db.user.create({ data: { email, role: "BUSINESS_OWNER" } });
    created = true;
  } else if (u.role === "MEMBER") {
    u = await db.user.update({ where: { id: u.id }, data: { role: "BUSINESS_OWNER" } });
    await audit(user.id, "user.role", "User", u.id, { email, from: "MEMBER", to: "BUSINESS_OWNER" });
  }
  await db.businessOwner.upsert({ where: { userId_businessId: { userId: u.id, businessId: id } }, create: { userId: u.id, businessId: id, role }, update: { role } });
  await audit(user.id, "business.owner_add", "Business", id, { name: b.name, email, role, createdUser: created });
  if (notify) {
    await sendEmail(
      email,
      `You now manage ${b.name} on TCountySpotlight`,
      `You've been added as ${role === "OWNER" ? "an owner" : "a manager"} of ${b.name} on TCountySpotlight.\n\n` +
        (created ? `An account was created for ${email}. Set your password here: ${absoluteUrl("/forgot-password/")}\n\n` : "") +
        `Sign in to manage your listing: ${absoluteUrl("/dashboard/")}`,
    );
  }
  revalidatePath(`/admin/businesses/${id}`);
  return { ok: true, message: created ? `Created an account for ${email} and linked it. They must use “Forgot password” to set a password.` : `${email} linked as ${role.toLowerCase()}.` };
}

export async function removeOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const businessId = String(fd.get("id") ?? "");
  const userId = String(fd.get("userId") ?? "");
  const link = await db.businessOwner.findUnique({ where: { userId_businessId: { userId, businessId } }, include: { user: { select: { email: true } }, business: { select: { name: true } } } });
  if (!link) return { error: "Owner link not found." };
  await db.businessOwner.delete({ where: { userId_businessId: { userId, businessId } } });
  await audit(user.id, "business.owner_remove", "Business", businessId, { name: link.business.name, email: link.user.email });
  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true, message: `Removed ${link.user.email}.` };
}

/** Admin-only: complimentary membership (Subscription source "manual"). */
export async function grantMembership(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(z.object({ id: z.string().min(1), planId: z.string().min(1, "Choose a plan"), endsAt: z.string().optional() }), fd);
  if (p.error) return p.error;
  const end = fromDateInput(p.data.endsAt);
  if (end && end < new Date()) return { error: "End date must be in the future." };
  const plan = await db.membershipPlan.findUnique({ where: { id: p.data.planId } });
  if (!plan) return { error: "Plan not found." };
  const sub = await db.subscription.create({ data: { businessId: p.data.id, planId: plan.id, source: "manual", status: "ACTIVE", currentPeriodEnd: end } });
  await audit(user.id, "membership.grant", "Subscription", sub.id, { businessId: p.data.id, plan: plan.name, endsAt: end?.toISOString() ?? null });
  revalidatePath(`/admin/businesses/${p.data.id}`);
  revalidatePath("/admin/memberships");
  return { ok: true, message: `Complimentary ${plan.name} membership granted.` };
}

export async function revokeMembership(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const subId = String(fd.get("subscriptionId") ?? "");
  const sub = await db.subscription.findUnique({ where: { id: subId }, include: { plan: true } });
  if (!sub) return { error: "Subscription not found." };
  if (sub.source !== "manual") return { error: "Stripe subscriptions must be canceled in Stripe; the webhook will sync the change." };
  await db.subscription.update({ where: { id: subId }, data: { status: "CANCELED", currentPeriodEnd: new Date() } });
  await audit(user.id, "membership.revoke", "Subscription", sub.id, { businessId: sub.businessId, plan: sub.plan.name });
  revalidatePath(`/admin/businesses/${sub.businessId}`);
  revalidatePath("/admin/memberships");
  return { ok: true, message: "Membership revoked." };
}

// ───────── Business categories ─────────

export async function saveBusinessCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().optional(), name: zReq("Name", 80), slug: zSlugOpt, description: zOpt(500), icon: zOpt(40) }), fd);
  if (p.error) return p.error;
  const d = p.data;
  const slug = d.slug || slugify(d.name);
  try {
    if (d.id) await db.businessCategory.update({ where: { id: d.id }, data: { name: d.name, slug, description: d.description, icon: d.icon } });
    else {
      const max = await db.businessCategory.aggregate({ _max: { sortOrder: true } });
      await db.businessCategory.create({ data: { name: d.name, slug, description: d.description, icon: d.icon, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: `A category with slug “${slug}” already exists.` };
    throw e;
  }
  await audit(user.id, d.id ? "business_category.update" : "business_category.create", "BusinessCategory", d.id, { name: d.name });
  revalidatePath("/admin/businesses/categories");
  revalidatePath("/", "layout");
  return { ok: true, message: d.id ? "Category saved." : "Category added." };
}

export async function moveBusinessCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const id = String(fd.get("id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const all = await db.businessCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
  const i = all.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return null;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((c, k) => db.businessCategory.update({ where: { id: c.id }, data: { sortOrder: k } })));
  revalidatePath("/admin/businesses/categories");
  revalidatePath("/", "layout");
  return null;
}

export async function deleteBusinessCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id"));
  const c = await db.businessCategory.findUnique({ where: { id }, include: { _count: { select: { businesses: true } } } });
  if (!c) return { error: "Category not found." };
  await db.businessCategory.delete({ where: { id } });
  await audit(user.id, "business_category.delete", "BusinessCategory", id, { name: c.name, businesses: c._count.businesses });
  revalidatePath("/admin/businesses/categories");
  revalidatePath("/", "layout");
  return { ok: true, message: `Deleted “${c.name}”.` };
}

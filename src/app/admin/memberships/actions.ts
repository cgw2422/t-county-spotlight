"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { isUniqueError, jsonField, parseForm, zBool, zInt, zOpt, zReq, zSlugOpt } from "../_lib/form";

const dollars = z.preprocess((v) => (v === "" || v == null ? 0 : Number(String(v).replace(/[$,]/g, ""))), z.number({ error: "Enter a price" }).min(0).max(100_000));
const priceId = zOpt(100).refine((v) => !v || /^price_[A-Za-z0-9]+$/.test(v), "Stripe price IDs look like price_123…");

const planSchema = z.object({
  id: z.string().optional(), name: zReq("Name", 80), slug: zSlugOpt, description: zOpt(1000), price: dollars,
  interval: z.enum(["FREE", "MONTH", "YEAR"]), stripePriceId: priceId, isActive: zBool, isPublic: zBool, sortOrder: zInt(0, 0, 1000),
  promotions: zBool, events: zBool, updates: zBool, analytics: zBool, maxPhotos: zInt(6, 0, 200),
});

export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(planSchema, fd);
  if (p.error) return p.error;
  const d = p.data;
  if (d.interval !== "FREE" && d.price <= 0) return { error: "Paid plans need a price. Use the Free interval for free plans." };
  if (d.isActive && d.interval !== "FREE" && !d.stripePriceId) return { error: "A paid plan needs a Stripe price ID before it can be activated." };
  const features = jsonField<string[]>(fd, "features", []).map((f) => f.slice(0, 200)).slice(0, 30);
  const data = {
    name: d.name, slug: d.slug || slugify(d.name), description: d.description, priceCents: d.interval === "FREE" ? 0 : Math.round(d.price * 100), interval: d.interval,
    stripePriceId: d.stripePriceId, isActive: d.isActive, isPublic: d.isPublic, sortOrder: d.sortOrder, features,
    entitlements: { promotions: d.promotions, events: d.events, updates: d.updates, analytics: d.analytics, maxPhotos: d.maxPhotos },
  };
  const before = d.id ? await db.membershipPlan.findUnique({ where: { id: d.id } }) : null;
  let id = d.id;
  try {
    if (before) await db.membershipPlan.update({ where: { id: before.id }, data });
    else id = (await db.membershipPlan.create({ data })).id;
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already used by another plan." };
    throw e;
  }
  await audit(user.id, before ? "membership.plan_update" : "membership.plan_create", "MembershipPlan", id, {
    name: d.name, priceCents: data.priceCents, interval: d.interval, isActive: d.isActive, ...(before && before.isActive !== d.isActive ? { activeChanged: true } : {}),
  });
  revalidatePath("/admin/memberships");
  revalidatePath("/", "layout");
  if (!before) redirect(`/admin/memberships/plans/${id}/?created=1`);
  return { ok: true, message: "Plan saved." };
}

export async function deletePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const plan = await db.membershipPlan.findUnique({ where: { id }, include: { _count: { select: { subscriptions: true } } } });
  if (!plan) return { error: "Plan not found." };
  if (plan._count.subscriptions) return { error: "This plan has subscriptions. Deactivate it instead of deleting." };
  await db.membershipPlan.delete({ where: { id } });
  await audit(user.id, "membership.plan_delete", "MembershipPlan", id, { name: plan.name });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships/");
}

const productSchema = z.object({
  id: z.string().optional(), name: zReq("Name", 100), slug: zSlugOpt,
  type: z.enum(["featured_placement", "event_sponsorship", "weekend_guide", "job_listing", "category_sponsorship", "promotional_placement"]),
  description: zOpt(1000), price: dollars, durationDays: zInt(30, 1, 730), stripePriceId: priceId, isActive: zBool,
});

export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(productSchema, fd);
  if (p.error) return p.error;
  const d = p.data;
  if (d.isActive && d.price > 0 && !d.stripePriceId) return { error: "Add a Stripe price ID before activating a paid product." };
  const data = { name: d.name, slug: d.slug || slugify(d.name), type: d.type, description: d.description, priceCents: Math.round(d.price * 100), durationDays: d.durationDays, stripePriceId: d.stripePriceId, isActive: d.isActive };
  let id = d.id;
  try {
    if (d.id) await db.sponsorshipProduct.update({ where: { id: d.id }, data });
    else id = (await db.sponsorshipProduct.create({ data })).id;
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }
  await audit(user.id, d.id ? "membership.product_update" : "membership.product_create", "SponsorshipProduct", id, { name: d.name, priceCents: data.priceCents, isActive: d.isActive });
  revalidatePath("/admin/memberships");
  if (!d.id) redirect(`/admin/memberships/?tab=products`);
  return { ok: true, message: "Product saved." };
}

export async function deleteProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id"));
  const prod = await db.sponsorshipProduct.delete({ where: { id } });
  await audit(user.id, "membership.product_delete", "SponsorshipProduct", id, { name: prod.name });
  revalidatePath("/admin/memberships");
  redirect("/admin/memberships/?tab=products");
}

"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { reconcileRecommendationCounts } from "@/lib/recommendations";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zReq } from "../_lib/form";

/*
 * Recommendation moderation (ADMIN only). Staff can remove recommendations and switch them off for a
 * listing — there is deliberately no way to create recommendations or edit counts. Every action is
 * audit-logged and the cached count is recomputed from rows afterwards. Membership is never consulted.
 */

function refresh(businessId: string, slug?: string) {
  revalidatePath("/admin/recommendations/");
  revalidatePath(`/admin/recommendations/${businessId}/`);
  revalidatePath(`/admin/businesses/${businessId}/`);
  if (slug) revalidatePath(`/business/${slug}/`);
}

export async function removeRecommendation(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(z.object({ id: z.string().min(1).max(40), reason: zReq("Reason", 500) }), fd);
  if (p.error) return p.error;
  const rec = await db.businessRecommendation.findUnique({ where: { id: p.data.id }, include: { business: { select: { id: true, slug: true, name: true } } } });
  if (!rec) return { error: "That recommendation was already removed." };
  await db.businessRecommendation.deleteMany({ where: { id: rec.id } });
  await reconcileRecommendationCounts([rec.businessId]);
  await audit(user.id, "recommendation.remove", "Business", rec.businessId, { recommendationId: rec.id, recommenderId: rec.userId, reason: p.data.reason, business: rec.business.name });
  refresh(rec.businessId, rec.business.slug);
  return { ok: true, message: "Recommendation removed." };
}

export async function bulkRemoveRecommendationsByIp(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(z.object({ businessId: z.string().min(1).max(40), ipHash: z.string().regex(/^[a-f0-9]{64}$/), reason: zReq("Reason", 500) }), fd);
  if (p.error) return p.error;
  const b = await db.business.findUnique({ where: { id: p.data.businessId }, select: { id: true, slug: true, name: true } });
  if (!b) return { error: "Business not found." };
  const del = await db.businessRecommendation.deleteMany({ where: { businessId: b.id, ipHash: p.data.ipHash } });
  await reconcileRecommendationCounts([b.id]);
  await audit(user.id, "recommendation.bulk_remove_ip", "Business", b.id, { ipHashPrefix: p.data.ipHash.slice(0, 10), removed: del.count, reason: p.data.reason, business: b.name });
  refresh(b.id, b.slug);
  return { ok: true, message: `Removed ${del.count} recommendation${del.count === 1 ? "" : "s"}.` };
}

export async function setRecommendationsDisabled(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(z.object({ businessId: z.string().min(1).max(40), disabled: z.enum(["1", "0"]), reason: z.string().trim().max(500).optional() }), fd);
  if (p.error) return p.error;
  const disabled = p.data.disabled === "1";
  const b = await db.business.findUnique({ where: { id: p.data.businessId }, select: { id: true, slug: true, name: true, recommendationsDisabled: true } });
  if (!b) return { error: "Business not found." };
  if (b.recommendationsDisabled === disabled) return { ok: true, message: "No change." };
  await db.business.update({ where: { id: b.id }, data: { recommendationsDisabled: disabled } });
  await reconcileRecommendationCounts([b.id]);
  await audit(user.id, disabled ? "recommendation.disable" : "recommendation.enable", "Business", b.id, { business: b.name, ...(p.data.reason ? { reason: p.data.reason } : {}) });
  refresh(b.id, b.slug);
  return { ok: true, message: disabled ? "Recommendations turned off for this listing." : "Recommendations turned back on." };
}

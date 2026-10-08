"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { activePromotionWhere } from "@/lib/promotions";
import type { ActionState } from "@/components/ui/form-message";

/** Records a single redemption per member, honoring the offer's redemption limit (counted from real rows). */
export async function redeemPromotion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in to redeem this offer." };
  if (!rateLimit(`redeem:${user.id}`, 20, 60_000).ok) return { error: "Too many attempts. Try again in a minute." };
  const id = fd.get("promotionId")?.toString() ?? "";
  const promo = await db.promotion.findFirst({ where: { ...activePromotionWhere(), id }, select: { id: true, slug: true, redemptionLimit: true } });
  if (!promo) return { error: "This offer is no longer available." };

  try {
    await db.$transaction(async (tx) => {
      if (promo.redemptionLimit != null) {
        // Lock the promotion row so concurrent redemptions can't exceed the limit.
        await tx.$queryRaw`SELECT id FROM "Promotion" WHERE id = ${promo.id} FOR UPDATE`;
        const used = await tx.promotionRedemption.count({ where: { promotionId: promo.id } });
        if (used >= promo.redemptionLimit) throw new Error("LIMIT");
      }
      await tx.promotionRedemption.create({ data: { promotionId: promo.id, userId: user.id } });
    });
  } catch (e) {
    if ((e as Error).message === "LIMIT") return { error: "Sorry — this offer has been fully claimed." };
    if ((e as { code?: string }).code === "P2002") return { ok: true, message: "You’ve already redeemed this offer." };
    console.error("[redeem]", e);
    return { error: "Couldn’t redeem right now. Please try again." };
  }
  revalidatePath(`/specials/${promo.slug}/`);
  return { ok: true, message: "Redeemed! Show this screen at the business to claim your offer." };
}

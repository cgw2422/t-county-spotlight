"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { unrecommendBusiness } from "@/lib/recommendations";

/** Remove one of the signed-in member's own recommendations (My T County / account lists). */
export async function removeMyRecommendationAction(fd: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const p = z.object({ businessId: z.string().min(1).max(40) }).safeParse({ businessId: fd.get("businessId") });
  if (!p.success) return;
  const ip = await clientIp();
  if (!rateLimit(`recommend:${user.id}`, 30, 10 * 60_000).ok || !rateLimit(`recommend-ip:${ip}`, 30, 10 * 60_000).ok) return;
  await unrecommendBusiness(user.id, p.data.businessId);
  revalidatePath("/my-t-county/");
  revalidatePath("/account/");
}

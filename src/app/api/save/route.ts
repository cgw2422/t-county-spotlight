import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { activePromotionWhere } from "@/lib/promotions";
import { publishedArticleWhere } from "@/lib/queries";

const schema = z.object({
  type: z.enum(["BUSINESS", "EVENT", "PROMOTION", "ARTICLE", "BUSINESS_FOLLOW"]),
  targetId: z.string().min(1).max(40),
  action: z.enum(["save", "unsave", "follow", "unfollow"]),
});

/** Save / unsave items and follow / unfollow businesses for the signed-in member. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 }); } catch { return NextResponse.json({ error: "Bad origin" }, { status: 403 }); }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!rateLimit(`save:${user.id}`, 120, 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { type, targetId, action } = body;

  const isFollow = type === "BUSINESS_FOLLOW";
  if (isFollow !== (action === "follow" || action === "unfollow")) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  // Verify the target exists and is public before saving it.
  let businessId: string | null = null;
  const adding = action === "save" || action === "follow";
  if (adding) {
    let found: { businessId?: string | null; id: string } | null = null;
    if (type === "BUSINESS" || type === "BUSINESS_FOLLOW") found = await db.business.findFirst({ where: { id: targetId, status: "PUBLISHED", deletedAt: null }, select: { id: true } });
    else if (type === "EVENT") found = await db.event.findFirst({ where: { id: targetId, status: "PUBLISHED", deletedAt: null }, select: { id: true, businessId: true } });
    else if (type === "PROMOTION") found = await db.promotion.findFirst({ where: { ...activePromotionWhere(), id: targetId }, select: { id: true, businessId: true } });
    else if (type === "ARTICLE") found = await db.article.findFirst({ where: publishedArticleWhere({ id: targetId }), select: { id: true } });
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    businessId = type === "BUSINESS" || type === "BUSINESS_FOLLOW" ? found.id : found.businessId ?? null;
  }

  if (isFollow) {
    if (action === "follow") {
      await db.businessFollow.upsert({ where: { userId_businessId: { userId: user.id, businessId: targetId } }, create: { userId: user.id, businessId: targetId }, update: {} });
    } else {
      await db.businessFollow.deleteMany({ where: { userId: user.id, businessId: targetId } });
    }
    return NextResponse.json({ saved: action === "follow" });
  }

  if (action === "save") {
    const existing = await db.savedItem.findUnique({ where: { userId_type_targetId: { userId: user.id, type, targetId } } });
    if (!existing) {
      await db.savedItem.create({ data: { userId: user.id, type, targetId } });
      await db.engagementEvent.create({ data: { type: "save", businessId, targetType: type, targetId } }).catch(() => {});
    }
  } else {
    await db.savedItem.deleteMany({ where: { userId: user.id, type, targetId } });
  }
  return NextResponse.json({ saved: action === "save" });
}

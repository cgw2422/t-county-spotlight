import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { findSaveableTarget } from "@/lib/saved";

const schema = z.object({
  type: z.enum(["BUSINESS", "EVENT", "PROMOTION", "ARTICLE", "GARAGE_SALE", "ORGANIZATION", "PULSE", "BUSINESS_FOLLOW"]),
  targetId: z.string().min(1).max(40),
  action: z.enum(["save", "unsave", "follow", "unfollow"]),
});

/**
 * Save / unsave items and follow / unfollow businesses for the signed-in member.
 * Visitors without an account save on their device: for them this only checks
 * that the target can be saved, records the aggregate "save" count (once per
 * visitor per day) and answers `{ guest: true }`. Following needs an account.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 }); } catch { return NextResponse.json({ error: "Bad origin" }, { status: 403 }); }

  const user = await getCurrentUser();
  const ip = await clientIp();
  if (!rateLimit(user ? `save:${user.id}` : `save-guest:${ip}`, 120, 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { type, targetId, action } = body;
  // Aggregate "save" counts are skipped under Global Privacy Control / Do Not Track (the save itself still works).
  const countable = req.headers.get("sec-gpc") !== "1" && req.headers.get("dnt") !== "1";

  const isFollow = type === "BUSINESS_FOLLOW";
  if (isFollow !== (action === "follow" || action === "unfollow")) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (!user && isFollow) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  // Verify the target exists and is public (and not over) before saving it. Unsaving is always allowed.
  let businessId: string | null = null;
  const adding = action === "save" || action === "follow";
  if (adding) {
    const found = await findSaveableTarget(type, targetId);
    if (!found) return NextResponse.json({ error: "Not found" }, { status: 404 });
    businessId = found.businessId;
  }

  if (!user) {
    if (action === "save" && countable) {
      // Aggregate count only; never stores the IP (same hashing as /api/track).
      const ua = req.headers.get("user-agent") || "";
      const visitorHash = crypto.createHash("sha256").update(`${ip}|${ua}|${new Date().toISOString().slice(0, 10)}`).digest("hex");
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      const dup = await db.engagementEvent.findFirst({ where: { type: "save", visitorHash, targetType: type, targetId, createdAt: { gte: since } }, select: { id: true } }).catch(() => null);
      if (!dup) await db.engagementEvent.create({ data: { type: "save", businessId, targetType: type, targetId, visitorHash } }).catch(() => {});
    }
    return NextResponse.json({ saved: action === "save", guest: true });
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
      if (countable) await db.engagementEvent.create({ data: { type: "save", businessId, targetType: type, targetId } }).catch(() => {});
    }
  } else {
    await db.savedItem.deleteMany({ where: { userId: user.id, type, targetId } });
  }
  return NextResponse.json({ saved: action === "save" });
}

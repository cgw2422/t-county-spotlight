import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Records real engagement (views + outbound clicks). Never stores raw IPs:
 * visitorHash = sha256(ip + user agent + day), so a visitor can't be tracked across days.
 */
const ALLOWED = new Set([
  "view_business", "view_event", "view_promotion", "view_article", "view_job",
  "click_website", "click_phone", "click_directions", "click_ticket", "click_apply",
]);
const TARGET_TYPES = new Set(["BUSINESS", "EVENT", "PROMOTION", "ARTICLE", "JOB"]);
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i;

const schema = z.object({
  type: z.string().max(40),
  businessId: z.string().max(40).nullish(),
  targetType: z.string().max(20).nullish(),
  targetId: z.string().max(40).nullish(),
});

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try { if (new URL(origin).host !== host) return new NextResponse(null, { status: 403 }); } catch { return new NextResponse(null, { status: 403 }); }
  }
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT_RE.test(ua)) return new NextResponse(null, { status: 204 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!rateLimit(`track:${ip}`, 60, 60_000).ok) return new NextResponse(null, { status: 429 });

  let body: z.infer<typeof schema>;
  try {
    const raw = await req.text();
    if (raw.length > 2000) return new NextResponse(null, { status: 413 });
    body = schema.parse(JSON.parse(raw));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!ALLOWED.has(body.type)) return new NextResponse(null, { status: 400 });
  if (body.targetType && !TARGET_TYPES.has(body.targetType)) return new NextResponse(null, { status: 400 });

  // Only record engagement for businesses that actually exist.
  if (body.businessId) {
    const exists = await db.business.findFirst({ where: { id: body.businessId, deletedAt: null }, select: { id: true } });
    if (!exists) return new NextResponse(null, { status: 204 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const visitorHash = crypto.createHash("sha256").update(`${ip}|${ua}|${day}`).digest("hex");

  try {
    // Count a view once per visitor per day so numbers stay honest.
    if (body.type.startsWith("view_")) {
      const since = new Date(); since.setUTCHours(0, 0, 0, 0);
      const dup = await db.engagementEvent.findFirst({
        where: { type: body.type, visitorHash, targetId: body.targetId ?? null, businessId: body.businessId ?? null, createdAt: { gte: since } },
        select: { id: true },
      });
      if (dup) return new NextResponse(null, { status: 204 });
    }
    await db.engagementEvent.create({
      data: { type: body.type, businessId: body.businessId ?? null, targetType: body.targetType ?? null, targetId: body.targetId ?? null, visitorHash },
    });
  } catch (e) {
    console.error("[track] failed", e);
  }
  return new NextResponse(null, { status: 204 });
}

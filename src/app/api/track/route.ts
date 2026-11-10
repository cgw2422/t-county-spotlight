import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { ALL_COUNTY, communitySlug } from "@/lib/my-t-county-shared";

/**
 * Records real engagement (views + outbound clicks). Never stores raw IPs:
 * visitorHash = sha256(ip + user agent + day), so a visitor can't be tracked across days.
 */
const ALLOWED = new Set([
  "view_business", "view_event", "view_promotion", "view_article", "view_job",
  "click_website", "click_phone", "click_directions", "click_ticket", "click_apply",
  // Community Pulse (targetType "PULSE", targetId = entry id)
  "view_pulse", "click_pulse_business", "click_pulse_source",
  // Garage sales (targetType "GARAGE_SALE", targetId = sale id)
  "view_garage_sale",
  // Food trucks: page views (no target) and directions clicks (targetType "BUSINESS" = the truck)
  "view_food_trucks", "click_food_truck_directions",
  // Saved page views (no target; aggregate only)
  "view_saved",
  // My T County: page views (no target) and community choices (targetType "COMMUNITY", targetId = community slug or "all"; aggregate only)
  "view_my_t_county", "set_community",
  // Site search: targetType "SEARCH", targetId = how many result types had results (0–20). The query text is never sent or stored.
  "search",
  // New & Coming Soon page views (no target; aggregate only)
  "view_openings",
  // Feature page views (aggregate only). view_events_list: targetType "EVENTS_VIEW", targetId = quick-date view (see EVENTS_VIEWS).
  // view_community: targetType "COMMUNITY", targetId = community slug. view_collection: targetType "COLLECTION", targetId = collection id.
  "view_events_list", "view_community", "view_collection", "view_gives", "view_submit", "view_garage_sales",
  // Device-local "seen before?" flag (localStorage date, never an identifier): targetType "VISIT", targetId "new" | "returning".
  "visit",
  // PWA signals (only measurable on supporting browsers). install_prompt_*: targetType "PWA", targetId "native" | "ios".
  "pwa_installed", "pwa_launch", "install_prompt_shown", "install_prompt_accepted",
]);
const TARGET_TYPES = new Set(["BUSINESS", "EVENT", "PROMOTION", "ARTICLE", "JOB", "PULSE", "GARAGE_SALE", "COMMUNITY", "SEARCH", "EVENTS_VIEW", "COLLECTION", "VISIT", "PWA"]);
/** Small fixed vocabularies for aggregate targets. */
const EVENTS_VIEWS = new Set(["all", "today", "tonight", "tomorrow", "weekend", "week", "month", "calendar", "range"]);
const FIXED_TARGETS: Record<string, { targetType: string | null; ids: Set<string> | null }> = {
  view_events_list: { targetType: "EVENTS_VIEW", ids: EVENTS_VIEWS },
  visit: { targetType: "VISIT", ids: new Set(["new", "returning"]) },
  install_prompt_shown: { targetType: "PWA", ids: new Set(["native", "ios"]) },
  install_prompt_accepted: { targetType: "PWA", ids: new Set(["native"]) },
  view_gives: { targetType: null, ids: null },
  view_submit: { targetType: null, ids: null },
  view_garage_sales: { targetType: null, ids: null },
  pwa_installed: { targetType: null, ids: null },
  pwa_launch: { targetType: null, ids: null },
};
/** Non-view signals that are still counted at most once per visitor per day. */
const ONCE_PER_DAY = new Set(["visit", "pwa_launch", "pwa_installed", "install_prompt_shown", "install_prompt_accepted"]);
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
  // Respect Global Privacy Control / Do Not Track even if a client sends anyway.
  if (req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1") return new NextResponse(null, { status: 204 });

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

  // Community Pulse events must reference a real, public entry.
  if (body.type.includes("pulse")) {
    if (body.targetType !== "PULSE" || !body.targetId) return new NextResponse(null, { status: 400 });
    const pulse = await db.communityPulse.findFirst({ where: { id: body.targetId, deletedAt: null, status: { in: ["PUBLISHED", "ARCHIVED"] } }, select: { id: true } });
    if (!pulse) return new NextResponse(null, { status: 204 });
  }

  // Garage sale views must reference a real, published sale.
  if (body.type === "view_garage_sale") {
    if (body.targetType !== "GARAGE_SALE" || !body.targetId) return new NextResponse(null, { status: 400 });
    const sale = await db.garageSale.findFirst({ where: { id: body.targetId, status: "PUBLISHED" }, select: { id: true } });
    if (!sale) return new NextResponse(null, { status: 204 });
  }

  // Community choices / community page views must name a known community (or "all" for choices); nothing personal is stored.
  if (body.type === "set_community" || body.type === "view_community" || body.targetType === "COMMUNITY") {
    if ((body.type !== "set_community" && body.type !== "view_community") || body.targetType !== "COMMUNITY" || !body.targetId || body.businessId) return new NextResponse(null, { status: 400 });
    const allOk = body.type === "set_community" && body.targetId === ALL_COUNTY;
    if (!allOk && communitySlug(body.targetId) !== body.targetId) return new NextResponse(null, { status: 400 });
  }

  // Fixed-vocabulary aggregate signals carry no business and only a known target value (or none).
  const fixed = FIXED_TARGETS[body.type];
  if (fixed || body.targetType === "EVENTS_VIEW" || body.targetType === "VISIT" || body.targetType === "PWA") {
    if (!fixed || body.businessId || (body.targetType ?? null) !== fixed.targetType) return new NextResponse(null, { status: 400 });
    if (fixed.ids ? !body.targetId || !fixed.ids.has(body.targetId) : body.targetId) return new NextResponse(null, { status: 400 });
  }

  // Collection views must reference a real, published collection.
  if (body.type === "view_collection" || body.targetType === "COLLECTION") {
    if (body.type !== "view_collection" || body.targetType !== "COLLECTION" || !body.targetId || body.businessId) return new NextResponse(null, { status: 400 });
    const col = await db.exploreCollection.findFirst({ where: { id: body.targetId, status: "PUBLISHED" }, select: { id: true } });
    if (!col) return new NextResponse(null, { status: 204 });
  }

  // Searches carry only a small number (result types with results) — never the query.
  if (body.type === "search" || body.targetType === "SEARCH") {
    if (body.type !== "search" || body.targetType !== "SEARCH" || !body.targetId || !/^(?:[0-9]|1[0-9]|20)$/.test(body.targetId) || body.businessId) return new NextResponse(null, { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const visitorHash = crypto.createHash("sha256").update(`${ip}|${ua}|${day}`).digest("hex");

  try {
    // Count a view once per visitor per day so numbers stay honest.
    if (body.type.startsWith("view_") || ONCE_PER_DAY.has(body.type)) {
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

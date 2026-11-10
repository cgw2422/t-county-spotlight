import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { recommendBusiness, unrecommendBusiness } from "@/lib/recommendations";

export const dynamic = "force-dynamic";

const schema = z.object({
  businessId: z.string().min(1).max(40),
  action: z.enum(["recommend", "unrecommend"]),
});

const TEN_MIN = 10 * 60_000;

/**
 * Community recommendation toggle for the signed-in member (free for every member —
 * no plan or entitlement check, by design). Answers `{ recommended, count }`, where
 * `count` is the public count after the change.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 }); } catch { return NextResponse.json({ error: "Bad origin" }, { status: 403 }); }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to recommend businesses.", code: "signin" }, { status: 401 });

  const ip = await clientIp();
  const byUser = rateLimit(`recommend:${user.id}`, 30, TEN_MIN);
  const byIp = rateLimit(`recommend-ip:${ip}`, 30, TEN_MIN);
  if (!byUser.ok || !byIp.ok) return NextResponse.json({ error: "Too many requests. Please wait a few minutes and try again.", code: "rate_limited" }, { status: 429 });

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const r = body.action === "recommend"
    ? await recommendBusiness(user, body.businessId, ip)
    : await unrecommendBusiness(user.id, body.businessId);
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ recommended: r.recommended, changed: r.changed, count: r.count, disabled: r.disabled });
}

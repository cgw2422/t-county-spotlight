import { NextResponse } from "next/server";
import { findByUnsubscribeToken, unsubscribe } from "@/lib/newsletter/subscribers";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post). Mail apps
 * POST "List-Unsubscribe=One-Click" here; no login or confirmation page.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`nl-oneclick:${ip}`, 60, 600_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const token = new URL(req.url).searchParams.get("token");
  const body = await req.text().catch(() => "");
  const params = new URLSearchParams(body);
  if (params.get("List-Unsubscribe") !== "One-Click") return NextResponse.json({ error: "Expected List-Unsubscribe=One-Click" }, { status: 400 });
  const sub = await findByUnsubscribeToken(token);
  if (!sub) return NextResponse.json({ error: "Unknown token" }, { status: 404 });
  await unsubscribe(sub.id, { method: "one_click" });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** A browser that opens the header URL directly gets the normal confirmation page. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return NextResponse.redirect(new URL(`/newsletter/unsubscribe/?token=${encodeURIComponent(token)}`, req.url), 303);
}

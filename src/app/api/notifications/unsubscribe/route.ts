import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { findUnsubscribeTarget, turnOffEmailUpdate } from "@/lib/notifications/preferences";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click target for the List-Unsubscribe header on member email
 * updates. Mail apps POST "List-Unsubscribe=One-Click"; turns off only the
 * update type named by the signed token. No login.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`upd-oneclick:${ip}`, 60, 600_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const body = await req.text().catch(() => "");
  if (new URLSearchParams(body).get("List-Unsubscribe") !== "One-Click") return NextResponse.json({ error: "Expected List-Unsubscribe=One-Click" }, { status: 400 });
  const target = await findUnsubscribeTarget(new URL(req.url).searchParams.get("t"));
  if (!target) return NextResponse.json({ error: "Unknown token" }, { status: 404 });
  await turnOffEmailUpdate(target.user.id, target.kind, "one_click");
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

/** A browser that opens the header URL directly gets the normal confirmation page. */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/account/notifications/unsubscribe/?t=${encodeURIComponent(t)}`, req.url), 303);
}

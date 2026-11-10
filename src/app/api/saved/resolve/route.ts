import { NextResponse } from "next/server";
import { clientIp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { SAVED_MAX, parseSavedRefs, resolveSavedItems } from "@/lib/saved";

/**
 * Read-only: resolves device saves (`{ items: [{ type, targetId, savedAt }] }`, at
 * most 200) to public display fields. Never returns private fields (garage
 * sale street addresses for general-location sales, emails, drafts).
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 }); } catch { return NextResponse.json({ error: "Bad origin" }, { status: 403 }); }
  }
  if (!rateLimit(`saved-resolve:${await clientIp()}`, 60, 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 40_000) return NextResponse.json({ error: "Too many items" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const list = (body as { items?: unknown } | null)?.items;
  if (Array.isArray(list) && list.length > SAVED_MAX) return NextResponse.json({ error: `At most ${SAVED_MAX} items` }, { status: 413 });
  const refs = parseSavedRefs(list);
  if (!refs) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const items = await resolveSavedItems(refs);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}

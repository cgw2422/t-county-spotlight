import { NextResponse } from "next/server";
import { getPicks } from "@/lib/my-t-county";
import { cleanCommunities, cleanInterests, communityName } from "@/lib/my-t-county-shared";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * "Picked for you" for guests, whose interests live only in localStorage.
 * Public, read-only event data; inputs are validated against the allowlists.
 */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`picks:${ip}`, 60, 60_000).ok) return NextResponse.json({ picks: [] }, { status: 429 });
  const url = new URL(req.url);
  const split = (k: string) => (url.searchParams.get(k) ?? "").split(",").map((v) => v.trim()).filter(Boolean).slice(0, 30);
  const interests = cleanInterests(split("interests"));
  const home = communityName(url.searchParams.get("community"));
  const picks = interests.length ? await getPicks(interests, [home, ...cleanCommunities(split("communities"), home)]) : [];
  return NextResponse.json({ picks }, { headers: { "Cache-Control": "no-store" } });
}

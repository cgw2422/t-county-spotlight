import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { COMMUNITY_COOKIE, cleanCommunities, cleanInterests, communityName } from "@/lib/my-t-county-shared";

const schema = z.object({
  extraCommunities: z.array(z.string().max(60)).max(30).default([]),
  interests: z.array(z.string().max(40)).max(30).default([]),
});

/**
 * One-time merge of guest preferences (community cookie + localStorage extras)
 * into the signed-in account. Account values win: each field is only filled
 * when the account has nothing saved for it yet.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Forbidden" }, { status: 403 }); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!rateLimit(`prefs-merge:${user.id}`, 10, 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: z.infer<typeof schema>;
  try {
    const raw = await req.text();
    if (raw.length > 4000) return NextResponse.json({ error: "Too large" }, { status: 413 });
    body = schema.parse(raw ? JSON.parse(raw) : {});
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const cookieCommunity = communityName((await cookies()).get(COMMUNITY_COOKIE)?.value);
  const data: { homeCommunity?: string; extraCommunities?: string[]; interestKeys?: string[] } = {};
  const home = communityName(user.homeCommunity);
  if (!home && cookieCommunity) data.homeCommunity = cookieCommunity;
  const effectiveHome = data.homeCommunity ?? home;
  if (!user.extraCommunities.length) {
    const extra = cleanCommunities(body.extraCommunities, effectiveHome);
    if (extra.length) data.extraCommunities = extra;
  }
  if (!user.interestKeys.length) {
    const interests = cleanInterests(body.interests);
    if (interests.length) data.interestKeys = interests;
  }
  const merged = Object.keys(data);
  if (merged.length) await db.user.update({ where: { id: user.id }, data });
  return NextResponse.json({ ok: true, merged });
}

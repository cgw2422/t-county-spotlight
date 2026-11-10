import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { SAVED_MAX, findSaveableTarget, parseSavedRefs } from "@/lib/saved";

/**
 * Adds a guest's device saves to the signed-in account. Each item must still
 * exist and be public (sales and specials that ended since are kept); duplicates are skipped.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  try { if (new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 }); } catch { return NextResponse.json({ error: "Bad origin" }, { status: 403 }); }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!rateLimit(`saved-merge:${user.id}`, 10, 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 40_000) return NextResponse.json({ error: "Too many items" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const list = (body as { items?: unknown } | null)?.items;
  if (Array.isArray(list) && list.length > SAVED_MAX) return NextResponse.json({ error: `At most ${SAVED_MAX} items` }, { status: 413 });
  const refs = parseSavedRefs(list);
  if (!refs) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const existing = new Set(
    (await db.savedItem.findMany({ where: { userId: user.id, OR: refs.map((r) => ({ type: r.type, targetId: r.targetId })) }, select: { type: true, targetId: true } }))
      .map((r) => `${r.type}:${r.targetId}`),
  );
  let added = 0;
  let skipped = 0;
  const now = new Date();
  for (const r of refs) {
    if (existing.has(`${r.type}:${r.targetId}`)) { skipped++; continue; }
    const target = await findSaveableTarget(r.type, r.targetId, now, { allowEnded: true });
    if (!target) { skipped++; continue; }
    const savedAt = r.savedAt ? new Date(r.savedAt) : now;
    const createdAt = savedAt > now || Number.isNaN(savedAt.getTime()) ? now : savedAt;
    const res = await db.savedItem.createMany({ data: [{ userId: user.id, type: r.type, targetId: r.targetId, createdAt }], skipDuplicates: true });
    if (res.count) added++; else skipped++;
  }
  return NextResponse.json({ added, skipped });
}

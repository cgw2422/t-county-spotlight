import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SAVED_KINDS } from "@/lib/saved-shared";

export const dynamic = "force-dynamic";

/** The signed-in member's saved keys ("TYPE:id"), so card save buttons can show their state. Guests get `signedIn: false`. */
export async function GET() {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return NextResponse.json({ signedIn: false, keys: [] }, { headers });
  const rows = await db.savedItem.findMany({ where: { userId: user.id, type: { in: [...SAVED_KINDS] } }, select: { type: true, targetId: true }, take: 2000 });
  return NextResponse.json({ signedIn: true, keys: rows.map((r) => `${r.type}:${r.targetId}`) }, { headers });
}

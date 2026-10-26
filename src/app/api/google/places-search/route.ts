import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getGooglePlacesSettings, isPlacesApiActive, searchPlaces } from "@/lib/google-places";

export const dynamic = "force-dynamic";

/**
 * GET /api/google/places-search/?q=name+address&businessId=…
 * Server-side proxy to Places API (New) Text Search so the API key never reaches the browser.
 * Staff may search freely; business owners must pass a businessId they manage.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId") ?? "";
  if (!isStaff(user)) {
    const link = businessId
      ? await db.businessOwner.findUnique({ where: { userId_businessId: { userId: user.id, businessId } }, select: { business: { select: { deletedAt: true, status: true } } } })
      : null;
    if (!link || link.business.deletedAt || link.business.status === "SUSPENDED") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  if (!rateLimit(`gplaces-search:${user.id}`, 20, 60_000).ok) return NextResponse.json({ error: "Too many searches. Please wait a minute." }, { status: 429 });
  const settings = await getGooglePlacesSettings();
  if (!isPlacesApiActive(settings)) return NextResponse.json({ error: "Google search isn't available. Paste your Google Maps link instead." }, { status: 503 });
  const r = await searchPlaces((url.searchParams.get("q") ?? "").slice(0, 200));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ results: r.results }, { headers: { "Cache-Control": "private, no-store" } });
}

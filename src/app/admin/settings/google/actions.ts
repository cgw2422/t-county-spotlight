"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_CACHE_MINUTES, isApiKeyConfigured, isValidPlaceId, lookupPlace, saveGooglePlacesSettings } from "@/lib/google-places";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zBool, zInt } from "../../_lib/form";

const schema = z.object({
  enabled: zBool,
  showReviews: zBool,
  maxReviews: zInt(5, 1, 5),
  cacheMinutes: zInt(30, 0, MAX_CACHE_MINUTES),
});

export async function saveGoogleSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const saved = await saveGooglePlacesSettings(p.data);
  await audit(user.id, "settings.save", "Setting", "googlePlaces", { group: "googlePlaces", ...saved });
  revalidatePath("/admin/settings/google");
  return { ok: true, message: "Google settings saved. The review cache was cleared." };
}

export type TestLookupState = {
  error?: string;
  result?: { id: string; name: string | null; rating: number | null; userRatingCount: number | null; reviews: number; googleMapsUri: string | null; attributions: number };
} | null;

/** Admin-only live lookup. Bypasses the cache; nothing is stored. */
export async function testLookup(_: TestLookupState, fd: FormData): Promise<TestLookupState> {
  const user = await requireAdmin();
  const placeId = String(fd.get("placeId") ?? "").trim();
  if (!isValidPlaceId(placeId)) return { error: "Enter a valid Place ID (10–300 letters, numbers, - or _)." };
  if (!isApiKeyConfigured()) return { error: "GOOGLE_PLACES_API_KEY is not set on the server, so live lookups are unavailable." };
  if (!rateLimit(`gplaces-test:${user.id}`, 10, 60_000).ok) return { error: "Too many lookups — wait a minute." };
  const r = await lookupPlace(placeId);
  if (!r.ok) return { error: r.error };
  const p = r.place;
  return { result: { id: p.id, name: p.name, rating: p.rating, userRatingCount: p.userRatingCount, reviews: p.reviews.length, googleMapsUri: p.googleMapsUri, attributions: p.attributions.length } };
}

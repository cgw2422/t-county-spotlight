import "server-only";
import { db } from "./db";
import { saveSettings, type SiteSettings } from "./settings";

/**
 * Google Places integration (Places API (New)) — the ONLY place the site talks to Google.
 *
 * - The API key comes exclusively from the GOOGLE_PLACES_API_KEY environment variable.
 *   It is never stored in the database and never sent to the browser.
 * - Admin-controlled options live in a single Setting row (key "googlePlaces").
 * - Google Maps Platform terms: the Place ID is the only Google content we store
 *   indefinitely (Business.googlePlaceId). Ratings, review text, author names and photos
 *   are NEVER written to the database. They are held only in a short-lived in-memory cache
 *   (see `cache` below) purely as temporary caching for performance; admins can set the
 *   TTL to 0 to disable it entirely.
 * - Reviews are shown exactly as returned by Google, in Google's order: never edited,
 *   never filtered by rating, never fabricated.
 */

// ───────────────────────── Settings ─────────────────────────

export const GOOGLE_PLACES_SETTING_KEY = "googlePlaces";
export const MAX_CACHE_MINUTES = 60 * 24;

export type GooglePlacesSettings = {
  /** Master switch for live API calls (Place Details, Text Search, verification). */
  enabled: boolean;
  /** Show individual review texts (the rating summary is shown whenever data is available). */
  showReviews: boolean;
  /** 1–5. Google returns at most five reviews. */
  maxReviews: number;
  /** In-memory cache TTL in minutes. 0 disables caching. */
  cacheMinutes: number;
};

export const DEFAULT_GOOGLE_PLACES_SETTINGS: GooglePlacesSettings = { enabled: true, showReviews: true, maxReviews: 5, cacheMinutes: 30 };

const clampInt = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function normalizeGooglePlacesSettings(raw: unknown): GooglePlacesSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_GOOGLE_PLACES_SETTINGS;
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : d.enabled,
    showReviews: typeof r.showReviews === "boolean" ? r.showReviews : d.showReviews,
    maxReviews: clampInt(r.maxReviews, 1, 5, d.maxReviews),
    cacheMinutes: clampInt(r.cacheMinutes, 0, MAX_CACHE_MINUTES, d.cacheMinutes),
  };
}

export async function getGooglePlacesSettings(): Promise<GooglePlacesSettings> {
  try {
    const row = await db.setting.findUnique({ where: { key: GOOGLE_PLACES_SETTING_KEY } });
    return normalizeGooglePlacesSettings(row?.value);
  } catch {
    return DEFAULT_GOOGLE_PLACES_SETTINGS;
  }
}

export async function saveGooglePlacesSettings(s: GooglePlacesSettings) {
  const value = normalizeGooglePlacesSettings(s);
  // SiteSettings doesn't declare this key; saveSettings just upserts key/value rows.
  await saveSettings({ [GOOGLE_PLACES_SETTING_KEY]: value } as unknown as Partial<SiteSettings>);
  clearPlacesCache();
  return value;
}

// ───────────────────────── API key ─────────────────────────

function apiKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

export function isApiKeyConfigured() {
  return !!apiKey();
}

/** Live API calls are made only when the env key exists AND the admin switch is on. */
export function isPlacesApiActive(s: GooglePlacesSettings) {
  return s.enabled && isApiKeyConfigured();
}

// ───────────────────────── Validation ─────────────────────────

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

export function isValidPlaceId(v: string) {
  return PLACE_ID_RE.test(v);
}

/** Accepts only https Google Maps links: google.com/maps…, maps.google.com, maps.app.goo.gl, goo.gl/maps. */
export function normalizeGoogleMapsUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || (u.port && u.port !== "443" && u.port !== "80")) return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const ok =
    ((host === "google.com" || host === "www.google.com") && (path === "/maps" || path.startsWith("/maps/"))) ||
    host === "maps.google.com" ||
    host === "maps.app.goo.gl" ||
    (host === "goo.gl" && (path === "/maps" || path.startsWith("/maps/")));
  if (!ok) return null;
  u.protocol = "https:";
  u.port = "";
  const out = u.toString();
  return out.length <= 2000 ? out : null;
}

/** Pulls a Place ID out of links like …/maps/place/?q=place_id:XXX or …&query_place_id=XXX. */
export function extractPlaceIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const qp = u.searchParams.get("query_place_id") || u.searchParams.get("place_id");
    if (qp && isValidPlaceId(qp)) return qp;
    const q = u.searchParams.get("q") || "";
    const m = q.match(/^place_id:([A-Za-z0-9_-]+)$/);
    if (m && isValidPlaceId(m[1])) return m[1];
  } catch {}
  return null;
}

export function placeFallbackUrl(placeId: string) {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

/** Best public link for a linked business: the stored Maps URL, else the Place ID link. */
export function googleListingUrl(b: { googlePlaceId: string | null; googleMapsUrl: string | null }) {
  return b.googleMapsUrl || (b.googlePlaceId ? placeFallbackUrl(b.googlePlaceId) : null);
}

export type ListingInput = { placeId: string | null; mapsUrl: string | null };

/**
 * Validates the editor fields. Either field may be pasted with a Maps URL; a URL pasted
 * into the Place ID box is treated as the Maps URL (and a place_id inside it is extracted).
 */
export function parseListingInput(placeIdRaw: string, mapsUrlRaw: string): { data: ListingInput; fieldErrors?: undefined } | { data?: undefined; fieldErrors: Record<string, string> } {
  let idRaw = placeIdRaw.trim();
  let urlRaw = mapsUrlRaw.trim();
  const fieldErrors: Record<string, string> = {};
  if (idRaw && /[/.:]/.test(idRaw)) {
    // Looks like a URL rather than an ID.
    if (!urlRaw) urlRaw = idRaw;
    const fromUrl = normalizeGoogleMapsUrl(idRaw);
    idRaw = fromUrl ? extractPlaceIdFromUrl(fromUrl) ?? "" : idRaw;
    if (!fromUrl) fieldErrors.googlePlaceId = "Enter a Google Place ID (letters, numbers, - and _) or a Google Maps link.";
  }
  let mapsUrl: string | null = null;
  if (urlRaw) {
    mapsUrl = normalizeGoogleMapsUrl(urlRaw);
    if (!mapsUrl) fieldErrors.googleMapsUrl = "Only Google Maps links are accepted (google.com/maps, maps.app.goo.gl or goo.gl/maps).";
  }
  let placeId: string | null = idRaw || null;
  if (!placeId && mapsUrl) placeId = extractPlaceIdFromUrl(mapsUrl);
  if (placeId && !isValidPlaceId(placeId) && !fieldErrors.googlePlaceId) fieldErrors.googlePlaceId = "That isn't a valid Place ID. It should be 10–300 letters, numbers, dashes or underscores (e.g. ChIJ…).";
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  return { data: { placeId, mapsUrl } };
}

// ───────────────────────── Place Details (New) ─────────────────────────

export type GoogleReview = {
  authorName: string;
  authorUri: string | null;
  authorPhotoUri: string | null;
  rating: number | null;
  relativeTime: string | null;
  publishTime: string | null;
  text: string;
  googleMapsUri: string | null;
};

export type PlaceDetails = {
  id: string;
  name: string | null;
  rating: number | null;
  userRatingCount: number | null;
  googleMapsUri: string | null;
  reviews: GoogleReview[];
  attributions: { provider: string; providerUri: string | null }[];
};

const DETAILS_FIELDS = "id,displayName,rating,userRatingCount,reviews,googleMapsUri,attributions";
const TIMEOUT_MS = 5000;

const httpsOrNull = (v: unknown) => (typeof v === "string" && /^https:\/\//i.test(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Pure parser for a Place Details (New) JSON body. Keeps Google's review order untouched. */
export function parsePlaceDetails(json: unknown): PlaceDetails | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const id = strOrNull(j.id);
  if (!id) return null;
  const displayName = j.displayName as { text?: unknown } | undefined;
  const reviews = Array.isArray(j.reviews) ? j.reviews : [];
  return {
    id,
    name: strOrNull(displayName?.text),
    rating: numOrNull(j.rating),
    userRatingCount: numOrNull(j.userRatingCount),
    googleMapsUri: httpsOrNull(j.googleMapsUri),
    reviews: reviews.slice(0, 5).flatMap((r): GoogleReview[] => {
      if (!r || typeof r !== "object") return [];
      const rv = r as Record<string, unknown>;
      const a = (rv.authorAttribution ?? {}) as Record<string, unknown>;
      const text = (rv.text as { text?: unknown } | undefined)?.text ?? (rv.originalText as { text?: unknown } | undefined)?.text;
      return [{
        authorName: strOrNull(a.displayName) ?? "A Google user",
        authorUri: httpsOrNull(a.uri),
        authorPhotoUri: httpsOrNull(a.photoUri),
        rating: numOrNull(rv.rating),
        relativeTime: strOrNull(rv.relativePublishTimeDescription),
        publishTime: strOrNull(rv.publishTime),
        text: typeof text === "string" ? text : "",
        googleMapsUri: httpsOrNull(rv.googleMapsUri),
      }];
    }),
    attributions: (Array.isArray(j.attributions) ? j.attributions : []).flatMap((x) => {
      const p = x as Record<string, unknown>;
      const provider = strOrNull(p?.provider);
      return provider ? [{ provider, providerUri: httpsOrNull(p.providerUri) }] : [];
    }),
  };
}

const loggedErrors = new Set<string>();
function logOnce(key: string, msg: string) {
  if (loggedErrors.has(key)) return;
  if (loggedErrors.size > 500) loggedErrors.clear();
  loggedErrors.add(key);
  console.error(`[google-places] ${msg}`);
}

/** Raw lookup that reports the error (used by verification and the admin "Test lookup"). Never throws. */
export async function lookupPlace(placeId: string): Promise<{ ok: true; place: PlaceDetails } | { ok: false; error: string }> {
  const key = apiKey();
  if (!key) return { ok: false, error: "GOOGLE_PLACES_API_KEY is not configured." };
  if (!isValidPlaceId(placeId)) return { ok: false, error: "Invalid Place ID format." };
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      let detail = "";
      try { detail = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? ""; } catch {}
      return { ok: false, error: `Google returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}` };
    }
    const place = parsePlaceDetails(await res.json());
    return place ? { ok: true, place } : { ok: false, error: "Google returned an unexpected response." };
  } catch (e) {
    const name = (e as Error)?.name;
    return { ok: false, error: name === "TimeoutError" || name === "AbortError" ? "Google did not respond within 5 seconds." : `Request failed: ${(e as Error)?.message ?? "unknown error"}` };
  }
}

// Temporary in-memory cache for performance only (per server instance, lost on restart).
// Holds Google content for at most `cacheMinutes`; nothing here is ever persisted.
type Entry = { expires: number; value: PlaceDetails | null };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<PlaceDetails | null>>();
const MAX_ENTRIES = 500;
const NEGATIVE_TTL_MS = 2 * 60_000;

export function clearPlacesCache() {
  cache.clear();
  inflight.clear();
}

/** Exposed for tests/diagnostics. */
export function placesCacheSize() {
  return cache.size;
}

/**
 * Place Details for public display. Returns null when the API is off/unconfigured or on
 * any error — never throws into page render. Applies maxReviews from settings.
 */
export async function getPlaceDetails(placeId: string, opts: { settings?: GooglePlacesSettings } = {}): Promise<PlaceDetails | null> {
  try {
    const s = opts.settings ?? (await getGooglePlacesSettings());
    if (!isPlacesApiActive(s) || !isValidPlaceId(placeId)) return null;
    const ttl = s.cacheMinutes * 60_000;
    const now = Date.now();
    const hit = ttl > 0 ? cache.get(placeId) : undefined;
    let place: PlaceDetails | null;
    if (hit && hit.expires > now) place = hit.value;
    else {
      let p = inflight.get(placeId);
      if (!p) {
        p = lookupPlace(placeId).then((r) => {
          if (!r.ok) { logOnce(`${placeId}:${r.error}`, `Place Details failed for ${placeId}: ${r.error}`); return null; }
          return r.place;
        });
        inflight.set(placeId, p);
      }
      try { place = await p; } finally { inflight.delete(placeId); }
      if (ttl > 0) {
        if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.set(placeId, { expires: Date.now() + (place ? ttl : Math.min(ttl, NEGATIVE_TTL_MS)), value: place });
      } else cache.delete(placeId);
    }
    if (!place) return null;
    return { ...place, reviews: place.reviews.slice(0, s.maxReviews) };
  } catch (e) {
    logOnce(`unexpected:${(e as Error)?.message}`, `Unexpected error: ${(e as Error)?.message}`);
    return null;
  }
}

// ───────────────────────── Text Search (New) ─────────────────────────

export type PlaceSearchResult = { id: string; name: string; address: string | null; googleMapsUri: string | null };

/** Tuscarawas County, OH (approximate center) — results are biased, not restricted, to this circle. */
const TUSC_BIAS = { circle: { center: { latitude: 40.4, longitude: -81.47 }, radius: 35000 } };

export async function searchPlaces(query: string): Promise<{ ok: true; results: PlaceSearchResult[] } | { ok: false; error: string }> {
  const key = apiKey();
  if (!key) return { ok: false, error: "Google search isn't configured." };
  const textQuery = query.trim().slice(0, 200);
  if (textQuery.length < 2) return { ok: true, results: [] };
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery, locationBias: TUSC_BIAS, maxResultCount: 8, languageCode: "en", regionCode: "US" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      logOnce(`search:${res.status}`, `Text Search failed: HTTP ${res.status}`);
      return { ok: false, error: "Google search is unavailable right now." };
    }
    const json = (await res.json()) as { places?: Record<string, unknown>[] };
    const results = (json.places ?? []).flatMap((p) => {
      const id = strOrNull(p.id);
      if (!id || !isValidPlaceId(id)) return [];
      return [{
        id,
        name: strOrNull((p.displayName as { text?: unknown } | undefined)?.text) ?? id,
        address: strOrNull(p.formattedAddress),
        googleMapsUri: httpsOrNull(p.googleMapsUri),
      }];
    });
    return { ok: true, results };
  } catch (e) {
    logOnce(`search:${(e as Error)?.name}`, `Text Search error: ${(e as Error)?.message}`);
    return { ok: false, error: "Google search is unavailable right now." };
  }
}

// ───────────────────────── Shared editor save logic ─────────────────────────

type ExistingListing = { googlePlaceId: string | null; googleMapsUrl: string | null; googleReviewsEnabled: boolean; googlePlaceVerifiedAt: Date | null } | null;

export type ListingUpdate = {
  googlePlaceId: string | null;
  googleMapsUrl: string | null;
  googleReviewsEnabled: boolean;
  googlePlaceVerifiedAt: Date | null;
};

/**
 * Reads the Google listing fields from an editor form (only when the form includes the
 * `googleListing` marker), validates them and — when the API is active — verifies a new or
 * unverified Place ID via Place Details. Callers must authorize the business first.
 */
export async function googleListingFromForm(fd: FormData, existing: ExistingListing): Promise<
  | { skip: true }
  | { skip?: false; fieldErrors: Record<string, string> }
  | { skip?: false; fieldErrors?: undefined; data: ListingUpdate; changes: Record<string, unknown> | null; note: string | null }
> {
  if (fd.get("googleListing") !== "1") return { skip: true };
  const parsed = parseListingInput(String(fd.get("googlePlaceId") ?? ""), String(fd.get("googleMapsUrl") ?? ""));
  if (parsed.fieldErrors) return { fieldErrors: parsed.fieldErrors };
  const { placeId } = parsed.data;
  let { mapsUrl } = parsed.data;
  const reviewsEnabled = fd.get("googleReviewsEnabled") === "on";
  const idChanged = placeId !== (existing?.googlePlaceId ?? null);
  let verifiedAt: Date | null = placeId && !idChanged ? existing?.googlePlaceVerifiedAt ?? null : null;
  let note: string | null = null;

  if (placeId && (idChanged || !verifiedAt)) {
    const s = await getGooglePlacesSettings();
    if (isPlacesApiActive(s)) {
      const r = await lookupPlace(placeId);
      if (r.ok) {
        verifiedAt = new Date();
        if (!mapsUrl && r.place.googleMapsUri) mapsUrl = normalizeGoogleMapsUrl(r.place.googleMapsUri);
        note = `Verified with Google${r.place.name ? `: ${r.place.name}` : ""}.`;
      } else {
        verifiedAt = null;
        note = "Saved, but Google couldn't verify this Place ID — double-check it.";
      }
    }
  }

  const data: ListingUpdate = { googlePlaceId: placeId, googleMapsUrl: mapsUrl, googleReviewsEnabled: reviewsEnabled, googlePlaceVerifiedAt: verifiedAt };
  const changes: Record<string, unknown> = {};
  if (idChanged) changes.googlePlaceId = { from: existing?.googlePlaceId ?? null, to: placeId };
  if (mapsUrl !== (existing?.googleMapsUrl ?? null)) changes.googleMapsUrl = { from: existing?.googleMapsUrl ?? null, to: mapsUrl };
  if (reviewsEnabled !== (existing?.googleReviewsEnabled ?? true)) changes.googleReviewsEnabled = reviewsEnabled;
  if ((verifiedAt === null) !== !existing?.googlePlaceVerifiedAt || (verifiedAt && idChanged)) changes.verified = !!verifiedAt;
  return { data, changes: Object.keys(changes).length ? changes : null, note };
}

/**
 * Unit tests for src/lib/google-places.ts with a mocked global fetch (no network, no DB).
 * Run: npx tsx --conditions=react-server scripts/test-google-places.ts
 */
import assert from "node:assert/strict";

process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
process.env.DATABASE_URL ||= "postgresql://unused:unused@localhost:5432/unused";

const PLACE_ID = "ChIJd8BlQ2BZwokRAFUEcm_qrcA";
const payload = {
  id: PLACE_ID,
  displayName: { text: "Test Diner", languageCode: "en" },
  rating: 4.63,
  userRatingCount: 128,
  googleMapsUri: "https://maps.google.com/?cid=123",
  attributions: [{ provider: "Some Provider", providerUri: "https://provider.example/" }],
  reviews: [1, 2, 3, 4, 5, 6].map((n) => ({
    name: `places/${PLACE_ID}/reviews/r${n}`,
    relativePublishTimeDescription: `${n} weeks ago`,
    rating: n === 2 ? 1 : 5,
    ...(n === 3 ? {} : { text: { text: `Review text ${n}`, languageCode: "en" } }),
    originalText: { text: `Original ${n}`, languageCode: "en" },
    authorAttribution: { displayName: `Author ${n}`, uri: `https://www.google.com/maps/contrib/${n}`, photoUri: `https://lh3.googleusercontent.com/a/${n}` },
    publishTime: "2026-09-01T12:00:00Z",
    googleMapsUri: `https://www.google.com/maps/reviews/data=${n}`,
  })),
};

type Mode = "ok" | "fail" | "throw";
let mode: Mode = "ok";
let calls = 0;
let lastHeaders: Record<string, string> = {};
let lastUrl = "";
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls++;
  lastUrl = String(input);
  lastHeaders = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
  if (mode === "throw") throw Object.assign(new Error("network down"), { name: "TypeError" });
  if (mode === "fail") return new Response(JSON.stringify({ error: { code: 404, message: "Not found", status: "NOT_FOUND" } }), { status: 404 });
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

async function main() {
  const g = await import("../src/lib/google-places");
  const base = { enabled: true, showReviews: true, maxReviews: 5, cacheMinutes: 30 };
  const origErr = console.error;
  console.error = () => {}; // silence expected log-once output

  await test("parsePlaceDetails parses fields, keeps Google order, caps at 5, falls back to originalText", () => {
    const p = g.parsePlaceDetails(payload)!;
    assert.equal(p.id, PLACE_ID);
    assert.equal(p.name, "Test Diner");
    assert.equal(p.rating, 4.63);
    assert.equal(p.userRatingCount, 128);
    assert.equal(p.reviews.length, 5);
    assert.deepEqual(p.reviews.map((r) => r.authorName), ["Author 1", "Author 2", "Author 3", "Author 4", "Author 5"]);
    assert.equal(p.reviews[1].rating, 1, "low-rated review is kept (no positive-only filtering)");
    assert.equal(p.reviews[0].text, "Review text 1");
    assert.equal(p.reviews[2].text, "Original 3");
    assert.equal(p.reviews[0].authorUri, "https://www.google.com/maps/contrib/1");
    assert.equal(p.reviews[0].authorPhotoUri, "https://lh3.googleusercontent.com/a/1");
    assert.equal(p.reviews[0].relativeTime, "1 weeks ago");
    assert.equal(p.reviews[0].googleMapsUri, "https://www.google.com/maps/reviews/data=1");
    assert.deepEqual(p.attributions, [{ provider: "Some Provider", providerUri: "https://provider.example/" }]);
    assert.equal(g.parsePlaceDetails({}), null);
    assert.equal(g.parsePlaceDetails("nope"), null);
  });

  await test("getPlaceDetails sends key + field mask, limits to maxReviews", async () => {
    g.clearPlacesCache(); calls = 0;
    const p = await g.getPlaceDetails(PLACE_ID, { settings: { ...base, maxReviews: 2 } });
    assert.ok(p);
    assert.equal(p!.reviews.length, 2);
    assert.equal(calls, 1);
    assert.ok(lastUrl.startsWith(`https://places.googleapis.com/v1/places/${PLACE_ID}`));
    assert.equal(lastHeaders["X-Goog-Api-Key"], "test-key-not-real");
    assert.equal(lastHeaders["X-Goog-FieldMask"], "id,displayName,rating,userRatingCount,reviews,googleMapsUri,attributions");
  });

  await test("cache: second call within TTL does not refetch; maxReviews applied per read", async () => {
    calls = 0;
    const p = await g.getPlaceDetails(PLACE_ID, { settings: { ...base, maxReviews: 5 } });
    assert.equal(calls, 0);
    assert.equal(p!.reviews.length, 5);
  });

  await test("cacheMinutes = 0 disables caching", async () => {
    g.clearPlacesCache(); calls = 0;
    await g.getPlaceDetails(PLACE_ID, { settings: { ...base, cacheMinutes: 0 } });
    await g.getPlaceDetails(PLACE_ID, { settings: { ...base, cacheMinutes: 0 } });
    assert.equal(calls, 2);
    assert.equal(g.placesCacheSize(), 0);
  });

  await test("graceful null on HTTP error and on thrown network error", async () => {
    g.clearPlacesCache();
    mode = "fail";
    assert.equal(await g.getPlaceDetails(PLACE_ID, { settings: { ...base, cacheMinutes: 0 } }), null);
    mode = "throw";
    assert.equal(await g.getPlaceDetails(PLACE_ID, { settings: { ...base, cacheMinutes: 0 } }), null);
    const r = await g.lookupPlace(PLACE_ID);
    assert.equal(r.ok, false);
    mode = "ok";
  });

  await test("null (no fetch) when disabled, key missing or Place ID invalid", async () => {
    g.clearPlacesCache(); calls = 0;
    assert.equal(await g.getPlaceDetails(PLACE_ID, { settings: { ...base, enabled: false } }), null);
    assert.equal(await g.getPlaceDetails("bad id!", { settings: base }), null);
    const k = process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    assert.equal(await g.getPlaceDetails(PLACE_ID, { settings: base }), null);
    process.env.GOOGLE_PLACES_API_KEY = k;
    assert.equal(calls, 0);
  });

  await test("validation: Place IDs and Google Maps URLs", () => {
    assert.ok(g.isValidPlaceId(PLACE_ID));
    assert.ok(!g.isValidPlaceId("short"));
    assert.ok(!g.isValidPlaceId("has spaces in it here"));
    assert.ok(g.normalizeGoogleMapsUrl("https://www.google.com/maps/place/Test+Diner/@40.5,-81.4,17z"));
    assert.ok(g.normalizeGoogleMapsUrl("maps.app.goo.gl/AbCdEf123"));
    assert.ok(g.normalizeGoogleMapsUrl("https://goo.gl/maps/xyz"));
    assert.ok(g.normalizeGoogleMapsUrl("https://maps.google.com/?cid=123"));
    assert.equal(g.normalizeGoogleMapsUrl("https://evil.com/maps/x"), null);
    assert.equal(g.normalizeGoogleMapsUrl("https://google.com.evil.com/maps"), null);
    assert.equal(g.normalizeGoogleMapsUrl("https://goo.gl/other"), null);
    assert.equal(g.normalizeGoogleMapsUrl("javascript:alert(1)"), null);
    const parsed = g.parseListingInput("", `https://www.google.com/maps/place/?q=place_id:${PLACE_ID}`);
    assert.equal(parsed.data?.placeId, PLACE_ID);
    const pasted = g.parseListingInput(`https://www.google.com/maps/search/?api=1&query=x&query_place_id=${PLACE_ID}`, "");
    assert.equal(pasted.data?.placeId, PLACE_ID);
    assert.ok(pasted.data?.mapsUrl);
    assert.ok(g.parseListingInput("not a place id!", "").fieldErrors?.googlePlaceId);
    assert.ok(g.parseListingInput("", "https://example.com/").fieldErrors?.googleMapsUrl);
  });

  await test("settings normalization clamps values", () => {
    assert.deepEqual(g.normalizeGooglePlacesSettings({ maxReviews: 9, cacheMinutes: -4, enabled: false }), { enabled: false, showReviews: true, maxReviews: 5, cacheMinutes: 0 });
    assert.deepEqual(g.normalizeGooglePlacesSettings(null), g.DEFAULT_GOOGLE_PLACES_SETTINGS);
  });

  console.error = origErr;
  console.log(`\n${passed} tests passed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

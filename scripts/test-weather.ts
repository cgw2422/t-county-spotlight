/**
 * Newsletter weather (National Weather Service → 3-day forecast → RSS for beehiiv). No network: NWS is mocked.
 *
 *   DATABASE_URL=… npx tsx --conditions=react-server scripts/test-weather.ts
 *
 * Covers: day building (starts tomorrow after "Tonight", includes today when its daytime period is there, holiday
 * names, Celsius, missing night, precipitation = max of day/night, icons); caching (no NWS call within 30 min);
 * one stored row per distinct forecast (stable image id); new forecast → new id; NWS failure → last forecast,
 * marked stale, past days dropped; RSS structure and escaping. Removes the rows it creates.
 */
import assert from "node:assert/strict";

process.env.APP_URL ||= "https://tcountyconnect.com";
const results: string[] = [];
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); results.push(`PASS ${name}`); } catch (e) { failed++; results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`); }
}

type P = { startTime: string; isDaytime: boolean; temperature: number; temperatureUnit?: string; probabilityOfPrecipitation?: { value: number | null }; shortForecast: string; name?: string };
const per = (start: string, isDaytime: boolean, temperature: number, pop: number | null, shortForecast: string, name?: string): P =>
  ({ startTime: start, isDaytime, temperature, temperatureUnit: "F", probabilityOfPrecipitation: { value: pop }, shortForecast, name });

async function main() {
  const { db } = await import("@/lib/db");
  const w = await import("@/lib/weather/shared");
  const fc = await import("@/lib/weather/forecast");
  const { weatherRss } = await import("@/lib/weather/rss");

  const evening = [
    per("2026-11-22T20:00:00-05:00", false, 42, 65, "Light Rain Likely", "Tonight"),
    per("2026-11-23T06:00:00-05:00", true, 50, 0, "Mostly Sunny", "Monday"),
    per("2026-11-23T18:00:00-05:00", false, 28, 4, "Mostly Clear"),
    per("2026-11-24T06:00:00-05:00", true, 44, 2, "Sunny"),
    per("2026-11-24T18:00:00-05:00", false, 25, 0, "Partly Cloudy"),
    per("2026-11-25T06:00:00-05:00", true, 48, 2, "Mostly Sunny"),
    per("2026-11-25T18:00:00-05:00", false, 36, 37, "Mostly Cloudy then Chance Light Rain"),
    per("2026-11-26T06:00:00-05:00", true, 48, 73, "Light Rain Likely", "Thanksgiving Day"),
    per("2026-11-26T18:00:00-05:00", false, 33, 60, "Rain And Snow Showers Likely"),
  ];

  await test("evening: skips Tonight, starts tomorrow; highs, lows, precip = max(day, night)", () => {
    const d = w.buildDays(evening, 3, new Date("2026-11-23T02:00:00Z"));
    assert.deepEqual(d.map((x) => `${x.weekday} ${x.monthDay} ${x.high}/${x.low} ${x.precip}% ${x.icon} ${x.summary}`), [
      "Mon Nov 23 50/28 4% partly Mostly Sunny",
      "Tue Nov 24 44/25 2% sunny Sunny",
      "Wed Nov 25 48/36 37% partly Mostly Sunny",
    ]);
  });
  await test("morning: today included; holiday names ignored (labels from the date)", () => {
    const d = w.buildDays(evening.slice(1), 4, new Date("2026-11-23T12:00:00Z"));
    assert.equal(d[0].weekday, "Mon"); assert.equal(d[3].weekdayLong, "Thursday"); assert.equal(d[3].icon, "rain");
  });
  await test("afternoon period, missing night, Celsius, null precipitation", () => {
    const d = w.buildDays([
      per("2026-11-23T14:00:00-05:00", true, 10, null, "Chance Snow Showers"),
      { ...per("2026-11-24T06:00:00-05:00", true, 0, 20, "Freezing Drizzle"), temperatureUnit: "C" },
    ], 3, new Date("2026-11-23T19:00:00Z"));
    assert.equal(d.length, 2); assert.equal(d[0].low, null); assert.equal(d[0].precip, 0); assert.equal(d[0].icon, "snow");
    assert.equal(d[1].high, 32); assert.equal(d[1].icon, "mix");
  });
  await test("icons and summaries", () => {
    const cases: [string, string][] = [["Chance Showers And Thunderstorms", "storm"], ["Areas Of Fog", "fog"], ["Cloudy", "cloudy"], ["Partly Sunny", "partly"], ["Breezy", "wind"], ["Clear", "sunny"], ["Snow Likely", "snow"], ["Rain And Snow", "mix"]];
    for (const [t, i] of cases) assert.equal(w.iconFor(t), i, t);
    assert.equal(w.shortSummary("Mostly Cloudy then Chance Light Rain"), "Mostly Cloudy");
    assert.ok(w.shortSummary("A Very Long Forecast Description That Goes On And On").length <= 32);
  });

  // ── caching / storage with a mock NWS
  await db.weatherForecast.deleteMany({});
  let calls = 0;
  let mode: "ok" | "changed" | "down" = "ok";
  const mock: typeof fetch = async (input) => {
    calls++;
    const url = String(input);
    if (mode === "down") return new Response("{}", { status: 503 });
    if (url.includes("/points/")) return Response.json({ properties: { forecast: "https://api.weather.gov/gridpoints/PBZ/27,63/forecast" } });
    const periods = mode === "changed" ? evening.map((p, i) => (i === 1 ? { ...p, temperature: 52 } : p)) : evening;
    return Response.json({ properties: { updateTime: mode === "changed" ? "2026-11-23T04:00:00+00:00" : "2026-11-22T22:16:20+00:00", periods } });
  };
  const t0 = new Date("2026-11-23T02:00:00Z");
  fc.resetWeatherCache();
  let firstId = "";
  await test("first request fetches NWS and stores the forecast", async () => {
    const f = await fc.getCurrentForecast({ fetchImpl: mock, now: t0 });
    assert.ok(f && !f.stale && f.days.length === 3);
    firstId = f!.id;
    assert.equal(calls, 2, "points + forecast");
  });
  await test("within 30 minutes: served from storage, no NWS call", async () => {
    calls = 0;
    const f = await fc.getCurrentForecast({ fetchImpl: mock, now: new Date(t0.getTime() + 10 * 60_000) });
    assert.equal(f!.id, firstId); assert.equal(calls, 0);
  });
  await test("after 30 minutes, same forecast: same row and image id (no duplicate)", async () => {
    const f = await fc.getCurrentForecast({ fetchImpl: mock, now: new Date(t0.getTime() + 40 * 60_000) });
    assert.equal(f!.id, firstId); assert.equal(await db.weatherForecast.count(), 1);
  });
  await test("new NWS forecast → new row and new image id; old one kept unchanged", async () => {
    mode = "changed";
    const f = await fc.getCurrentForecast({ force: true, fetchImpl: mock, now: new Date(t0.getTime() + 50 * 60_000) });
    assert.notEqual(f!.id, firstId); assert.equal(f!.days[0].high, 52);
    const old = await fc.getStoredForecast(firstId);
    assert.equal(old!.days[0].high, 50, "earlier forecast (and its image) never changes");
  });
  await test("NWS down: last forecast served, marked stale; past days dropped later", async () => {
    mode = "down";
    const f = await fc.getCurrentForecast({ force: true, fetchImpl: mock, now: new Date(t0.getTime() + 60 * 60_000) });
    assert.ok(f!.stale && f!.error); assert.equal(f!.days.length, 3);
    const later = await fc.getCurrentForecast({ force: true, fetchImpl: mock, now: new Date("2026-11-24T15:00:00Z") });
    assert.deepEqual(later!.days.map((d) => d.weekday), ["Tue", "Wed"]);
  });
  await test("RSS: one item, permanent image, escaped text, plain-text description", async () => {
    mode = "ok";
    const f = (await fc.getCurrentForecast({ force: true, fetchImpl: mock, now: t0 }))!;
    const xml = weatherRss({ ...f, days: f.days.map((d, i) => (i === 0 ? { ...d, summary: "Rain & <Snow>" } : d)) });
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.equal((xml.match(/<item>/g) ?? []).length, 1);
    assert.ok(xml.includes(`https://tcountyconnect.com/weather/forecast/${f.id}.png`));
    assert.ok(xml.includes('<enclosure url="https://tcountyconnect.com/weather/forecast/') && xml.includes('medium="image"'));
    assert.ok(xml.includes("Rain &amp; &lt;Snow&gt;") && !xml.includes("<Snow>"), "escaped outside CDATA");
    assert.match(xml, /<title>3-Day Forecast for Tuscarawas County: Mon, Nov 23 – Wed, Nov 25<\/title>/);
    assert.match(xml, /<guid isPermaLink="false">tcountyconnect-weather-/);
    assert.ok(!/<description>[^<]*<img/.test(xml), "description is plain text");
  });
  await db.weatherForecast.deleteMany({});
  console.log(results.join("\n"));
  console.log(failed ? `${failed} FAILED` : `ALL ${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

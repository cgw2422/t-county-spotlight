import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { buildDays, upcomingDays, WEATHER_LOCATION, type NwsPeriod, type WeatherDay } from "./shared";

/**
 * Newsletter weather from the National Weather Service (api.weather.gov — free, no key). The current forecast is
 * re-checked at most every REFRESH_MS; each distinct forecast is stored once (immutable rows), so the image URL
 * for a forecast never changes. If NWS is unavailable, the last stored forecast is served (marked stale).
 */
export const REFRESH_MS = 30 * 60_000;
const NWS = "https://api.weather.gov";
/** NWS asks every client to identify itself (no personal data). */
const USER_AGENT = "(tcountyconnect.com newsletter weather, info@tcountyconnect.com)";
const KEEP_DAYS = 60;

export type StoredForecast = { id: string; issuedAt: Date; fetchedAt: Date; createdAt: Date; days: WeatherDay[] };
export type CurrentForecast = StoredForecast & { stale: boolean; error: string | null };

async function nwsJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`National Weather Service returned HTTP ${res.status}`);
  return (await res.json()) as T;
}

let forecastUrl: string | null = null;

/** Fresh 3-day forecast from NWS (points → gridpoint forecast). Throws when NWS can't provide one. */
export async function fetchNwsForecast(fetchImpl: typeof fetch = fetch, now = new Date()) {
  if (!forecastUrl) {
    const pt = await nwsJson<{ properties?: { forecast?: string } }>(`${NWS}/points/${WEATHER_LOCATION.lat},${WEATHER_LOCATION.lon}`, fetchImpl);
    const url = pt.properties?.forecast;
    if (!url || !url.startsWith(`${NWS}/`)) throw new Error("National Weather Service didn't return a forecast for New Philadelphia");
    forecastUrl = url;
  }
  const f = await nwsJson<{ properties?: { updateTime?: string; generatedAt?: string; periods?: NwsPeriod[] } }>(forecastUrl, fetchImpl);
  const periods = f.properties?.periods;
  if (!Array.isArray(periods) || !periods.length) throw new Error("National Weather Service returned no forecast periods");
  const days = buildDays(periods, 3, now);
  if (days.length < 3) throw new Error("National Weather Service returned fewer than 3 forecast days");
  const issued = new Date(f.properties?.updateTime ?? f.properties?.generatedAt ?? now.toISOString());
  return { issuedAt: Number.isNaN(issued.getTime()) ? now : issued, days };
}

const toStored = (r: { id: string; issuedAt: Date; fetchedAt: Date; createdAt: Date; days: Prisma.JsonValue }): StoredForecast =>
  ({ id: r.id, issuedAt: r.issuedAt, fetchedAt: r.fetchedAt, createdAt: r.createdAt, days: (Array.isArray(r.days) ? r.days : []) as unknown as WeatherDay[] });

export async function latestStoredForecast() {
  const r = await db.weatherForecast.findFirst({ orderBy: [{ fetchedAt: "desc" }, { createdAt: "desc" }] });
  return r ? toStored(r) : null;
}

export async function getStoredForecast(id: string) {
  const r = await db.weatherForecast.findUnique({ where: { id } });
  return r ? toStored(r) : null;
}

/** Stores the forecast (once per distinct content) and marks it as the latest confirmed one. */
export async function saveForecast(f: { issuedAt: Date; days: WeatherDay[] }, now = new Date()) {
  const hash = crypto.createHash("sha256").update(JSON.stringify({ issuedAt: f.issuedAt.toISOString(), days: f.days })).digest("hex");
  const r = await db.weatherForecast.upsert({
    where: { hash },
    create: { hash, issuedAt: f.issuedAt, fetchedAt: now, days: f.days as unknown as Prisma.InputJsonValue },
    update: { fetchedAt: now },
  });
  await db.weatherForecast.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86400_000) } } }).catch(() => {});
  return toStored(r);
}

let inflight: Promise<CurrentForecast | null> | null = null;

/**
 * The forecast to publish: the stored one if NWS confirmed it within REFRESH_MS, otherwise a fresh NWS fetch.
 * On NWS failure the last stored forecast is returned with stale=true (past days dropped). Null only when nothing
 * has ever been fetched and NWS is down.
 */
export async function getCurrentForecast(opts: { force?: boolean; fetchImpl?: typeof fetch; now?: Date } = {}): Promise<CurrentForecast | null> {
  const now = opts.now ?? new Date();
  const latest = await latestStoredForecast();
  if (!opts.force && latest && now.getTime() - latest.fetchedAt.getTime() < REFRESH_MS && upcomingDays(latest.days, now).length === 3) {
    return { ...latest, stale: false, error: null };
  }
  if (!inflight || opts.fetchImpl || opts.force) {
    const run = (async () => {
      try {
        const fresh = await fetchNwsForecast(opts.fetchImpl ?? fetch, now);
        return { ...(await saveForecast(fresh, now)), stale: false, error: null };
      } catch (e) {
        const message = (e as Error).message.slice(0, 200);
        console.error("[weather] NWS fetch failed:", message);
        const last = await latestStoredForecast();
        return last ? { ...last, days: upcomingDays(last.days, now), stale: true, error: message } : null;
      }
    })();
    if (opts.fetchImpl || opts.force) return run;
    inflight = run.finally(() => { inflight = null; });
  }
  return inflight;
}

/** For tests: forget the cached gridpoint URL. */
export function resetWeatherCache() {
  forecastUrl = null;
  inflight = null;
}

/**
 * Newsletter weather — pure, dependency-free helpers (NWS periods → 3 forecast days, icon choice, text summary).
 * Used by the RSS feed, the forecast image, the admin preview and scripts/test-weather.ts.
 */

/** New Philadelphia, Ohio (Tuscarawas County seat). NWS grid PBZ 27,63 (Pittsburgh forecast office). */
export const WEATHER_LOCATION = { name: "New Philadelphia, OH", area: "Tuscarawas County", lat: 40.4898, lon: -81.4457 } as const;
export const WEATHER_TZ = "America/New_York";
/** Public NWS forecast page for the same point (the feed item's link). */
export const NWS_FORECAST_PAGE = `https://forecast.weather.gov/MapClick.php?lat=${WEATHER_LOCATION.lat}&lon=${WEATHER_LOCATION.lon}`;
export const WEATHER_FEED_PATH = "/weather/rss/";
export const forecastImagePath = (id: string) => `/weather/forecast/${id}.png`;

export type WeatherIcon = "sunny" | "partly" | "cloudy" | "rain" | "storm" | "snow" | "mix" | "fog" | "wind";

export type WeatherDay = {
  /** YYYY-MM-DD in America/New_York */
  date: string;
  /** "Mon" */
  weekday: string;
  /** "Monday" */
  weekdayLong: string;
  /** "Nov 23" */
  monthDay: string;
  high: number | null;
  low: number | null;
  /** Short description, first clause of NWS shortForecast (e.g. "Mostly Sunny") */
  summary: string;
  /** Full NWS short forecast for the daytime period */
  shortForecast: string;
  /** Highest chance of precipitation across the day and the following night, 0–100 */
  precip: number;
  icon: WeatherIcon;
};

export type NwsPeriod = {
  number?: number;
  name?: string;
  startTime: string;
  endTime?: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit?: string;
  probabilityOfPrecipitation?: { value: number | null } | null;
  shortForecast?: string | null;
};

const dateKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: WEATHER_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** Noon on that calendar day, so weekday/month labels never shift with time zones. */
const labelDate = (key: string) => new Date(`${key}T12:00:00Z`);

const toF = (t: number | null, unit?: string) => (t === null || t === undefined ? null : unit === "C" ? Math.round((t * 9) / 5 + 32) : Math.round(t));
const pop = (p?: NwsPeriod | null) => Math.max(0, Math.min(100, Math.round(p?.probabilityOfPrecipitation?.value ?? 0)));

/** "Mostly Cloudy then Chance Light Rain" → "Mostly Cloudy"; tidy, ≤ 32 characters for the card. */
export function shortSummary(s: string | null | undefined) {
  const first = String(s ?? "").split(/\s+then\s+/i)[0].replace(/\s+/g, " ").trim();
  if (!first) return "—";
  return first.length > 32 ? `${first.slice(0, 31).trimEnd()}…` : first;
}

/** Icon for a short forecast (checked most severe first). */
export function iconFor(text: string | null | undefined): WeatherIcon {
  const t = String(text ?? "").toLowerCase();
  if (/thunder|t-storm|tstorm/.test(t)) return "storm";
  if (/freezing|sleet|wintry|ice pellets|rain and snow|snow and rain|mix/.test(t)) return "mix";
  if (/snow|flurr|blizzard/.test(t)) return "snow";
  if (/rain|shower|drizzle/.test(t)) return "rain";
  if (/fog|haze|smoke|mist/.test(t)) return "fog";
  if (/partly|mostly sunny|mostly clear|few clouds|scattered clouds/.test(t)) return "partly";
  if (/cloud|overcast/.test(t)) return "cloudy";
  if (/wind|breezy|blustery/.test(t)) return "wind";
  return "sunny";
}

/**
 * NWS 12-hour periods → the next `count` forecast days. A day needs its daytime period (so "Tonight" alone is
 * skipped and the forecast starts with tomorrow); the low comes from the night that follows. Days are labelled
 * from their dates, never from NWS names like "Thanksgiving Day".
 */
export function buildDays(periods: NwsPeriod[], count = 3, now = new Date()): WeatherDay[] {
  const today = dateKey(now.toISOString());
  const byDate = new Map<string, { day?: NwsPeriod; night?: NwsPeriod }>();
  for (const p of periods) {
    if (!p?.startTime) continue;
    const key = dateKey(p.startTime);
    const slot = byDate.get(key) ?? {};
    if (p.isDaytime) slot.day ??= p;
    else slot.night ??= p;
    byDate.set(key, slot);
  }
  const days: WeatherDay[] = [];
  for (const [key, { day, night }] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!day || key < today) continue;
    const d = labelDate(key);
    const short = day.shortForecast ?? "";
    days.push({
      date: key,
      weekday: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(d),
      weekdayLong: new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(d),
      monthDay: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d),
      high: toF(day.temperature, day.temperatureUnit),
      low: night ? toF(night.temperature, night.temperatureUnit) : null,
      summary: shortSummary(short),
      shortForecast: short.slice(0, 200),
      precip: Math.max(pop(day), pop(night)),
      icon: iconFor(short),
    });
    if (days.length === count) break;
  }
  return days;
}

/** Days that haven't passed yet (a stored forecast keeps working if NWS is briefly unavailable). */
export function upcomingDays(days: WeatherDay[], now = new Date(), count = 3) {
  const today = dateKey(now.toISOString());
  return days.filter((d) => d.date >= today).slice(0, count);
}

export const tempText = (t: number | null) => (t === null ? "—" : `${t}°`);

/** One line per day, e.g. "Mon, Nov 23: Mostly Sunny. High 50°, low 28°. 4% chance of precipitation." */
export function dayLine(d: WeatherDay) {
  const temps = [d.high !== null ? `High ${d.high}°` : null, d.low !== null ? `low ${d.low}°` : null].filter(Boolean).join(", ");
  return `${d.weekday}, ${d.monthDay}: ${d.summary}.${temps ? ` ${temps}.` : ""} ${d.precip}% chance of precipitation.`;
}

export const forecastTitle = (days: WeatherDay[]) =>
  days.length ? `3-Day Forecast for ${WEATHER_LOCATION.area}: ${days[0].weekday}, ${days[0].monthDay} – ${days[days.length - 1].weekday}, ${days[days.length - 1].monthDay}` : `3-Day Forecast for ${WEATHER_LOCATION.area}`;

/** "Mon, Nov 23, 7:16 AM" in Eastern time. */
export const easternTime = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: WEATHER_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

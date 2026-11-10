/**
 * Seasonal theme logic (pure — safe on server, client and in unit tests).
 *
 * Seasons switch automatically by calendar date in America/New_York (start
 * dates configurable by the admin) or are activated manually. The visual side
 * is a small set of CSS variables (`--season-*`, see globals.css) whose `:root`
 * defaults equal the normal brand look; `html[data-season="…"]` overrides them.
 * The values below mirror globals.css so contrast can be verified in tests and
 * swatches shown in the admin.
 */

export const SEASONS = ["spring", "summer", "fall", "winter"] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABEL: Record<Season, string> = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" };
export const isSeason = (v: unknown): v is Season => typeof v === "string" && (SEASONS as readonly string[]).includes(v);

export const TIME_ZONE = "America/New_York";

export type MonthDay = { month: number; day: number };
export const DEFAULT_SEASON_STARTS: Record<Season, MonthDay> = {
  spring: { month: 3, day: 1 },
  summer: { month: 6, day: 1 },
  fall: { month: 9, day: 1 },
  winter: { month: 12, day: 1 },
};
/** Days per month in a leap year (Feb 29 allowed as a start; in other years it behaves like Mar 1). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: number) => MONTHS[m - 1] ?? "";
export const formatMonthDay = (md: MonthDay) => `${monthName(md.month)} ${md.day}`;

const ndFmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "numeric", day: "numeric" });
/** Calendar month/day of `now` in America/New_York. */
export function nyMonthDay(now: Date): MonthDay {
  const parts = ndFmt.formatToParts(now);
  return { month: Number(parts.find((p) => p.type === "month")?.value), day: Number(parts.find((p) => p.type === "day")?.value) };
}

const key = (md: MonthDay) => md.month * 100 + md.day;

export function isValidMonthDay(md: MonthDay) {
  return Number.isInteger(md.month) && Number.isInteger(md.day) && md.month >= 1 && md.month <= 12 && md.day >= 1 && md.day <= DAYS_IN_MONTH[md.month - 1];
}

/**
 * Start dates must be valid, distinct and keep the natural order
 * spring → summer → fall → winter (winter may wrap past New Year).
 * Returns an error message or null.
 */
export function validateSeasonStarts(starts: Record<Season, MonthDay>): string | null {
  for (const s of SEASONS) if (!isValidMonthDay(starts[s])) return `${SEASON_LABEL[s]} start date is not a valid date.`;
  const keys = SEASONS.map((s) => key(starts[s]));
  if (new Set(keys).size !== keys.length) return "Each season needs its own start date.";
  // cyclic order: exactly one "wrap" when walking spring→summer→fall→winter→spring
  let wraps = 0;
  for (let i = 0; i < 4; i++) if (keys[(i + 1) % 4] < keys[i]) wraps++;
  if (wraps !== 1) return "Seasons must stay in order: spring, then summer, then fall, then winter.";
  return null;
}

/** The season for `now` (America/New_York calendar date) given start dates. */
export function seasonForDate(now: Date = new Date(), starts: Record<Season, MonthDay> = DEFAULT_SEASON_STARTS): Season {
  const s = validateSeasonStarts(starts) ? DEFAULT_SEASON_STARTS : starts;
  const today = key(nyMonthDay(now));
  const sorted = [...SEASONS].sort((a, b) => key(s[a]) - key(s[b]));
  let current = sorted[sorted.length - 1]; // before the first start of the year → last season (wraps)
  for (const x of sorted) if (key(s[x]) <= today) current = x;
  return current;
}

// ───────────── Colors & contrast ─────────────

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
export function luminance(c: string | [number, number, number]) {
  const [r, g, b] = typeof c === "string" ? hexToRgb(c) : c;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrastRatio(a: string | [number, number, number], b: string | [number, number, number]) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** `fg` at `alpha` composited over `bg`. */
export function mix(fg: string | [number, number, number], alpha: number, bg: string | [number, number, number]): [number, number, number] {
  const f = typeof fg === "string" ? hexToRgb(fg) : fg;
  const b = typeof bg === "string" ? hexToRgb(bg) : bg;
  return [0, 1, 2].map((i) => f[i] * alpha + b[i] * (1 - alpha)) as [number, number, number];
}

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

/** Per-season design tokens (mirrors `html[data-season]` in globals.css). */
export type SeasonTokens = {
  /** default accent (text/links/eyebrows on light backgrounds, button fill with white text) */
  accent: string;
  /** light section background */
  tint: string;
  /** small borders / highlight lines on light backgrounds (decorative) */
  border: string;
  /** eyebrow text on the dark hero */
  heroEyebrow: string;
  /** decorative glow in the default (no-photo) hero gradient */
  heroGlow: string;
  /** small decorative SVG accents (aria-hidden, non-text) */
  decor: string;
};

export const BRAND_TOKENS: SeasonTokens = {
  accent: "#387D14",
  tint: "transparent",
  border: "transparent",
  heroEyebrow: "#FFFFFF",
  heroGlow: "rgba(255,133,8,0.55)",
  decor: "#FF8508",
};

export const SEASON_TOKENS: Record<Season, SeasonTokens> = {
  spring: { accent: "#387D14", tint: "#F2F8EC", border: "#B9DB9F", heroEyebrow: "#DDF0CF", heroGlow: "rgba(74,154,30,0.5)", decor: "#4A9A1E" },
  summer: { accent: "#2B6110", tint: "#FFF7EB", border: "#FFC98A", heroEyebrow: "#FFE2BD", heroGlow: "rgba(255,161,66,0.6)", decor: "#FF8508" },
  fall: { accent: "#9A4A00", tint: "#FCF3E8", border: "#F2C58F", heroEyebrow: "#FFD3A1", heroGlow: "rgba(255,133,8,0.65)", decor: "#FF8508" },
  winter: { accent: "#2A5289", tint: "#EEF3FA", border: "#B9C8DE", heroEyebrow: "#DCE8F7", heroGlow: "rgba(140,180,230,0.5)", decor: "#8FB3E0" },
};

/** Curated accent palette (all brand-derived; each passes AA on white, Off White and every season tint). */
export const ACCENT_PRESETS = [
  { id: "hillside", label: "Hillside Green", hex: "#387D14" },
  { id: "deep-green", label: "Deep Hillside Green", hex: "#2B6110" },
  { id: "burnt-orange", label: "Burnt Orange", hex: "#9A4A00" },
  { id: "harvest-gold", label: "Harvest Gold", hex: "#8A5A00" },
  { id: "barn-red", label: "Barn Red", hex: "#A0461C" },
  { id: "county-navy", label: "County Navy", hex: "#0B2340" },
  { id: "winter-blue", label: "Winter Blue", hex: "#2A5289" },
  { id: "river-blue", label: "River Blue", hex: "#1F5F8B" },
] as const;

/** Backgrounds an accent must be readable on (as text) — and white text on the accent as a button. */
export function accentBackgrounds(season: Season) {
  return ["#FFFFFF", "#F7F8F5", SEASON_TOKENS[season].tint];
}

/** Lowest contrast of the accent against its backgrounds (white text on accent = accent on white). */
export function accentMinContrast(hex: string, season: Season) {
  return Math.min(...accentBackgrounds(season).map((b) => contrastRatio(hex, b)));
}

/** null when the accent is acceptable, else a message. */
export function validateAccent(hex: string, season: Season): string | null {
  if (!isHex(hex)) return "Use a 6-digit hex color like #387D14.";
  const min = accentMinContrast(hex, season);
  if (min < AA_TEXT) return `${hex.toUpperCase()} is too light for readable text (contrast ${min.toFixed(2)}:1; needs at least 4.5:1). Choose a darker color.`;
  return null;
}

// ───────────── Hero readability ─────────────

const NAVY_900 = "#0B2340";
const NAVY_950 = "#061527";
/**
 * Worst case behind hero text: a pure-white photo, under the admin's navy
 * overlay and the always-on left-to-right shade (70% → 30% → 0% navy-950).
 * `x` is the horizontal position (0 = left edge, 1 = right edge).
 */
export function heroWorstCaseBackground(overlayPct: number, x = 1): [number, number, number] {
  const afterOverlay = mix(NAVY_900, overlayPct / 100, "#FFFFFF");
  const shade = x <= 0.5 ? 0.7 - (0.4 * x) / 0.5 : 0.3 - (0.3 * (x - 0.5)) / 0.5;
  return mix(NAVY_950, Math.max(0, shade), afterOverlay);
}
/** Contrast of white hero text over the worst case (right edge = where mobile text ends). */
export function heroTextContrast(overlayPct: number, x = 1) {
  return contrastRatio("#FFFFFF", heroWorstCaseBackground(overlayPct, x));
}
/** Smallest overlay that keeps white body text ≥ 4.5:1 on any photo. */
export const SAFE_HERO_OVERLAY = (() => {
  for (let o = 0; o <= 100; o++) if (heroTextContrast(o) >= AA_TEXT) return o;
  return 100;
})();
export const SEASON_OVERLAY_MAX = 80;
export const SEASON_OVERLAY_DEFAULT = 65;

export function heroReadability(overlayPct: number): "good" | "large-only" | "check" {
  const c = heroTextContrast(overlayPct);
  return c >= AA_TEXT ? "good" : c >= AA_LARGE ? "large-only" : "check";
}

// ───────────── Config ─────────────

export type SeasonHero = {
  imageUrl: string | null; imageAlt: string; mobileImageUrl: string | null;
  desktopFocusX: number; desktopFocusY: number; mobileFocusX: number; mobileFocusY: number; overlay: number;
};
export type SeasonPicks = { collectionIds: string[]; articleIds: string[]; eventIds: string[] };
export type SeasonSettings = { accent: string; eyebrow: string; hero: SeasonHero; picks: SeasonPicks };
export type SeasonalMode = "auto" | "manual";
export type SeasonalConfig = {
  enabled: boolean;
  mode: SeasonalMode;
  manualSeason: Season;
  starts: Record<Season, MonthDay>;
  /** tiny decorative SVG accents (leaf, sun, snowflake, blossom) */
  showAccents: boolean;
  seasons: Record<Season, SeasonSettings>;
};

export const DEFAULT_EYEBROW: Record<Season, string> = {
  spring: "This spring in T County",
  summer: "This summer in T County",
  fall: "This fall in T County",
  winter: "This winter in T County",
};

export const EMPTY_SEASON_HERO: SeasonHero = {
  imageUrl: null, imageAlt: "", mobileImageUrl: null,
  desktopFocusX: 50, desktopFocusY: 50, mobileFocusX: 50, mobileFocusY: 50, overlay: SEASON_OVERLAY_DEFAULT,
};

export function defaultSeasonSettings(season: Season): SeasonSettings {
  return { accent: SEASON_TOKENS[season].accent, eyebrow: DEFAULT_EYEBROW[season], hero: { ...EMPTY_SEASON_HERO }, picks: { collectionIds: [], articleIds: [], eventIds: [] } };
}

export const DEFAULT_SEASONAL_CONFIG: SeasonalConfig = {
  enabled: false,
  mode: "auto",
  manualSeason: "fall",
  starts: DEFAULT_SEASON_STARTS,
  showAccents: true,
  seasons: { spring: defaultSeasonSettings("spring"), summer: defaultSeasonSettings("summer"), fall: defaultSeasonSettings("fall"), winter: defaultSeasonSettings("winter") },
};

const clampPct = (v: unknown, def: number, max = 100) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : def;
};
const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x)))].slice(0, 24) : []);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function normalizeSeasonHero(v: unknown): SeasonHero {
  const h = obj(v);
  const imageUrl = typeof h.imageUrl === "string" && h.imageUrl ? h.imageUrl : null;
  const mobile = typeof h.mobileImageUrl === "string" && h.mobileImageUrl ? h.mobileImageUrl : null;
  return {
    imageUrl,
    imageAlt: str(h.imageAlt, 300),
    mobileImageUrl: imageUrl ? mobile : null,
    desktopFocusX: clampPct(h.desktopFocusX, 50), desktopFocusY: clampPct(h.desktopFocusY, 50),
    mobileFocusX: clampPct(h.mobileFocusX, 50), mobileFocusY: clampPct(h.mobileFocusY, 50),
    overlay: clampPct(h.overlay, SEASON_OVERLAY_DEFAULT, SEASON_OVERLAY_MAX),
  };
}

/** Fills defaults, clamps numbers and drops anything invalid (e.g. a low-contrast accent). */
export function normalizeSeasonalConfig(v: unknown): SeasonalConfig {
  const c = obj(v);
  const startsIn = obj(c.starts);
  const starts = Object.fromEntries(SEASONS.map((s) => {
    const m = obj(startsIn[s]);
    const md = { month: Number(m.month), day: Number(m.day) };
    return [s, isValidMonthDay(md) ? md : DEFAULT_SEASON_STARTS[s]];
  })) as Record<Season, MonthDay>;
  const seasonsIn = obj(c.seasons);
  const seasons = Object.fromEntries(SEASONS.map((s) => {
    const x = obj(seasonsIn[s]);
    const p = obj(x.picks);
    const accent = isHex(x.accent) && !validateAccent(x.accent, s) ? x.accent.toUpperCase() : SEASON_TOKENS[s].accent;
    return [s, { accent, eyebrow: str(x.eyebrow, 60) || DEFAULT_EYEBROW[s], hero: normalizeSeasonHero(x.hero), picks: { collectionIds: ids(p.collectionIds), articleIds: ids(p.articleIds), eventIds: ids(p.eventIds) } }];
  })) as Record<Season, SeasonSettings>;
  return {
    enabled: c.enabled === true,
    mode: c.mode === "manual" ? "manual" : "auto",
    manualSeason: isSeason(c.manualSeason) ? c.manualSeason : DEFAULT_SEASONAL_CONFIG.manualSeason,
    starts: validateSeasonStarts(starts) ? DEFAULT_SEASON_STARTS : starts,
    showAccents: c.showAccents !== false,
    seasons,
  };
}

/** The season the site shows for `config` at `now`, or null when seasonal themes are off. */
export function activeSeason(config: SeasonalConfig | null | undefined, now: Date = new Date()): Season | null {
  if (!config?.enabled) return null;
  return config.mode === "manual" ? config.manualSeason : seasonForDate(now, config.starts);
}

/** CSS custom properties to put on <html> for an admin-chosen accent (only when it differs from the season default). */
export function seasonStyleVars(season: Season, settings: SeasonSettings): Record<string, string> | undefined {
  return settings.accent.toUpperCase() !== SEASON_TOKENS[season].accent.toUpperCase() ? { "--season-accent": settings.accent } : undefined;
}

// ───────────── Seasonal picks (homepage "Around T County This Season") ─────────────

/** Event attribute filters (keys of EVENT_ATTRIBUTE_FILTERS) and title keywords per season. */
export const SEASON_EVENT_ATTRIBUTES: Record<Season, string[]> = {
  spring: ["markets", "outdoor"],
  summer: ["festivals", "outdoor", "family"],
  fall: ["festivals", "markets"],
  winter: ["indoor", "church"],
};
export const SEASON_KEYWORDS: Record<Season, string[]> = {
  spring: ["spring", "easter", "blossom", "garden", "planting"],
  summer: ["summer", "fourth of july", "july 4th", "splash pad"],
  fall: ["fall", "autumn", "harvest", "pumpkin", "halloween", "hayride", "corn maze", "apple", "thanksgiving"],
  winter: ["winter", "christmas", "holiday", "tree lighting", "santa", "new year", "snow", "advent"],
};
/** Links to existing site sections that fit the season (shown only alongside real items). */
export const SEASON_LINKS: Record<Season, { label: string; href: string }[]> = {
  spring: [{ label: "Markets", href: "/events/?attr=markets" }, { label: "Outdoor events", href: "/events/?attr=outdoor" }],
  summer: [{ label: "Festivals", href: "/events/?attr=festivals" }, { label: "Outdoor events", href: "/events/?attr=outdoor" }, { label: "Family-friendly", href: "/events/?attr=family" }, { label: "Food trucks", href: "/food-trucks/" }],
  fall: [{ label: "Festivals", href: "/events/?attr=festivals" }, { label: "Markets", href: "/events/?attr=markets" }],
  winter: [{ label: "Indoor events", href: "/events/?attr=indoor" }, { label: "Church activities", href: "/events/?attr=church" }, { label: "T County Gives", href: "/gives/" }],
};

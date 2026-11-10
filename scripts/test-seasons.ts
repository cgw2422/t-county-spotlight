/**
 * Seasonal theme tests (pure, no database).
 *
 *   npx tsx scripts/test-seasons.ts
 *
 * Season boundaries in America/New_York (leap years, DST), custom start dates,
 * manual override, config normalization, accent/hero contrast in every theme,
 * and that SEASON_TOKENS match the CSS in globals.css.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AA_LARGE, AA_TEXT, ACCENT_PRESETS, activeSeason, BRAND_TOKENS, contrastRatio, DEFAULT_SEASON_STARTS, DEFAULT_SEASONAL_CONFIG, heroTextContrast,
  heroWorstCaseBackground, normalizeSeasonalConfig, nyMonthDay, SAFE_HERO_OVERLAY, SEASON_OVERLAY_DEFAULT, SEASON_TOKENS, SEASONS, seasonForDate,
  seasonStyleVars, validateAccent, validateSeasonStarts, type MonthDay, type Season,
} from "../src/lib/seasons";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const at = (iso: string) => new Date(iso);

console.log("Season boundaries (America/New_York)");
t("Feb 28 23:59 ET (non-leap 2027) is winter; Mar 1 00:00 ET is spring", () => {
  assert.equal(seasonForDate(at("2027-03-01T04:59:00Z")), "winter"); // Feb 28 23:59 EST
  assert.equal(seasonForDate(at("2027-03-01T05:00:00Z")), "spring"); // Mar 1 00:00 EST
});
t("Feb 29 23:59 ET (leap 2028) is winter; Mar 1 00:00 ET is spring", () => {
  assert.deepEqual(nyMonthDay(at("2028-03-01T04:59:00Z")), { month: 2, day: 29 });
  assert.equal(seasonForDate(at("2028-03-01T04:59:00Z")), "winter");
  assert.equal(seasonForDate(at("2028-03-01T05:00:00Z")), "spring");
});
t("UTC midnight is still the previous day in New York", () => {
  assert.equal(seasonForDate(at("2026-03-01T00:30:00Z")), "winter"); // Feb 28 19:30 EST
});
t("Jun 1, Sep 1 (EDT, UTC-4) and Dec 1 (EST, UTC-5) boundaries", () => {
  assert.equal(seasonForDate(at("2026-06-01T03:59:59Z")), "spring");
  assert.equal(seasonForDate(at("2026-06-01T04:00:00Z")), "summer");
  assert.equal(seasonForDate(at("2026-09-01T03:59:59Z")), "summer");
  assert.equal(seasonForDate(at("2026-09-01T04:00:00Z")), "fall");
  assert.equal(seasonForDate(at("2026-12-01T04:59:59Z")), "fall");
  assert.equal(seasonForDate(at("2026-12-01T05:00:00Z")), "winter");
  assert.equal(seasonForDate(at("2027-01-15T12:00:00Z")), "winter");
  assert.equal(seasonForDate(at("2026-11-10T12:00:00Z")), "fall");
});
t("DST transitions: custom start on the spring-forward (Mar 8 2026) and fall-back (Nov 1 2026) days", () => {
  const starts: Record<Season, MonthDay> = { spring: { month: 3, day: 8 }, summer: { month: 6, day: 21 }, fall: { month: 11, day: 1 }, winter: { month: 12, day: 21 } };
  assert.equal(seasonForDate(at("2026-03-08T04:59:00Z"), starts), "winter"); // Mar 7 23:59 EST
  assert.equal(seasonForDate(at("2026-03-08T05:00:00Z"), starts), "spring"); // Mar 8 00:00 EST
  assert.equal(seasonForDate(at("2026-03-08T07:30:00Z"), starts), "spring"); // 03:30 EDT, after the jump
  assert.equal(seasonForDate(at("2026-11-01T03:59:00Z"), starts), "summer"); // Oct 31 23:59 EDT
  assert.equal(seasonForDate(at("2026-11-01T04:00:00Z"), starts), "fall"); // Nov 1 00:00 EDT
  assert.equal(seasonForDate(at("2026-11-01T06:30:00Z"), starts), "fall"); // 01:30 EST (second 1 a.m.)
  assert.equal(seasonForDate(at("2026-12-21T04:59:00Z"), starts), "fall");
  assert.equal(seasonForDate(at("2026-12-21T05:00:00Z"), starts), "winter");
  assert.equal(seasonForDate(at("2027-03-07T12:00:00Z"), starts), "winter");
});
t("custom winter start in January (no wrap across New Year needed)", () => {
  const starts: Record<Season, MonthDay> = { spring: { month: 3, day: 20 }, summer: { month: 6, day: 20 }, fall: { month: 9, day: 22 }, winter: { month: 1, day: 5 } };
  assert.equal(validateSeasonStarts(starts), null);
  assert.equal(seasonForDate(at("2027-01-04T12:00:00Z"), starts), "fall");
  assert.equal(seasonForDate(at("2027-01-05T12:00:00Z"), starts), "winter");
  assert.equal(seasonForDate(at("2027-03-19T12:00:00Z"), starts), "winter");
  assert.equal(seasonForDate(at("2027-03-20T12:00:00Z"), starts), "spring");
});
t("Feb 29 start date: active from Feb 29 in leap years, from Mar 1 otherwise", () => {
  const starts = { ...DEFAULT_SEASON_STARTS, spring: { month: 2, day: 29 } };
  assert.equal(validateSeasonStarts(starts), null);
  assert.equal(seasonForDate(at("2028-02-29T12:00:00Z"), starts), "spring");
  assert.equal(seasonForDate(at("2027-02-28T12:00:00Z"), starts), "winter");
  assert.equal(seasonForDate(at("2027-03-01T12:00:00Z"), starts), "spring");
});
t("invalid / out-of-order start dates are rejected (and fall back to defaults)", () => {
  assert.match(validateSeasonStarts({ ...DEFAULT_SEASON_STARTS, summer: { month: 2, day: 1 } })!, /order/);
  assert.match(validateSeasonStarts({ ...DEFAULT_SEASON_STARTS, fall: { month: 6, day: 1 } })!, /own start date/);
  assert.match(validateSeasonStarts({ ...DEFAULT_SEASON_STARTS, fall: { month: 9, day: 31 } })!, /valid/);
  const bad = { ...DEFAULT_SEASON_STARTS, summer: { month: 2, day: 1 } };
  assert.equal(seasonForDate(at("2026-07-01T12:00:00Z"), bad), "summer");
  assert.deepEqual(normalizeSeasonalConfig({ starts: bad }).starts, DEFAULT_SEASON_STARTS);
});

console.log("Mode / config");
t("disabled → no season; auto → by date; manual → override", () => {
  const now = at("2026-07-04T16:00:00Z");
  assert.equal(activeSeason(null, now), null);
  assert.equal(activeSeason(DEFAULT_SEASONAL_CONFIG, now), null);
  assert.equal(activeSeason({ ...DEFAULT_SEASONAL_CONFIG, enabled: true }, now), "summer");
  assert.equal(activeSeason({ ...DEFAULT_SEASONAL_CONFIG, enabled: true, mode: "manual", manualSeason: "winter" }, now), "winter");
});
t("normalize drops low-contrast accents, clamps overlay to 0–80, dedupes ids", () => {
  const c = normalizeSeasonalConfig({
    enabled: true, mode: "manual", manualSeason: "fall",
    seasons: { fall: { accent: "#FFB766", hero: { imageUrl: "/media/x.jpg", overlay: 95, mobileImageUrl: "/media/y.jpg" }, picks: { eventIds: ["a", "a", "b", "bad id!"] } }, spring: { hero: { mobileImageUrl: "/media/m.jpg" } } },
  });
  assert.equal(c.seasons.fall.accent, SEASON_TOKENS.fall.accent);
  assert.equal(c.seasons.fall.hero.overlay, 80);
  assert.deepEqual(c.seasons.fall.picks.eventIds, ["a", "b"]);
  assert.equal(c.seasons.spring.hero.mobileImageUrl, null, "mobile image without a desktop image is dropped");
  assert.equal(c.seasons.winter.eyebrow, "This winter in T County");
  assert.equal(c.seasons.fall.eyebrow, "This fall in T County");
});
t("custom accent becomes an inline --season-accent only when it differs from the default", () => {
  const c = normalizeSeasonalConfig({ seasons: { fall: { accent: "#8A5A00" } } });
  assert.deepEqual(seasonStyleVars("fall", c.seasons.fall), { "--season-accent": "#8A5A00" });
  assert.equal(seasonStyleVars("spring", c.seasons.spring), undefined);
});

console.log("Contrast (WCAG AA)");
t("every season's default accent ≥ 4.5:1 on white, Off White and its tint; white on accent ≥ 4.5:1", () => {
  for (const s of SEASONS) {
    const a = SEASON_TOKENS[s].accent;
    for (const bg of ["#FFFFFF", "#F7F8F5", SEASON_TOKENS[s].tint]) assert.ok(contrastRatio(a, bg) >= AA_TEXT, `${s} accent ${a} on ${bg}: ${contrastRatio(a, bg).toFixed(2)}`);
    assert.equal(validateAccent(a, s), null);
  }
  assert.ok(contrastRatio(BRAND_TOKENS.accent, "#FFFFFF") >= AA_TEXT);
});
t("navy headings / slate-600 text readable on every tint", () => {
  for (const s of SEASONS) {
    assert.ok(contrastRatio("#0B2340", SEASON_TOKENS[s].tint) >= AA_TEXT);
    assert.ok(contrastRatio("#475569", SEASON_TOKENS[s].tint) >= AA_TEXT, `slate-600 on ${s} tint`);
  }
});
t("all curated presets pass for every season", () => {
  for (const p of ACCENT_PRESETS) for (const s of SEASONS) assert.equal(validateAccent(p.hex, s), null, `${p.label} in ${s}`);
});
t("low-contrast custom accents are rejected", () => {
  for (const hex of ["#FF8508", "#FFB766", "#B9DB9F", "#CCCCCC", "#FFFFFF", "#4A9A1E"]) assert.ok(validateAccent(hex, "fall"), `${hex} should be rejected`);
  assert.ok(validateAccent("orange", "fall"));
  assert.equal(validateAccent("#5A3A00", "fall"), null);
});
t("hero eyebrow colors ≥ 4.5:1 on the hero (worst case: white photo at the readable overlay, eyebrow area)", () => {
  for (const s of SEASONS) {
    const bg = heroWorstCaseBackground(SAFE_HERO_OVERLAY, 0.3);
    assert.ok(contrastRatio(SEASON_TOKENS[s].heroEyebrow, bg) >= AA_TEXT, `${s} eyebrow: ${contrastRatio(SEASON_TOKENS[s].heroEyebrow, bg).toFixed(2)}`);
    assert.ok(contrastRatio(SEASON_TOKENS[s].heroEyebrow, "#0B2340") >= AA_TEXT);
  }
});
t("default seasonal overlay keeps white hero text ≥ 4.5:1 even on a pure-white photo", () => {
  assert.ok(SEASON_OVERLAY_DEFAULT >= SAFE_HERO_OVERLAY);
  assert.ok(heroTextContrast(SEASON_OVERLAY_DEFAULT) >= AA_TEXT, heroTextContrast(SEASON_OVERLAY_DEFAULT).toFixed(2));
  assert.ok(heroTextContrast(80) >= AA_TEXT);
  assert.ok(heroTextContrast(SEASON_OVERLAY_DEFAULT, 0.3) >= AA_TEXT);
  assert.ok(heroTextContrast(30, 0.3) >= AA_LARGE, "headline (large text) at the left stays ≥ 3:1 even with a light overlay");
});
t("orange Search button (sunset-500 + navy text) ≥ 4.5:1", () => {
  assert.ok(contrastRatio("#FF8508", "#0B2340") >= AA_TEXT);
});

console.log("CSS tokens");
t("globals.css html[data-season] values match SEASON_TOKENS; :root defaults = brand look", () => {
  const css = readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");
  const block = (sel: string) => {
    const i = css.indexOf(sel);
    assert.ok(i >= 0, `missing ${sel}`);
    return css.slice(i, css.indexOf("}", i)).toLowerCase().replace(/\s+/g, "");
  };
  for (const s of SEASONS) {
    const b = block(`html[data-season="${s}"]`);
    const tk = SEASON_TOKENS[s];
    for (const [v, val] of [["accent", tk.accent], ["tint", tk.tint], ["border", tk.border], ["hero-eyebrow", tk.heroEyebrow], ["hero-glow", tk.heroGlow], ["decor", tk.decor]] as const) {
      assert.ok(b.includes(`--season-${v}:${val.toLowerCase().replace(/\s+/g, "")};`), `${s} --season-${v} should be ${val}`);
    }
  }
  const root = block(":root {\n  --season-accent");
  assert.ok(root.includes("--season-accent:#387d14;") && root.includes("--season-tint:transparent;") && root.includes("--season-hero-glow:rgba(255,133,8,0.55);"));
});

console.log(`\n${n} seasonal theme tests passed.`);

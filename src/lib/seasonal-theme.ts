import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getCurrentUser, isStaff, SESSION_COOKIE } from "./auth";
import {
  activeSeason, DEFAULT_SEASONAL_CONFIG, isSeason, normalizeSeasonalConfig, SEASON_LABEL, seasonStyleVars,
  type Season, type SeasonalConfig, type SeasonHero, type SeasonSettings,
} from "./seasons";

/**
 * Seasonal themes, stored as JSON in the Setting table under `seasonalThemes`:
 * { draft, published, draftUpdatedAt, draftUpdatedById, publishedAt, publishedById }
 * — the same draft/publish pattern as the homepage hero appearance
 * (`heroAppearance`). The public site renders `published`; staff previews
 * render `draft`. Without a row (or with `enabled: false`) nothing changes.
 */
export const SEASONAL_KEY = "seasonalThemes";
/** Request header set by src/proxy.ts from `?seasonPreview=<season|auto>&token=…`. */
export const SEASON_PREVIEW_HEADER = "x-tcc-season-preview";
export type PreviewTarget = Season | "auto";

type Stored = {
  draft?: unknown; published?: unknown;
  draftUpdatedAt?: string | null; draftUpdatedById?: string | null;
  publishedAt?: string | null; publishedById?: string | null;
};
export type SeasonalState = {
  draft: SeasonalConfig;
  published: SeasonalConfig | null;
  draftUpdatedAt: string | null; draftUpdatedById: string | null;
  publishedAt: string | null; publishedById: string | null;
  hasUnpublishedChanges: boolean;
};

async function readStored(): Promise<Stored | null> {
  const row = await db.setting.findUnique({ where: { key: SEASONAL_KEY } });
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Stored) : null;
}

async function writeStored(next: Stored) {
  const value = next as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: SEASONAL_KEY }, create: { key: SEASONAL_KEY, value }, update: { value } });
}

const same = (a: SeasonalConfig | null, b: SeasonalConfig | null) => JSON.stringify(a) === JSON.stringify(b);

export async function getSeasonalState(): Promise<SeasonalState> {
  const s = await readStored();
  const published = s?.published ? normalizeSeasonalConfig(s.published) : null;
  const draft = s?.draft ? normalizeSeasonalConfig(s.draft) : published ?? normalizeSeasonalConfig(DEFAULT_SEASONAL_CONFIG);
  return {
    draft, published,
    draftUpdatedAt: s?.draftUpdatedAt ?? null, draftUpdatedById: s?.draftUpdatedById ?? null,
    publishedAt: s?.publishedAt ?? null, publishedById: s?.publishedById ?? null,
    hasUnpublishedChanges: !same(draft, published ?? normalizeSeasonalConfig(DEFAULT_SEASONAL_CONFIG)),
  };
}

export async function saveSeasonalDraft(config: SeasonalConfig, userId: string) {
  const s = (await readStored()) ?? {};
  await writeStored({ ...s, draft: normalizeSeasonalConfig(config), draftUpdatedAt: new Date().toISOString(), draftUpdatedById: userId });
}

/** Publishing copies the (saved) draft to published. */
export async function publishSeasonal(config: SeasonalConfig, userId: string) {
  const now = new Date().toISOString();
  const c = normalizeSeasonalConfig(config);
  await writeStored({ draft: c, published: c, draftUpdatedAt: now, draftUpdatedById: userId, publishedAt: now, publishedById: userId });
}

export async function discardSeasonalDraft(userId: string) {
  const s = (await readStored()) ?? {};
  const published = s.published ? normalizeSeasonalConfig(s.published) : normalizeSeasonalConfig(DEFAULT_SEASONAL_CONFIG);
  await writeStored({ ...s, draft: published, draftUpdatedAt: new Date().toISOString(), draftUpdatedById: userId });
}

/**
 * "Restore default brand theme": seasonal themes off and every season back to
 * its default accent/eyebrow/dates — published right away. Uploaded seasonal
 * photos and pinned picks are kept in the settings (unused while off) so the
 * admin doesn't lose work; they can be removed individually.
 */
export async function restoreDefaultBrandTheme(userId: string) {
  const cur = await getSeasonalState();
  const base = normalizeSeasonalConfig(DEFAULT_SEASONAL_CONFIG);
  for (const k of Object.keys(base.seasons) as Season[]) base.seasons[k] = { ...base.seasons[k], hero: cur.draft.seasons[k].hero, picks: cur.draft.seasons[k].picks };
  await publishSeasonal(base, userId);
}

/** Image URLs used by seasonal heroes (draft + published), for the media "where used" check. */
export async function seasonalImageUrls() {
  const s = await getSeasonalState();
  const urls = (c: SeasonalConfig | null) => (c ? Object.values(c.seasons).flatMap((x) => [x.hero.imageUrl, x.hero.mobileImageUrl]).filter((u): u is string => !!u) : []);
  return { published: s.published?.enabled ? urls(s.published) : [], draft: urls(s.draft) };
}

// ───────────── Preview tokens ─────────────

function sign(sessionToken: string, target: PreviewTarget) {
  return crypto.createHmac("sha256", sessionToken).update(`tcc-season-preview:${target}`).digest("hex").slice(0, 32);
}

/** Preview token for the current staff session (useless with any other session). */
export async function seasonPreviewToken(target: PreviewTarget) {
  const tok = (await cookies()).get(SESSION_COOKIE)?.value;
  return tok ? sign(tok, target) : "";
}

export async function seasonPreviewUrl(target: PreviewTarget, path = "/") {
  return `${path}?seasonPreview=${target}&token=${await seasonPreviewToken(target)}`;
}

async function verifiedPreview(raw: string | null, sessionToken: string | undefined): Promise<PreviewTarget | null> {
  if (!raw || raw.length > 120) return null;
  const [target, token] = raw.split(":");
  if (!(isSeason(target) || target === "auto") || !token) return null;
  if (!sessionToken) return null;
  const expect = Buffer.from(sign(sessionToken, target));
  const got = Buffer.from(token);
  if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
  const user = await getCurrentUser();
  return isStaff(user) ? target : null;
}

// ───────────── Per-request theme ─────────────

export type RequestTheme = {
  season: Season;
  settings: SeasonSettings;
  showAccents: boolean;
  /** inline CSS variables for <html> (custom accent) */
  style?: Record<string, string>;
  /** staff preview of the draft */
  preview: null | { label: string };
};

/**
 * The seasonal theme for this request — the published settings, or (for a
 * signed-in staff member with a valid preview token) the draft. Null means the
 * normal brand appearance. Cached per request (root layout + homepage share it).
 */
export const getRequestTheme = cache(async (now: Date = new Date()): Promise<RequestTheme | null> => {
  // Request APIs first, outside the try: they mark the render dynamic (computed per request).
  const [h, jar] = await Promise.all([headers(), cookies()]);
  try {
    const target = await verifiedPreview(h.get(SEASON_PREVIEW_HEADER), jar.get(SESSION_COOKIE)?.value);
    const state = await getSeasonalState();
    if (target) {
      const season = target === "auto" ? activeSeason(state.draft, now) : target;
      if (!season) return null; // previewing a draft with seasonal themes off = default look
      const settings = state.draft.seasons[season];
      return { season, settings, showAccents: state.draft.showAccents, style: seasonStyleVars(season, settings), preview: { label: `Previewing ${SEASON_LABEL[season]} theme — not published` } };
    }
    const season = activeSeason(state.published, now);
    if (!season || !state.published) return null;
    const settings = state.published.seasons[season];
    return { season, settings, showAccents: state.published.showAccents, style: seasonStyleVars(season, settings), preview: null };
  } catch {
    return null;
  }
});

/** Seasonal hero for the homepage: eyebrow + season photo (null appearance → fall back to the normal hero). */
export async function getSeasonalHero(): Promise<{ season: Season; eyebrow: string; showAccents: boolean; appearance: SeasonHero | null } | null> {
  const t = await getRequestTheme();
  if (!t) return null;
  return { season: t.season, eyebrow: t.settings.eyebrow, showAccents: t.showAccents, appearance: t.settings.hero.imageUrl ? t.settings.hero : null };
}

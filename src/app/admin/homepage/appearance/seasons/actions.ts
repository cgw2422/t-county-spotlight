"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";
import { isAllowedHeroImageUrl } from "@/lib/hero-appearance";
import { discardSeasonalDraft, getSeasonalState, publishSeasonal, restoreDefaultBrandTheme, saveSeasonalDraft } from "@/lib/seasonal-theme";
import {
  isValidMonthDay, normalizeSeasonalConfig, SEASON_LABEL, SEASON_OVERLAY_MAX, SEASONS, validateAccent, validateSeasonStarts,
  type MonthDay, type Season,
} from "@/lib/seasons";

function revalidate(publicToo: boolean) {
  revalidatePath("/admin/homepage/appearance/seasons");
  if (publicToo) revalidatePath("/", "layout");
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Strict checks on the submitted JSON — anything unsafe is rejected with a message (never silently changed). */
function validate(raw: unknown): string | null {
  const c = rec(raw);
  const starts = rec(c.starts);
  const md = Object.fromEntries(SEASONS.map((s) => [s, { month: Number(rec(starts[s]).month), day: Number(rec(starts[s]).day) }])) as Record<Season, MonthDay>;
  for (const s of SEASONS) if (!isValidMonthDay(md[s])) return `${SEASON_LABEL[s]} start date is not a valid date.`;
  const startErr = validateSeasonStarts(md);
  if (startErr) return startErr;
  const seasons = rec(c.seasons);
  for (const s of SEASONS) {
    const x = rec(seasons[s]);
    const accentErr = validateAccent(String(x.accent ?? ""), s);
    if (accentErr) return `${SEASON_LABEL[s]} accent: ${accentErr}`;
    if (typeof x.eyebrow === "string" && x.eyebrow.trim().length > 60) return `${SEASON_LABEL[s]} heading text must be 60 characters or fewer.`;
    const h = rec(x.hero);
    for (const k of ["imageUrl", "mobileImageUrl"] as const) {
      const u = h[k];
      if (u != null && u !== "" && (typeof u !== "string" || u.length > 2000 || !isAllowedHeroImageUrl(u))) return `${SEASON_LABEL[s]} photo: choose an image from the media library (or an https:// image URL).`;
    }
    if (!h.imageUrl && h.mobileImageUrl) return `${SEASON_LABEL[s]}: add a desktop photo first — the mobile photo only replaces it on phones and tablets.`;
    const o = Number(h.overlay);
    if (h.overlay != null && (!Number.isFinite(o) || o < 0 || o > SEASON_OVERLAY_MAX)) return `${SEASON_LABEL[s]} overlay must be between 0% and ${SEASON_OVERLAY_MAX}%.`;
    if (typeof h.imageAlt === "string" && h.imageAlt.length > 300) return `${SEASON_LABEL[s]} alt text must be 300 characters or fewer.`;
  }
  return null;
}

function summary(c: ReturnType<typeof normalizeSeasonalConfig>) {
  return {
    enabled: c.enabled, mode: c.mode, manualSeason: c.manualSeason, starts: c.starts, showAccents: c.showAccents,
    seasons: Object.fromEntries(SEASONS.map((s) => [s, { accent: c.seasons[s].accent, eyebrow: c.seasons[s].eyebrow, imageUrl: c.seasons[s].hero.imageUrl, mobileImageUrl: c.seasons[s].hero.mobileImageUrl, overlay: c.seasons[s].hero.overlay, picks: c.seasons[s].picks }])),
  };
}

/** Save draft (intent=draft) or publish (intent=publish) the submitted settings (JSON in `config`). */
export async function saveSeasonalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("config") ?? ""));
  } catch {
    return { error: "Couldn't read the settings — reload the page and try again." };
  }
  const err = validate(raw);
  if (err) return { error: err };
  const config = normalizeSeasonalConfig(raw);
  if (fd.get("intent") === "publish") {
    await publishSeasonal(config, user.id);
    await audit(user.id, "appearance.seasonal.publish", "Setting", "seasonalThemes", summary(config));
    revalidate(true);
    return { ok: true, message: config.enabled ? "Published — seasonal themes are live." : "Published — seasonal themes are off; the site shows the normal brand look." };
  }
  await saveSeasonalDraft(config, user.id);
  await audit(user.id, "appearance.seasonal.save_draft", "Setting", "seasonalThemes", summary(config));
  revalidate(false);
  return { ok: true, message: "Draft saved — the preview is updated. Visitors won't see changes until you publish." };
}

export async function discardSeasonalDraftAction(): Promise<ActionState> {
  const user = await requireAdmin();
  await discardSeasonalDraft(user.id);
  await audit(user.id, "appearance.seasonal.discard_draft", "Setting", "seasonalThemes");
  revalidate(false);
  return { ok: true, message: "Draft discarded — back to the published settings." };
}

export async function restoreDefaultBrandThemeAction(): Promise<ActionState> {
  const user = await requireAdmin();
  const before = await getSeasonalState();
  await restoreDefaultBrandTheme(user.id);
  await audit(user.id, "appearance.seasonal.restore_default", "Setting", "seasonalThemes", { wasEnabled: !!before.published?.enabled });
  revalidate(true);
  return { ok: true, message: "Default brand theme restored and published. Seasonal themes are off." };
}

import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { normalizeHeroAppearance, type HeroAppearance } from "@/components/home/hero-background";

/**
 * Homepage hero background, stored as JSON in the Setting table under
 * `heroAppearance`: { draft, published }. The homepage renders `published`;
 * the admin preview renders `draft`. `settings.heroImageUrl` is the legacy
 * single-image field: it's used as the published image when no
 * `heroAppearance` setting exists yet, and is kept in sync on publish.
 */
export const HERO_APPEARANCE_KEY = "heroAppearance";

export type HeroAppearanceValue = ReturnType<typeof normalizeHeroAppearance>;
export type HeroDraft = HeroAppearanceValue & { updatedAt: string | null; updatedById: string | null };
export type HeroPublished = HeroAppearanceValue & { publishedAt: string | null; publishedById: string | null };
export type HeroAppearanceState = { draft: HeroDraft; published: HeroPublished | null; hasUnpublishedChanges: boolean; isLegacy: boolean };

/** Our own media (/media/…), the S3 public URL, or any https image. */
export function isAllowedHeroImageUrl(v: string) {
  if (v.startsWith("/media/") && !v.includes("..")) return true;
  const s3 = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  if (s3 && v.startsWith(s3 + "/")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

const zImg = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || isAllowedHeroImageUrl(v), "Choose an image from the media library (or an https:// image URL).");
const zPct = (def: number) => z.preprocess((v) => (v === "" || v == null ? def : Number(v)), z.number().finite().transform((n) => Math.min(100, Math.max(0, Math.round(n)))));

export const heroAppearanceSchema = z.object({
  imageUrl: zImg,
  imageAlt: z.string().trim().max(300, "Alt text must be 300 characters or fewer").nullish().transform((v) => v ?? ""),
  mobileImageUrl: zImg,
  desktopFocusX: zPct(50),
  desktopFocusY: zPct(50),
  mobileFocusX: zPct(50),
  mobileFocusY: zPct(50),
  overlay: zPct(55),
});

function pick(a: HeroAppearance | null | undefined): HeroAppearanceValue {
  const n = normalizeHeroAppearance(a);
  // a mobile image without a main image makes no sense — drop it
  return n.imageUrl ? n : { ...n, mobileImageUrl: null };
}

type Stored = { draft?: (HeroAppearance & { updatedAt?: string; updatedById?: string | null }) | null; published?: (HeroAppearance & { publishedAt?: string; publishedById?: string | null }) | null };

async function readStored(): Promise<Stored | null> {
  const row = await db.setting.findUnique({ where: { key: HERO_APPEARANCE_KEY } });
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Stored) : null;
}

const sameLook = (a: HeroAppearanceValue, b: HeroAppearanceValue) => (Object.keys(a) as (keyof HeroAppearanceValue)[]).every((k) => a[k] === b[k]);

/** Full draft/published state for the admin page. */
export async function getHeroAppearanceState(): Promise<HeroAppearanceState> {
  const stored = await readStored();
  if (!stored) {
    const legacy = (await getSettings()).heroImageUrl;
    const published: HeroPublished | null = legacy ? { ...pick({ imageUrl: legacy }), publishedAt: null, publishedById: null } : null;
    const draft: HeroDraft = { ...(published ? pick(published) : pick(null)), updatedAt: null, updatedById: null };
    return { draft, published, hasUnpublishedChanges: false, isLegacy: !!legacy };
  }
  const published: HeroPublished | null = stored.published ? { ...pick(stored.published), publishedAt: stored.published.publishedAt ?? null, publishedById: stored.published.publishedById ?? null } : null;
  const draftSrc = stored.draft ?? stored.published ?? null;
  const draft: HeroDraft = { ...pick(draftSrc), updatedAt: stored.draft?.updatedAt ?? null, updatedById: stored.draft?.updatedById ?? null };
  return { draft, published, hasUnpublishedChanges: !sameLook(pick(draft), pick(published)), isLegacy: false };
}

/** The appearance to render: published (homepage) or draft (admin preview). */
export async function getHeroAppearance({ draft = false }: { draft?: boolean } = {}): Promise<HeroAppearanceValue | null> {
  try {
    const s = await getHeroAppearanceState();
    if (draft) return pick(s.draft);
    return s.published ? pick(s.published) : null;
  } catch {
    return null;
  }
}

async function writeStored(next: { draft: HeroDraft; published: HeroPublished | null }) {
  const value = next as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: HERO_APPEARANCE_KEY }, create: { key: HERO_APPEARANCE_KEY, value }, update: { value } });
}

/** Keep the legacy `heroImageUrl` setting equal to the published image. */
async function syncLegacy(imageUrl: string | null) {
  if (imageUrl) await db.setting.upsert({ where: { key: "heroImageUrl" }, create: { key: "heroImageUrl", value: imageUrl }, update: { value: imageUrl } });
  else await db.setting.deleteMany({ where: { key: "heroImageUrl" } });
}

export async function saveHeroDraft(input: HeroAppearance, userId: string) {
  const cur = await getHeroAppearanceState();
  const draft: HeroDraft = { ...pick(input), updatedAt: new Date().toISOString(), updatedById: userId };
  await writeStored({ draft, published: cur.published });
  return draft;
}

/** Publishes `input` (also saved as the draft). */
export async function publishHeroAppearance(input: HeroAppearance, userId: string) {
  const now = new Date().toISOString();
  const look = pick(input);
  const published: HeroPublished = { ...look, publishedAt: now, publishedById: userId };
  await writeStored({ draft: { ...look, updatedAt: now, updatedById: userId }, published });
  await syncLegacy(look.imageUrl);
  return published;
}

/** Throws the draft away: the draft becomes the published appearance again. */
export async function discardHeroDraft(userId: string) {
  const cur = await getHeroAppearanceState();
  const draft: HeroDraft = { ...(cur.published ? pick(cur.published) : pick(null)), updatedAt: new Date().toISOString(), updatedById: userId };
  await writeStored({ draft, published: cur.published });
}

/** Publishes "no image" so the homepage shows the default brand gradient. */
export async function restoreDefaultHero(userId: string) {
  return publishHeroAppearance({ imageUrl: null }, userId);
}

/** Image URLs referenced by the hero (draft + published), for the media "where used" check. */
export async function heroAppearanceImageUrls() {
  const s = await getHeroAppearanceState();
  return {
    published: [s.published?.imageUrl, s.published?.mobileImageUrl].filter((u): u is string => !!u),
    draft: [s.draft.imageUrl, s.draft.mobileImageUrl].filter((u): u is string => !!u),
  };
}

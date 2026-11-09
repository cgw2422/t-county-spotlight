import "server-only";
import crypto from "node:crypto";
import sharp from "sharp";
import { db } from "./db";
import { getSettings } from "./settings";
import fs from "node:fs/promises";
import path from "node:path";
import { BRAND, DEFAULT_BRAND_LOGO_URL, DEFAULT_BRAND_LOGO_WHITE_URL } from "./brand";

/**
 * Brand assets generated from the OFFICIAL logo artwork uploaded in
 * Admin → Settings (brandLogoUrl). Nothing is redrawn: every asset is a crop,
 * trim, or resize of the original pixels, placed on a plain background.
 */
export const BRAND_ASSETS = {
  "logo.png": { kind: "logo", width: 960 },
  "logo-sm.png": { kind: "logo", width: 480 },
  "logo-white.png": { kind: "white", width: 960 }, // official all-white logo, navy background keyed out
  "logo-white-sm.png": { kind: "white", width: 480 },
  "mark.png": { kind: "mark", size: 512 },
  "icon-32.png": { kind: "icon", size: 32, pad: 0.06 },
  "icon-48.png": { kind: "icon", size: 48, pad: 0.06 },
  "icon-192.png": { kind: "icon", size: 192, pad: 0.1 },
  "icon-512.png": { kind: "icon", size: 512, pad: 0.1 },
  "maskable-512.png": { kind: "icon", size: 512, pad: 0.2 }, // Android adaptive-icon safe zone
  "apple-touch-icon.png": { kind: "icon", size: 180, pad: 0.12 },
  "og.png": { kind: "og" },
} as const;
export type BrandAssetName = keyof typeof BRAND_ASSETS;

/** Static fallbacks used until the official logo is uploaded. */
const FALLBACK: Partial<Record<BrandAssetName, string>> = {
  "icon-32.png": "/icons/favicon-32.png",
  "icon-48.png": "/icons/favicon-32.png",
  "icon-192.png": "/icons/icon-192.png",
  "icon-512.png": "/icons/icon-512.png",
  "maskable-512.png": "/icons/maskable-512.png",
  "apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "mark.png": "/icons/icon-512.png",
};

export function brandVersion(sourceUrl: string, iconUrl?: string | null) {
  return crypto.createHash("sha1").update(`${sourceUrl}|${iconUrl ?? ""}|${DEFAULT_BRAND_LOGO_WHITE_URL}`).digest("hex").slice(0, 10);
}

/** Public URL of a brand asset (versioned so caches refresh when the logo changes). */
export function brandAssetUrl(asset: BrandAssetName, brandLogoUrl: string | null | undefined, brandIconUrl?: string | null): string | null {
  if (!brandLogoUrl) return FALLBACK[asset] ?? null;
  return `/brand/${asset}?v=${brandVersion(brandLogoUrl, brandIconUrl)}`;
}

/** Official logo source: an admin-uploaded replacement, or the original artwork shipped with the site. */
export function effectiveBrandLogoUrl(s: { brandLogoUrl?: string | null }) {
  return s.brandLogoUrl || DEFAULT_BRAND_LOGO_URL;
}

export async function getBrandAssetUrls() {
  const settings = await getSettings();
  const s = { ...settings, brandLogoUrl: effectiveBrandLogoUrl(settings) };
  const u = (a: BrandAssetName) => brandAssetUrl(a, s.brandLogoUrl, s.brandIconUrl);
  return {
    hasOfficialLogo: !!s.brandLogoUrl,
    logo: s.brandLogoUrl ? u("logo.png") : s.logoUrl,
    logoSmall: s.brandLogoUrl ? u("logo-sm.png") : s.logoUrl,
    /** Official all-white logo for dark and green backgrounds (transparent PNG). */
    logoWhite: u("logo-white.png")!,
    logoWhiteSmall: u("logo-white-sm.png")!,
    mark: s.brandLogoUrl ? u("mark.png") : null,
    icon32: u("icon-32.png")!,
    icon48: u("icon-48.png")!,
    icon192: u("icon-192.png")!,
    icon512: u("icon-512.png")!,
    maskable512: u("maskable-512.png")!,
    appleTouch: u("apple-touch-icon.png")!,
    og: s.brandLogoUrl ? u("og.png") : null,
  };
}

// ───────────────────────── generation ─────────────────────────

async function loadSource(url: string): Promise<Buffer> {
  if (url.startsWith("/brand-source/")) {
    // Bundled original artwork in /public/brand-source (basename only — no path traversal).
    return fs.readFile(path.join(process.cwd(), "public", "brand-source", path.basename(url)));
  }
  if (url.startsWith("/media/")) {
    const blob = await db.mediaBlob.findUnique({ where: { key: url.slice("/media/".length) } });
    if (blob) return Buffer.from(blob.data);
  }
  const abs = url.startsWith("http") ? url : `${(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")}${url}`;
  const r = await fetch(abs, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Could not load the official logo (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Extract the county-outline mark from the horizontal logo: the largest
 * connected shape on the left, plus any shapes fully inside its bounds (the
 * courthouse cross, sun, hills). Other shapes — the divider and wordmark —
 * are left out. Original pixels are copied unchanged.
 */
async function extractMark(src: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(src).flatten({ background: "#ffffff" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    ink[i] = 765 - (data[o] + data[o + 1] + data[o + 2]) > 90 ? 1 : 0;
  }
  // The thin orange divider between the mark and the wordmark is not part of
  // the icon. Find long, thin orange strokes (unlike the round sun) and leave
  // them out, including their anti-aliased edges.
  const divider = findDividerPixels(data, w, h);
  for (let i = 0; i < w * h; i++) if (divider[i]) { ink[i] = 0; data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
  const label = new Int32Array(w * h).fill(-1);
  const comps: { minX: number; minY: number; maxX: number; maxY: number; size: number }[] = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || label[start] !== -1) continue;
    const id = comps.length;
    const c = { minX: w, minY: h, maxX: 0, maxY: 0, size: 0 };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      c.size++;
      if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x; if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        if (ink[q] && label[q] === -1) { label[q] = id; stack[sp++] = q; }
      }
    }
    comps.push(c);
  }
  const leftComps = comps.map((c, id) => ({ ...c, id })).filter((c) => c.minX < w * 0.4);
  if (!leftComps.length) throw new Error("Could not find the logo mark");
  const main = leftComps.reduce((a, b) => (b.size > a.size ? b : a));
  const keep = new Set(comps.map((c, id) => ({ ...c, id }))
    .filter((c) => c.id === main.id || (c.minX >= main.minX && c.maxX <= main.maxX && c.minY >= main.minY && c.maxY <= main.maxY))
    .map((c) => c.id));
  const cw = main.maxX - main.minX + 1, ch = main.maxY - main.minY + 1;
  const out = Buffer.alloc(cw * ch * 4, 255);
  const R = 2; // keep anti-aliased edge pixels next to kept shapes
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = x + main.minX, sy = y + main.minY, si = sy * w + sx;
      let copy = keep.has(label[si]);
      if (!copy && !ink[si]) {
        for (let dy = -R; dy <= R && !copy; dy++) for (let dx = -R; dx <= R && !copy; dx++) {
          const nx = sx + dx, ny = sy + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && keep.has(label[ny * w + nx])) copy = true;
        }
      }
      if (copy) data.copy(out, (y * cw + x) * 4, si * 4, si * 4 + 4);
    }
  }
  return sharp(out, { raw: { width: cw, height: ch, channels: 4 } }).png().toBuffer();
}

/** Pixels belonging to tall, thin orange strokes (the divider), dilated by 2px. */
function findDividerPixels(data: Buffer, w: number, h: number) {
  const orange = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    orange[i] = r > 190 && g > 70 && g < 190 && b < 110 && r - b > 120 ? 1 : 0;
  }
  const seen = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!orange[start] || seen[start]) continue;
    let sp = 0, minX = w, maxX = 0, minY = h, maxY = 0, n = 0;
    const pix: number[] = [];
    stack[sp++] = start; seen[start] = 1;
    while (sp) {
      const p = stack[--sp]; const x = p % w, y = (p / w) | 0;
      pix.push(p); n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || !orange[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1; stack[sp++] = q;
      }
    }
    const bh = maxY - minY + 1, bw = maxX - minX + 1;
    const fill = n / (bh * bw); // a diagonal line fills little of its bounding box
    if (bh > h * 0.35 && bh / bw > 2.5 && fill < 0.5) {
      for (const p of pix) {
        const x = p % w, y = (p / w) | 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
            const q = ny * w + nx; const o = q * 4;
            // only clear light/orange-ish edge pixels, never navy or green artwork
            if (orange[q] || (data[o] > 200 && data[o + 2] < 235)) out[q] = 1;
          }
        }
      }
    }
  }
  return out;
}

/** The artwork's own background color (corner pixel), so canvases blend seamlessly with it. */
async function backgroundOf(img: Buffer) {
  const px = await sharp(img).flatten({ background: "#ffffff" }).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
  return { r: px[0], g: px[1], b: px[2], alpha: 1 };
}

/**
 * The all-white logo is supplied as white artwork on a solid background.
 * Key that background out: every pixel becomes white, with opacity equal to
 * how far it is from the background color. The artwork's shapes and
 * anti-aliased edges are preserved exactly; nothing is redrawn or recolored.
 */
async function whiteOnTransparent(src: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const bg = [data[0], data[1], data[2]];
  const bgLum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const lum = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
    const a = Math.max(0, Math.min(1, (lum - bgLum) / (255 - bgLum)));
    out[i * 4] = 255; out[i * 4 + 1] = 255; out[i * 4 + 2] = 255;
    out[i * 4 + 3] = a < 0.04 ? 0 : Math.round(a * 255);
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function squareIcon(mark: Buffer, size: number, pad: number, bg = WHITE) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * pad)));
  const resized = await sharp(mark).resize(inner, inner, { fit: "inside", background: bg }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: resized, gravity: "center" }]).png().toBuffer();
}

const cache = new Map<string, Promise<Buffer>>();

export async function renderBrandAsset(name: BrandAssetName, sourceUrl: string, iconUrl?: string | null): Promise<Buffer> {
  const key = `${name}:${brandVersion(sourceUrl, iconUrl)}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const src = await loadSource(sourceUrl);
      const spec = BRAND_ASSETS[name];
      if (spec.kind === "white") {
        const keyed = await whiteOnTransparent(await loadSource(DEFAULT_BRAND_LOGO_WHITE_URL));
        const trimmedWhite = await sharp(keyed).trim({ threshold: 10 }).png().toBuffer();
        return sharp(trimmedWhite).resize({ width: spec.width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      }
      const trimmed = await sharp(src).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 20 }).png().toBuffer();
      if (spec.kind === "logo") return sharp(trimmed).resize({ width: spec.width, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      // A separately supplied official icon is used as-is (trimmed); otherwise crop the mark from the logo.
      const mark = iconUrl
        ? await sharp(await loadSource(iconUrl)).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 20 }).png().toBuffer()
        : await extractMark(src);
      if (spec.kind === "mark") return sharp(mark).resize(spec.size, spec.size, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const bg = await backgroundOf(trimmed);
      if (spec.kind === "icon") return squareIcon(mark, spec.size, spec.pad, bg);
      // og: official logo centered on white with brand color bands (logo untouched)
      const logo = await sharp(trimmed).resize({ width: 960, height: 380, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      const band = (color: string, height: number) => sharp({ create: { width: 1200, height, channels: 4, background: color } }).png().toBuffer();
      return sharp({ create: { width: 1200, height: 630, channels: 4, background: bg } })
        .composite([
          { input: logo, gravity: "center" },
          { input: await band(BRAND.colors.navy, 18), top: 612, left: 0 },
          { input: await band(BRAND.colors.green, 6), top: 606, left: 0 },
        ]).png().toBuffer();
    })().catch((e) => { cache.delete(key); throw e; }));
  }
  return cache.get(key)!;
}

/** Logo for emails: the official logo (trimmed) when uploaded, else the legacy setting. */
export function emailLogo(s: { brandLogoUrl?: string | null; brandIconUrl?: string | null; logoUrl?: string | null }) {
  return brandAssetUrl("logo-sm.png", effectiveBrandLogoUrl(s), s.brandIconUrl);
}

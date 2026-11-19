import "server-only";
import { db } from "./db";

export type ImageDims = { width: number; height: number };

/** Storage key for a stored image URL ("/media/<key>", "https://host/media/<key>" or "<S3_PUBLIC_URL>/<key>"), else null. */
function keyFromUrl(url: string) {
  const s3 = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  if (s3 && url.startsWith(`${s3}/`)) return url.slice(s3.length + 1).split(/[?#]/)[0];
  let path = "";
  try { path = new URL(url, "http://local").pathname; } catch { return null; }
  const m = /^\/media\/(.+)$/.exec(path);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/**
 * Intrinsic width/height of an image we store, read from its Media record (saved at upload time).
 * One query: by storage key (unique index) for our own URLs, else by exact URL. Images that are not
 * in the media library (or rows without dimensions, e.g. SVG) return null so callers fall back to
 * the browser's natural size.
 */
export async function getImageDimensions(url: string | null | undefined): Promise<ImageDims | null> {
  if (!url || url.startsWith("data:")) return null;
  const key = keyFromUrl(url);
  const select = { width: true, height: true } as const;
  const m = await (key ? db.media.findUnique({ where: { key }, select }) : db.media.findFirst({ where: { url }, select })).catch(() => null);
  if (!m || !m.width || !m.height || m.width < 1 || m.height < 1) return null;
  return { width: m.width, height: m.height };
}

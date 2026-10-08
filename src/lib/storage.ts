import "server-only";
import crypto from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./db";

/**
 * Persistent object storage. Uses an S3-compatible bucket when S3_BUCKET is
 * configured (Railway Buckets, Cloudflare R2, AWS S3, Backblaze B2...).
 * Otherwise falls back to storing bytes in PostgreSQL so uploads are never
 * written to the ephemeral container filesystem.
 */
const bucket = process.env.S3_BUCKET;
let s3: S3Client | null = null;
function client() {
  if (!bucket) return null;
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: process.env.S3_ACCESS_KEY_ID
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! }
        : undefined,
    });
  }
  return s3;
}

export function storageMode() {
  return bucket ? "s3" : "database";
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "application/pdf": "pdf",
};

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** Detect real image type from magic bytes (never trust client mime types). */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (buf.subarray(4, 12).toString().startsWith("ftypavif")) return "image/avif";
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "image/x-icon";
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

export function publicUrlFor(key: string) {
  if (bucket && process.env.S3_PUBLIC_URL) return `${process.env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  return `/media/${key}`;
}

export async function putObject(buf: Buffer, mimeType: string, nameHint = "file") {
  const ext = ALLOWED_IMAGE_TYPES[mimeType] ?? "bin";
  const base = nameHint.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "file";
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${base}-${crypto.randomBytes(5).toString("hex")}.${ext}`;
  const c = client();
  if (c) {
    await c.send(new PutObjectCommand({
      Bucket: bucket!, Key: key, Body: buf, ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
  } else {
    await db.mediaBlob.create({ data: { key, data: new Uint8Array(buf), mimeType } });
  }
  return { key, url: publicUrlFor(key) };
}

export async function deleteObject(key: string) {
  const c = client();
  if (c) await c.send(new DeleteObjectCommand({ Bucket: bucket!, Key: key }));
  else await db.mediaBlob.deleteMany({ where: { key } });
}

/** Read image dimensions for PNG/JPEG/GIF/WebP without native deps. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf[0] === 0x89 && buf[1] === 0x50) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf.subarray(0, 3).toString() === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf.subarray(0, 4).toString() === "RIFF") {
      const fmt = buf.subarray(12, 16).toString();
      if (fmt === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (fmt === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === "VP8L") {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

/** Store an uploaded image and create its Media library record. */
export async function saveImageUpload(buf: Buffer, filename: string, uploadedById?: string | null, extra: { alt?: string; sourceUrl?: string; wpId?: number; title?: string; caption?: string } = {}) {
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("File is too large (15 MB max).");
  const mime = sniffImageType(buf);
  if (!mime) throw new Error("Unsupported file type. Upload JPG, PNG, WebP, GIF, AVIF or SVG images.");
  if (mime === "image/svg+xml" && /<script|on\w+\s*=|javascript:/i.test(buf.toString("utf8"))) {
    throw new Error("SVG contains scripts and was rejected.");
  }
  const { key, url } = await putObject(buf, mime, filename);
  const dims = imageSize(buf);
  return db.media.create({
    data: {
      key, url, filename: filename.slice(0, 200), mimeType: mime, size: buf.length,
      width: dims?.width, height: dims?.height, alt: extra.alt, title: extra.title, caption: extra.caption,
      sourceUrl: extra.sourceUrl, wpId: extra.wpId, uploadedById: uploadedById ?? undefined,
    },
  });
}

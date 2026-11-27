import "server-only";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/utils";

/** Reads a stored original back (database storage, or the bucket's public address). */
export async function readStoredObject(key: string, url: string): Promise<Buffer> {
  const blob = await db.mediaBlob.findUnique({ where: { key }, select: { data: true } }).catch(() => null);
  if (blob) return Buffer.from(blob.data);
  const res = await fetch(/^https?:\/\//.test(url) ? url : absoluteUrl(url));
  if (!res.ok) throw new Error(`Couldn't read the stored file (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/** Small key/value settings for Government Watch (stored in the Setting table). */
export async function getSetting<T>(key: string): Promise<T | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : null;
}
export async function setSetting(key: string, value: unknown) {
  await db.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
}

export const PUBLIC_KEY = "govWatchPublicEnabled";
export const PAUSED_KEY = "govWatchPaused";

/** The public Government Watch section stays off until an admin turns it on. */
export async function publicGovWatchEnabled() {
  return (await getSetting<boolean>(PUBLIC_KEY)) === true;
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { readNotificationPrefs, type EmailUpdateKey } from "@/lib/notification-categories";
import { verifyUnsubscribeToken } from "./tokens";

/** Resolves a signed unsubscribe token to the member (active accounts only). */
export async function findUnsubscribeTarget(token: string | null | undefined) {
  const v = verifyUnsubscribeToken(token);
  if (!v) return null;
  const user = await db.user.findUnique({ where: { id: v.userId }, select: { id: true, email: true, status: true, notificationPrefs: true } });
  if (!user || user.status === "DELETED") return null;
  return { user, kind: v.kind, enabled: readNotificationPrefs(user.notificationPrefs).planned[v.kind] };
}

/** Turns off exactly one email update; every other preference is kept. Idempotent. */
export async function turnOffEmailUpdate(userId: string, kind: EmailUpdateKey, method: "link" | "one_click") {
  const user = await db.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
  if (!user) return false;
  const prefs = readNotificationPrefs(user.notificationPrefs);
  if (!prefs.planned[kind]) return true;
  prefs.planned[kind] = false;
  await db.user.update({ where: { id: userId }, data: { notificationPrefs: prefs as unknown as Prisma.InputJsonValue } });
  await audit(userId, "notifications.email_update_off", "User", userId, { kind, method });
  return true;
}

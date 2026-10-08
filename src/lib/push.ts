import "server-only";
import webpush from "web-push";
import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { NotificationCategory } from "./notification-categories";

/**
 * Web Push (VAPID). Generate keys once with:
 *   npx web-push generate-vapid-keys
 * then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
 * and NEXT_PUBLIC_VAPID_PUBLIC_KEY (same value as VAPID_PUBLIC_KEY, exposed to the browser).
 */
let configured: boolean | null = null;

export function pushConfigured() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (configured = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:no-reply@tcountyspotlight.com", pub, priv);
    configured = true;
  } catch (e) {
    console.error("[push] invalid VAPID configuration", e);
    configured = false;
  }
  return configured;
}

export type PushPayload = { title: string; body?: string; url?: string; icon?: string; tag?: string };

/**
 * Sends a notification to every subscription opted in to `category`.
 * Optional `filter` narrows recipients (e.g. followers of one business).
 * Expired endpoints (404/410) are removed automatically.
 */
export async function sendPush(category: NotificationCategory, payload: PushPayload, filter: Prisma.PushSubscriptionWhereInput = {}) {
  if (!pushConfigured()) return { sent: 0, failed: 0, removed: 0, skipped: true };
  const subs = await db.pushSubscription.findMany({ where: { AND: [{ categories: { has: category } }, filter] } });
  const body = JSON.stringify({ icon: "/icons/icon-192.png", url: "/", ...payload });
  let sent = 0, failed = 0;
  const dead: string[] = [];
  const queue = [...subs];
  async function worker() {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id);
        else failed++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, subs.length) }, worker));
  if (dead.length) await db.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  return { sent, failed, removed: dead.length, skipped: false };
}

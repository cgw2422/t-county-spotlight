import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { NOTIFICATION_KEYS, enabledCategories, readNotificationPrefs, type NotificationCategory } from "@/lib/notification-categories";

const subSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Endpoint must be https"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
  categories: z.array(z.string()).max(20).optional(),
});

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

function ip(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Save (upsert) a push subscription. Signed-in users' categories follow their notification preferences. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  if (!rateLimit(`push:${ip(req)}`, 30, 10 * 60_000).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = subSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const user = await getCurrentUser();

  let categories: NotificationCategory[];
  if (user) {
    categories = enabledCategories(readNotificationPrefs(user.notificationPrefs));
  } else {
    // Anonymous visitors may only choose from known categories; nothing is assumed.
    categories = (parsed.data.categories ?? []).filter((c): c is NotificationCategory => (NOTIFICATION_KEYS as string[]).includes(c));
  }

  const existing = await db.pushSubscription.findUnique({ where: { endpoint } });
  // Never let an anonymous request take over a signed-in user's subscription.
  if (existing?.userId && existing.userId !== user?.id) {
    await db.pushSubscription.delete({ where: { endpoint } });
  }
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user?.id ?? null, categories },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: user?.id ?? null, categories },
  });
  return NextResponse.json({ ok: true, categories });
}

/** Remove a push subscription by endpoint. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const user = await getCurrentUser();
  const existing = await db.pushSubscription.findUnique({ where: { endpoint } });
  // Knowing the (secret, unguessable) endpoint is proof of possession; signed-in owners may also remove theirs.
  if (existing && (!existing.userId || existing.userId === user?.id || !user)) {
    await db.pushSubscription.delete({ where: { endpoint } });
  }
  return NextResponse.json({ ok: true });
}

import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken, randomToken } from "./tokens";
import type { Prisma } from "@/generated/prisma/client";
import { CONSENT_TEXT, readPreferences, type Preferences, type SignupSource } from "./copy";
import { getNewsletterSettings } from "./settings";
import { sendAlreadySubscribedEmail, sendConfirmationEmail, sendWelcomeEmail } from "./emails";

export const CONFIRM_TTL_MS = 48 * 3600_000;

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Trim + lowercase + validate. Returns null for anything that is not a plausible address. */
export function normalizeEmail(raw: unknown): string | null {
  const r = emailSchema.safeParse(typeof raw === "string" ? raw : "");
  return r.success ? r.data : null;
}

export async function logEvent(subscriberId: string, type: string, data?: Prisma.InputJsonValue) {
  try {
    await db.subscriberEvent.create({ data: { subscriberId, type, data } });
  } catch (e) {
    console.error("[newsletter] event log failed", e);
  }
}

export async function isSuppressed(email: string) {
  return !!(await db.emailSuppression.findUnique({ where: { email } }));
}

export async function addSuppression(email: string, reason: string) {
  await db.emailSuppression.upsert({ where: { email }, create: { email, reason }, update: { reason } });
}

async function recentEvent(subscriberId: string, type: string, withinMs: number) {
  return !!(await db.subscriberEvent.findFirst({ where: { subscriberId, type, createdAt: { gte: new Date(Date.now() - withinMs) } }, select: { id: true } }));
}

function newConfirmToken() {
  const token = randomToken(32);
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + CONFIRM_TTL_MS) };
}

export type SubscribeInput = { email: string; firstName?: string | null; source: SignupSource; userId?: string | null; ip?: string };
export type SubscribeOutcome = "confirmation_sent" | "confirmation_resent" | "resubscribe_sent" | "already_active" | "throttled";

/**
 * Double opt-in signup. The caller always shows the same neutral message;
 * the outcome is for logging/tests only and must never be shown to the visitor.
 */
export async function requestSubscription(input: SubscribeInput): Promise<SubscribeOutcome> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("invalid email");
  const firstName = input.firstName?.trim().slice(0, 80) || null;
  const settings = await getNewsletterSettings();
  const consent = { consentAt: new Date(), consentText: CONSENT_TEXT, consentVersion: settings.consentVersion };
  const [existing, suppression] = await Promise.all([
    db.newsletterSubscriber.findUnique({ where: { email } }),
    db.emailSuppression.findUnique({ where: { email } }),
  ]);
  // Only link an account when the signed-in user owns this address and the account isn't already linked elsewhere.
  let userId: string | null = null;
  if (input.userId) {
    const u = await db.user.findUnique({ where: { id: input.userId }, select: { email: true, emailVerifiedAt: true } });
    const taken = await db.newsletterSubscriber.findUnique({ where: { userId: input.userId }, select: { email: true } });
    if (u?.emailVerifiedAt && u.email.toLowerCase() === email && (!taken || taken.email === email)) userId = input.userId;
  }

  if (existing && existing.status === "ACTIVE" && !suppression) {
    // Don't reveal status. At most one "you're already subscribed" note per day.
    if (await recentEvent(existing.id, "already_subscribed_sent", 86400_000)) return "already_active";
    await sendAlreadySubscribedEmail(existing);
    await logEvent(existing.id, "already_subscribed_sent", { source: input.source });
    return "already_active";
  }

  const resubscribe = !!suppression || (!!existing && existing.status !== "PENDING");
  if (existing) {
    // Throttle repeat confirmation emails: 1 per 2 minutes while pending, 1 per 10 minutes for previously-removed
    // addresses (the signup action also limits each address to 5 requests an hour).
    if (await recentEvent(existing.id, "confirm_sent", resubscribe ? 600_000 : 120_000)) return "throttled";
  }
  const t = newConfirmToken();
  let sub;
  if (existing) {
    // Status stays as-is (e.g. UNSUBSCRIBED) until the new consent is confirmed.
    sub = await db.newsletterSubscriber.update({
      where: { id: existing.id },
      data: { ...consent, source: existing.status === "PENDING" ? existing.source : input.source, firstName: firstName ?? existing.firstName, confirmTokenHash: t.hash, confirmExpiresAt: t.expiresAt, ...(userId && !existing.userId ? { userId } : {}) },
    });
    await logEvent(sub.id, resubscribe ? "resubscribe_requested" : "signup_repeat", { source: input.source });
  } else {
    sub = await db.newsletterSubscriber.create({
      data: {
        email, firstName, status: "PENDING", source: input.source, ...consent,
        confirmTokenHash: t.hash, confirmExpiresAt: t.expiresAt, unsubscribeToken: randomToken(32),
        preferences: readPreferences(null), userId,
      },
    });
    await logEvent(sub.id, resubscribe ? "resubscribe_requested" : "signup", { source: input.source, consentVersion: settings.consentVersion });
  }
  await sendConfirmationEmail(sub, t.token);
  await logEvent(sub.id, "confirm_sent", { expiresAt: t.expiresAt.toISOString() });
  return resubscribe ? "resubscribe_sent" : existing ? "confirmation_resent" : "confirmation_sent";
}

export type ConfirmResult = { status: "confirmed"; firstName: string | null; unsubscribeToken: string } | { status: "expired" } | { status: "invalid" };

export async function confirmSubscription(token: string | undefined | null): Promise<ConfirmResult> {
  if (!token || token.length > 200) return { status: "invalid" };
  const hash = hashToken(token);
  const sub = await db.newsletterSubscriber.findUnique({ where: { confirmTokenHash: hash } });
  if (!sub) return { status: "invalid" };
  if (!sub.confirmExpiresAt || sub.confirmExpiresAt < new Date()) return { status: "expired" };
  const wasRemoved = sub.status !== "PENDING" || (await isSuppressed(sub.email));
  const now = new Date();
  // Atomic: only the request that clears this exact token wins.
  const won = await db.newsletterSubscriber.updateMany({
    where: { id: sub.id, confirmTokenHash: hash },
    data: { status: "ACTIVE", confirmedAt: now, confirmTokenHash: null, confirmExpiresAt: null, unsubscribedAt: null, unsubscribeReason: null },
  });
  if (!won.count) return { status: "invalid" };
  if (!sub.userId) {
    // Confirming proves ownership of the address: link the member account with the same email, if any.
    const u = await db.user.findFirst({ where: { email: { equals: sub.email, mode: "insensitive" }, newsletterSubscriber: { is: null } }, select: { id: true } }).catch(() => null);
    if (u) await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { userId: u.id } }).catch(() => {});
  }
  if (wasRemoved) {
    // A fresh, confirmed double opt-in is valid consent: lift the suppression.
    await db.emailSuppression.deleteMany({ where: { email: sub.email } });
    await logEvent(sub.id, "resubscribed", { previousStatus: sub.status });
  }
  await logEvent(sub.id, "confirmed", { consentVersion: sub.consentVersion });
  await sendWelcomeEmail(sub);
  await logEvent(sub.id, "welcome_sent");
  return { status: "confirmed", firstName: sub.firstName, unsubscribeToken: sub.unsubscribeToken };
}

export async function findByUnsubscribeToken(token: string | undefined | null) {
  if (!token || token.length > 200 || token.length < 20) return null;
  return db.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } });
}

/** Unsubscribes, suppresses the address, and skips anything still queued for it. Idempotent. */
export async function unsubscribe(subscriberId: string, opts: { reason?: string | null; method: string; actorId?: string | null }) {
  const sub = await db.newsletterSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return null;
  const reason = opts.reason?.trim().slice(0, 500) || null;
  if (sub.status !== "UNSUBSCRIBED") {
    await db.newsletterSubscriber.update({
      where: { id: sub.id },
      data: {
        // Keep BOUNCED/COMPLAINED (more specific); otherwise UNSUBSCRIBED.
        status: sub.status === "BOUNCED" || sub.status === "COMPLAINED" ? sub.status : "UNSUBSCRIBED",
        unsubscribedAt: new Date(), unsubscribeReason: reason, confirmTokenHash: null, confirmExpiresAt: null,
      },
    });
    await logEvent(sub.id, "unsubscribed", { method: opts.method, ...(reason ? { reason } : {}), ...(opts.actorId ? { by: opts.actorId } : {}) });
  }
  if (!(await isSuppressed(sub.email))) await addSuppression(sub.email, opts.method === "admin" ? "manual" : "unsubscribed");
  await db.newsletterSend.updateMany({ where: { subscriberId: sub.id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Unsubscribed" } });
  return sub;
}

export async function updatePreferences(subscriberId: string, prefs: Preferences, firstName?: string | null) {
  await db.newsletterSubscriber.update({
    where: { id: subscriberId },
    data: { preferences: prefs, ...(firstName !== undefined ? { firstName: firstName?.trim().slice(0, 80) || null } : {}) },
  });
  await logEvent(subscriberId, "preferences", prefs);
}

/** Bounce / complaint from the provider: suppress permanently and stop queued sends. */
export async function markUndeliverable(subscriberId: string, kind: "BOUNCED" | "COMPLAINED") {
  const sub = await db.newsletterSubscriber.findUnique({ where: { id: subscriberId } });
  if (!sub) return;
  if (sub.status !== kind) {
    await db.newsletterSubscriber.update({ where: { id: sub.id }, data: { status: kind, confirmTokenHash: null, confirmExpiresAt: null } });
  }
  await addSuppression(sub.email, kind === "BOUNCED" ? "bounced" : "complained");
  await db.newsletterSend.updateMany({ where: { subscriberId: sub.id, status: "QUEUED" }, data: { status: "SKIPPED", error: kind === "BOUNCED" ? "Bounced" : "Complaint" } });
  return sub;
}

/** Linked subscriber, or one with the account's email — only once that email is verified (so status isn't revealed to someone who merely typed an address). */
export async function findMemberSubscriber(user: { id: string; email: string; emailVerifiedAt: Date | null }) {
  const or = [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ email: user.email.toLowerCase() }] : [])];
  return db.newsletterSubscriber.findFirst({ where: { OR: or }, orderBy: { updatedAt: "desc" } });
}

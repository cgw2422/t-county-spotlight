import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import type { SendStatus } from "@/generated/prisma/client";
import { logEvent, markUndeliverable, normalizeEmail } from "./subscribers";

export const WEBHOOK_TOLERANCE_S = 5 * 60;

/**
 * Verifies a Resend (Svix) webhook signature.
 * signed content = `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with
 * the base64 secret after "whsec_"; header "svix-signature" holds
 * space-separated "v1,<base64>" entries.
 */
export function verifySvixSignature(secret: string, h: { id: string | null; timestamp: string | null; signature: string | null }, rawBody: string, nowSec = Math.floor(Date.now() / 1000)): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "no secret" };
  if (!h.id || !h.timestamp || !h.signature) return { ok: false, reason: "missing headers" };
  if (!/^\d+$/.test(h.timestamp)) return { ok: false, reason: "bad timestamp" };
  const ts = Number(h.timestamp);
  if (Math.abs(nowSec - ts) > WEBHOOK_TOLERANCE_S) return { ok: false, reason: "timestamp outside tolerance" };
  let key: Buffer;
  try {
    key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  } catch {
    return { ok: false, reason: "bad secret" };
  }
  const expected = crypto.createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest();
  for (const part of h.signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    let got: Buffer;
    try { got = Buffer.from(sig, "base64"); } catch { continue; }
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) return { ok: true };
  }
  return { ok: false, reason: "signature mismatch" };
}

type ResendEvent = { type?: string; created_at?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string }; click?: { link?: string } } };

const RANK: Record<SendStatus, number> = { QUEUED: 0, FAILED: 0, SKIPPED: 0, SENT: 1, DELIVERED: 2, BOUNCED: 3, COMPLAINED: 4 };

/** Applies one provider event. Idempotent: replays never double-count or regress status. */
export async function handleResendEvent(evt: ResendEvent, svixId: string) {
  const type = evt.type ?? "";
  const emailId = evt.data?.email_id;
  const at = evt.created_at ? new Date(evt.created_at) : new Date();
  const when = isNaN(at.getTime()) ? new Date() : at;
  const send = emailId ? await db.newsletterSend.findUnique({ where: { providerMessageId: emailId } }) : null;

  // Bounce/complaint on a non-campaign email (e.g. a confirmation) still suppresses the address.
  if (!send) {
    if (type === "email.bounced" || type === "email.complained") {
      const to = normalizeEmail(Array.isArray(evt.data?.to) ? evt.data?.to[0] : evt.data?.to);
      const sub = to ? await db.newsletterSubscriber.findUnique({ where: { email: to } }) : null;
      if (sub && (type === "email.complained" || isPermanentBounce(evt))) {
        await markUndeliverable(sub.id, type === "email.bounced" ? "BOUNCED" : "COMPLAINED");
        await logOnce(sub.id, type === "email.bounced" ? "bounced" : "complained", svixId, {});
      }
    }
    return { matched: false };
  }

  const promote = async (status: SendStatus) => {
    if (RANK[status] > RANK[send.status]) await db.newsletterSend.update({ where: { id: send.id }, data: { status } });
  };
  switch (type) {
    case "email.sent":
      break; // already SENT when the provider accepted it
    case "email.delivered":
      await promote("DELIVERED");
      await logOnce(send.subscriberId, "delivered", svixId, { newsletterId: send.newsletterId });
      break;
    case "email.bounced":
      if (isPermanentBounce(evt)) {
        await promote("BOUNCED");
        await markUndeliverable(send.subscriberId, "BOUNCED");
      }
      await logOnce(send.subscriberId, "bounced", svixId, { newsletterId: send.newsletterId, bounceType: evt.data?.bounce?.type ?? null });
      break;
    case "email.complained":
      await promote("COMPLAINED");
      await markUndeliverable(send.subscriberId, "COMPLAINED");
      await logOnce(send.subscriberId, "complained", svixId, { newsletterId: send.newsletterId });
      break;
    case "email.opened":
      await db.newsletterSend.updateMany({ where: { id: send.id, openedAt: null }, data: { openedAt: when } });
      await logOnce(send.subscriberId, "opened", svixId, { newsletterId: send.newsletterId });
      break;
    case "email.clicked":
      await db.newsletterSend.updateMany({ where: { id: send.id, clickedAt: null }, data: { clickedAt: when } });
      await logOnce(send.subscriberId, "clicked", svixId, { newsletterId: send.newsletterId });
      break;
  }
  return { matched: true };
}

function isPermanentBounce(evt: ResendEvent) {
  const t = evt.data?.bounce?.type?.toLowerCase();
  return !t || t === "permanent" || t === "hard";
}

async function logOnce(subscriberId: string, type: string, svixId: string, data: Record<string, unknown>) {
  const exists = await db.subscriberEvent.findFirst({ where: { subscriberId, type, data: { path: ["svixId"], equals: svixId } }, select: { id: true } });
  if (!exists) await logEvent(subscriberId, type, { ...data, svixId } as never);
}

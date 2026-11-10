import crypto from "node:crypto";
import { isEmailUpdateKey, type EmailUpdateKey } from "@/lib/notification-categories";

/**
 * Signed, login-free "turn off this email update" links. The token names one
 * member and one update type and is signed with a server secret (same secret
 * fallback chain as the garage-sale form stamp). No expiry: unsubscribe links
 * in old emails must keep working. It can only ever turn a preference OFF.
 */
function secret() {
  return process.env.FORM_SECRET || process.env.DATABASE_URL || "tcounty-form";
}

const KIND_CODES: Record<EmailUpdateKey, string> = { weekend_summary: "ws", saved_event_reminders: "sr", new_in_my_communities: "nc" };

function sign(userId: string, code: string) {
  return crypto.createHmac("sha256", secret()).update(`email-update-unsub:${userId}:${code}`).digest("base64url").slice(0, 32);
}

export function unsubscribeToken(userId: string, kind: EmailUpdateKey) {
  const code = KIND_CODES[kind];
  return `${userId}.${code}.${sign(userId, code)}`;
}

/** Returns the member id and update kind, or null for anything malformed or forged. */
export function verifyUnsubscribeToken(token: string | null | undefined): { userId: string; kind: EmailUpdateKey } | null {
  if (!token || token.length > 120) return null;
  const m = /^([A-Za-z0-9_-]{8,40})\.([a-z]{2})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const kind = (Object.entries(KIND_CODES).find(([, c]) => c === m[2])?.[0] ?? null) as EmailUpdateKey | null;
  if (!kind || !isEmailUpdateKey(kind)) return null;
  const expected = Buffer.from(sign(m[1], m[2]));
  const got = Buffer.from(m[3]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  return { userId: m[1], kind };
}

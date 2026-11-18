import "server-only";
import crypto from "node:crypto";
import { BEEHIIV_SIGNUP_MESSAGES, REGISTER_NEWSLETTER_FAILED, REGISTER_NEWSLETTER_NOTE, REGISTER_NEWSLETTER_SUBSCRIBED } from "./copy";

/**
 * The newsletter result of a registration, handed to the My T County welcome screen as `?nl=<token>`.
 * The token is HMAC-signed (FORM_SECRET fallback chain, like the other form/link tokens), names the new
 * member and expires after an hour, so a hand-made or copied link can never show a false "you're subscribed".
 */
function secret() {
  return process.env.FORM_SECRET || process.env.DATABASE_URL || "tcounty-form";
}

export const REGISTER_NEWSLETTER_RESULTS = ["subscribed", "already", "finishing", "pending", "neutral", "failed", "builtin"] as const;
export type RegisterNewsletterResult = (typeof REGISTER_NEWSLETTER_RESULTS)[number];

const TTL_SECONDS = 60 * 60;

function sign(userId: string, result: string, exp: number) {
  return crypto.createHmac("sha256", secret()).update(`nl-register:${userId}:${result}:${exp}`).digest("base64url").slice(0, 32);
}

export function registerNewsletterToken(userId: string, result: RegisterNewsletterResult, now = Date.now()) {
  const exp = Math.floor(now / 1000) + TTL_SECONDS;
  return `${result}.${exp}.${sign(userId, result, exp)}`;
}

/** The result for this signed-in member, or null when the token is missing, malformed, expired, forged or someone else's. */
export function verifyRegisterNewsletterToken(token: unknown, userId: string, now = Date.now()): RegisterNewsletterResult | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const m = /^([a-z]{3,12})\.(\d{9,12})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m || !(REGISTER_NEWSLETTER_RESULTS as readonly string[]).includes(m[1])) return null;
  const exp = Number(m[2]);
  if (!Number.isFinite(exp) || exp * 1000 < now) return null;
  const want = Buffer.from(sign(userId, m[1], exp));
  const got = Buffer.from(m[3]);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  return m[1] as RegisterNewsletterResult;
}

export type RegisterNewsletterNote = { tone: "success" | "info" | "problem"; text: string; retry: boolean };

/** What the welcome screen says about the newsletter for each result. */
export function registerNewsletterNote(r: RegisterNewsletterResult): RegisterNewsletterNote {
  switch (r) {
    case "subscribed": return { tone: "success", text: REGISTER_NEWSLETTER_SUBSCRIBED, retry: false };
    case "already": return { tone: "success", text: BEEHIIV_SIGNUP_MESSAGES.already, retry: false };
    case "finishing": return { tone: "info", text: BEEHIIV_SIGNUP_MESSAGES.finishing, retry: false };
    case "pending": return { tone: "info", text: BEEHIIV_SIGNUP_MESSAGES.pending, retry: false };
    case "neutral": return { tone: "info", text: BEEHIIV_SIGNUP_MESSAGES.neutral, retry: false };
    case "builtin": return { tone: "info", text: REGISTER_NEWSLETTER_NOTE, retry: false };
    case "failed": return { tone: "problem", text: REGISTER_NEWSLETTER_FAILED, retry: true };
  }
}

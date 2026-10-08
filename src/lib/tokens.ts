import "server-only";
import { db } from "./db";
import { hashToken, randomToken } from "./auth";
import { sendEmail } from "./email";
import { absoluteUrl } from "./utils";
import { getSettings } from "./settings";
import type { TokenType } from "@/generated/prisma/client";

/** Creates a single-use token (only its hash is stored) and returns the raw value. */
export async function createUserToken(userId: string, type: TokenType, ttlMs: number) {
  const token = randomToken();
  // Only one live token of each type per user.
  await db.verificationToken.deleteMany({ where: { userId, type, usedAt: null } });
  await db.verificationToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

/** Looks up a valid (unused, unexpired) token without consuming it. */
export async function findValidToken(token: string | undefined | null, type: TokenType) {
  if (!token || token.length > 200) return null;
  const row = await db.verificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date() || row.user.status !== "ACTIVE") return null;
  return row;
}

export async function sendVerificationEmail(user: { id: string; email: string; name?: string | null }) {
  const token = await createUserToken(user.id, "EMAIL_VERIFY", 48 * 3600_000);
  const s = await getSettings();
  const link = absoluteUrl(`/verify-email/?token=${encodeURIComponent(token)}`);
  await sendEmail(
    user.email,
    `Confirm your email for ${s.siteName}`,
    `Hi${user.name ? ` ${user.name}` : ""},\n\nPlease confirm your email address by opening this link:\n\n${link}\n\nThe link expires in 48 hours. If you didn't create an account, you can ignore this message.\n\n— ${s.siteName}`,
  );
}

export async function sendPasswordResetEmail(user: { id: string; email: string; name?: string | null }) {
  const token = await createUserToken(user.id, "PASSWORD_RESET", 3600_000);
  const s = await getSettings();
  const link = absoluteUrl(`/reset-password/?token=${encodeURIComponent(token)}`);
  await sendEmail(
    user.email,
    `Reset your ${s.siteName} password`,
    `Hi${user.name ? ` ${user.name}` : ""},\n\nSomeone asked to reset the password for your account. To choose a new password, open this link:\n\n${link}\n\nThe link expires in 1 hour and can be used once. If you didn't ask for this, you can ignore this email — your password won't change.\n\n— ${s.siteName}`,
  );
}

/** Only allow same-site relative redirect targets. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\r\n]/.test(next)) return null;
  if (next.startsWith("/login") || next.startsWith("/register")) return null;
  return next;
}

export function homeForRole(role: string) {
  if (role === "ADMIN" || role === "EDITOR") return "/admin/";
  if (role === "BUSINESS_OWNER") return "/dashboard/";
  return "/account/";
}

import "server-only";
import { db } from "./db";
import { clientIp, hashPassword } from "./auth";
import { newPasswordProblem, type AccountFields } from "./account-fields";
import { rateLimit } from "./rate-limit";
import { sendVerificationEmail } from "./tokens";
import { audit } from "./audit";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Creating a normal (free, MEMBER) account. One code path for /register/ and the
 * "Create a Free Account" option on /list-your-business/: same field rules,
 * password policy, rate limits, audit entry and verification email.
 * The caller decides what an existing address means for the visitor
 * (/register/ answers neutrally; the business application asks them to sign in)
 * and signs the new member in (as /register/ always has).
 */

export { accountFieldsSchema, newPasswordProblem, type AccountFields } from "./account-fields";

export type CreateAccountResult =
  | { ok: true; user: { id: string; email: string; firstName: string | null } }
  | { ok: false; reason: "invalid" | "rate" | "exists" | "failed"; error: string; fieldErrors?: Record<string, string> };

/** Case-insensitive lookup (emails are stored lowercased; also matches any older mixed-case row). */
export function findAccountByEmail(email: string) {
  return db.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } }, select: { id: true, status: true } });
}

/**
 * Validates the password, applies the registration rate limits, and creates the account
 * (role MEMBER, status ACTIVE) unless the address already has one — an existing account is
 * never changed (no password reset, no linking). Sends the verification email.
 */
export async function createAccount(input: AccountFields & {
  confirm: string;
  homeCommunity?: string | null;
  /** Written to the `user.register` audit entry (the /verify-email/ funnel reads `source`). */
  auditDetails: Prisma.InputJsonObject;
}): Promise<CreateAccountResult> {
  const { firstName, lastName, email, password } = input;
  const pw = newPasswordProblem(password, input.confirm);
  if (pw) return { ok: false, reason: "invalid", ...pw };

  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 6, 60 * 60_000).ok || !rateLimit(`register:${ip}:${email}`, 3, 60 * 60_000).ok) {
    return { ok: false, reason: "rate", error: "Too many attempts. Please wait a while and try again." };
  }
  // Hash first so "already registered" and "created" take about the same time.
  const passwordHash = await hashPassword(password);
  if (await findAccountByEmail(email)) return { ok: false, reason: "exists", error: "An account with this email already exists." };

  let user;
  try {
    user = await db.user.create({
      data: {
        firstName, lastName, name: `${firstName} ${lastName}`, email,
        passwordHash, passwordChangedAt: new Date(), role: "MEMBER",
        homeCommunity: input.homeCommunity ?? null, lastLoginAt: new Date(),
      },
    });
  } catch {
    // Unique-email race: another request created it first.
    return { ok: false, reason: "exists", error: "An account with this email already exists." };
  }
  await audit(user.id, "user.register", "User", user.id, input.auditDetails);
  // Account/security email: always sent, whatever the newsletter choice.
  await sendVerificationEmail({ id: user.id, email: user.email, name: firstName });
  return { ok: true, user: { id: user.id, email: user.email, firstName: user.firstName } };
}

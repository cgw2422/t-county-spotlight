import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import type { Role } from "@/generated/prisma/client";

export const SESSION_COOKIE = "tcs_session";
const SESSION_DAYS = 30;

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  if (!hash) return false;
  return bcrypt.compare(pw, hash);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must include letters and numbers.";
  return null;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function createSession(userId: string, opts: { needs2fa?: boolean } = {}) {
  const token = randomToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      needs2fa: !!opts.needs2fa,
      userAgent: h.get("user-agent")?.slice(0, 300),
      ip: await clientIp(),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

const loadSession = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  return session;
});

/** Returns the fully-authenticated user (2FA completed), or null. */
export const getCurrentUser = cache(async () => {
  const s = await loadSession();
  if (!s || s.needs2fa) return null;
  return s.user;
});

export async function getPending2faSession() {
  const s = await loadSession();
  return s && s.needs2fa ? s : null;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(next = "/") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export const STAFF_ROLES: Role[] = ["ADMIN", "EDITOR"];

export function isStaff(user: { role: Role } | null | undefined) {
  return !!user && STAFF_ROLES.includes(user.role);
}

/** Admin area: ADMIN and EDITOR. Pass ["ADMIN"] for admin-only actions. */
export async function requireStaff(roles: Role[] = STAFF_ROLES) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!roles.includes(user.role)) redirect("/?denied=1");
  return user;
}

export async function requireAdmin() {
  return requireStaff(["ADMIN"]);
}

/**
 * Server-side ownership check. Staff may access any business; owners only
 * businesses linked to their account. Throws (404-like) otherwise.
 */
export async function requireBusinessAccess(businessId: string) {
  const user = await requireUser("/dashboard");
  if (isStaff(user)) {
    const b = await db.business.findUnique({ where: { id: businessId } });
    if (!b) redirect("/dashboard");
    return { user, business: b };
  }
  const link = await db.businessOwner.findUnique({
    where: { userId_businessId: { userId: user.id, businessId } },
    include: { business: true },
  });
  if (!link || link.business.deletedAt || link.business.status === "SUSPENDED") redirect("/dashboard");
  return { user, business: link.business };
}

export async function getOwnedBusinesses(userId: string) {
  return db.business.findMany({
    where: { owners: { some: { userId } }, deletedAt: null },
    orderBy: { name: "asc" },
  });
}

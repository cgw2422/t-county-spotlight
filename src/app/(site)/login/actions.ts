"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, getPending2faSession, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import { homeForRole, safeNext } from "@/lib/tokens";
import type { ActionState } from "@/components/ui/form-message";
import type { FormState } from "@/components/dashboard/fields";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().max(500).optional(),
});

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("timing-equalizer-not-a-password", 12));

const GENERIC = "That email and password don't match our records. Please try again.";

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: String(fd.get("email") ?? "").slice(0, 254) };
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password"), next: fd.get("next") || undefined });
  if (!parsed.success) return { error: "Please enter your email address and password.", values };
  const { email, password, next } = parsed.data;
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}:${email}`, 6, 15 * 60_000).ok || !rateLimit(`login-ip:${ip}`, 40, 15 * 60_000).ok) {
    return { error: "Too many sign-in attempts. Please wait a few minutes and try again.", values };
  }
  const user = await db.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? getDummyHash());
  if (!user || !user.passwordHash || !ok || user.status !== "ACTIVE") return { error: GENERIC, values };

  await destroySession(); // avoid session fixation
  const target = safeNext(next);
  if (user.totpEnabled && user.totpSecret) {
    await createSession(user.id, { needs2fa: true });
    redirect(`/login/2fa/${target ? `?next=${encodeURIComponent(target)}` : ""}`);
  }
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  redirect(target ?? homeForRole(user.role));
}

export async function verify2faAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const session = await getPending2faSession();
  if (!session) redirect("/login/");
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!rateLimit(`2fa:${session.id}`, 6, 10 * 60_000).ok) {
    await destroySession();
    redirect("/login/?locked=1");
  }
  if (!/^\d{6}$/.test(code) || !session.user.totpSecret || !verifyTotp(session.user.totpSecret, code)) {
    return { error: "That code didn't work. Check your authenticator app and try again." };
  }
  await db.session.update({ where: { id: session.id }, data: { needs2fa: false } });
  await db.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
  redirect(safeNext(String(fd.get("next") ?? "")) ?? homeForRole(session.user.role));
}

export async function cancel2faAction() {
  await destroySession();
  redirect("/login/");
}

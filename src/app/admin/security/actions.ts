"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashToken, requireStaff, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { generateSecret, verifyTotp } from "@/lib/totp";
import type { ActionState } from "@/components/ui/form-message";

const SETUP_COOKIE = "tcs_totp_setup";

export async function startTotpSetup(): Promise<ActionState> {
  const user = await requireStaff();
  if (user.totpEnabled) return { error: "Two-factor authentication is already on." };
  const secret = generateSecret();
  // Stage the secret on the user (not enabled until a code is confirmed).
  await db.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpEnabled: false } });
  (await cookies()).set(SETUP_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/admin", maxAge: 900 });
  revalidatePath("/admin/security");
  return { ok: true, message: "Scan the secret with your authenticator app, then enter a code." };
}

export async function confirmTotp(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app." };
  const u = await db.user.findUnique({ where: { id: user.id } });
  if (!u?.totpSecret) return { error: "Start setup first." };
  if (!verifyTotp(u.totpSecret, code)) return { error: "That code didn't match. Check your phone's clock and try again." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
  (await cookies()).delete(SETUP_COOKIE);
  await audit(user.id, "user.enable_2fa", "User", user.id, { email: user.email });
  revalidatePath("/admin/security");
  return { ok: true, message: "Two-factor authentication is on." };
}

export async function disableTotp(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const u = await db.user.findUnique({ where: { id: user.id } });
  if (!u?.totpEnabled || !u.totpSecret) return { error: "Two-factor authentication isn't on." };
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  const password = String(fd.get("password") ?? "");
  if (!verifyTotp(u.totpSecret, code)) return { error: "Enter a current code from your authenticator app." };
  if (u.passwordHash && !(await verifyPassword(password, u.passwordHash))) return { error: "Your password is incorrect." };
  await db.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null } });
  // Sign out other sessions for safety.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { userId: user.id, ...(token ? { NOT: { id: hashToken(token) } } : {}) } });
  await audit(user.id, "user.disable_2fa", "User", user.id, { email: user.email });
  revalidatePath("/admin/security");
  return { ok: true, message: "Two-factor authentication turned off. Other sessions were signed out." };
}

export async function cancelTotpSetup(): Promise<ActionState> {
  const user = await requireStaff();
  const u = await db.user.findUnique({ where: { id: user.id } });
  if (u && !u.totpEnabled) await db.user.update({ where: { id: user.id }, data: { totpSecret: null } });
  (await cookies()).delete(SETUP_COOKIE);
  revalidatePath("/admin/security");
  return { ok: true, message: "Setup canceled." };
}

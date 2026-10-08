"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, hashPassword, passwordProblem } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { findValidToken, homeForRole } from "@/lib/tokens";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`reset:${ip}`, 10, 15 * 60_000).ok) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem, fieldErrors: { password: problem } };
  if (password !== confirm) return { error: "The two passwords don't match.", fieldErrors: { confirm: "Passwords don't match." } };

  const row = await findValidToken(token, "PASSWORD_RESET");
  if (!row) return { error: "This reset link is invalid or has expired. Please request a new one." };
  const user = row.user;
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      // Following the emailed link proves inbox access, so the address is verified too.
      data: { passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
    }),
    db.verificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.verificationToken.deleteMany({ where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null } }),
    db.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit(user.id, "user.password_reset", "User", user.id);
  await destroySession();
  if (user.totpEnabled && user.totpSecret) {
    await createSession(user.id, { needs2fa: true });
    redirect("/login/2fa/");
  }
  await createSession(user.id);
  redirect(homeForRole(user.role) + "?password=reset");
}

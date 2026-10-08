"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/tokens";
import type { ActionState } from "@/components/ui/form-message";

const SAME = "If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour — be sure to check your spam folder.";

export async function forgotPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(fd.get("email"));
  if (!parsed.success) return { error: "Please enter a valid email address." };
  const email = parsed.data;
  const ip = await clientIp();
  if (!rateLimit(`forgot:${ip}`, 8, 15 * 60_000).ok) return { error: "Too many requests. Please wait a few minutes and try again." };
  // Silently cap emails per address so the form can't be used to spam someone.
  if (rateLimit(`forgot:${email}`, 3, 60 * 60_000).ok) {
    const user = await db.user.findUnique({ where: { email } });
    if (user && user.status === "ACTIVE") await sendPasswordResetEmail(user);
  }
  return { ok: true, message: SAME };
}

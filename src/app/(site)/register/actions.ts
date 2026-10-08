"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, hashPassword, passwordProblem } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext, sendVerificationEmail } from "@/lib/tokens";
import { audit } from "@/lib/audit";
import { echoValues, type FormState } from "@/components/dashboard/fields";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  password: z.string().max(200),
  ownsBusiness: z.boolean(),
  next: z.string().max(500).optional(),
});

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = echoValues(fd, ["password"]);
  const parsed = schema.safeParse({
    name: fd.get("name"), email: fd.get("email"), password: fd.get("password") ?? "",
    ownsBusiness: fd.get("ownsBusiness") === "on", next: fd.get("next") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const { name, email, password, ownsBusiness, next } = parsed.data;
  const pwErr = passwordProblem(password);
  if (pwErr) return { error: pwErr, fieldErrors: { password: pwErr }, values };

  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 6, 60 * 60_000).ok || !rateLimit(`register:${ip}:${email}`, 3, 60 * 60_000).ok) {
    return { error: "Too many attempts. Please wait a while and try again.", values };
  }

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) {
    // Generic message — don't confirm whether an address is registered.
    return { error: "We couldn't create an account with those details. If you already have an account, sign in or reset your password.", values };
  }
  let user;
  try {
    user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password), role: "MEMBER" } });
  } catch {
    return { error: "We couldn't create an account with those details. If you already have an account, sign in or reset your password.", values };
  }
  await audit(user.id, "user.register", "User", user.id, { ownsBusiness });
  await sendVerificationEmail(user);
  await destroySession();
  await createSession(user.id);
  if (ownsBusiness) redirect("/list-your-business/?welcome=1");
  redirect(safeNext(next) ?? "/account/?welcome=1");
}

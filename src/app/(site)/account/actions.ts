"use server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { SESSION_COOKIE, clientIp, destroySession, getCurrentUser, hashPassword, hashToken, isStaff, passwordProblem, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/tokens";
import { audit } from "@/lib/audit";
import { NOTIFICATION_KEYS, enabledCategories, type NotificationPrefs } from "@/lib/notification-categories";
import type { ActionState } from "@/components/ui/form-message";

async function me() {
  const user = await getCurrentUser();
  if (!user) redirect("/login/?next=%2Faccount%2F");
  return user;
}

export async function removeSavedAction(fd: FormData) {
  const user = await me();
  const id = String(fd.get("id") ?? "");
  await db.savedItem.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/account/");
}

export async function unfollowAction(fd: FormData) {
  const user = await me();
  const businessId = String(fd.get("businessId") ?? "");
  await db.businessFollow.deleteMany({ where: { userId: user.id, businessId } });
  revalidatePath("/account/following/");
}

export async function updateNameAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  const name = z.string().trim().min(1).max(100).safeParse(fd.get("name"));
  if (!name.success) return { error: "Please enter your name (up to 100 characters)." };
  await db.user.update({ where: { id: user.id }, data: { name: name.data } });
  revalidatePath("/account/", "layout");
  return { message: "Your name was updated." };
}

export async function changeEmailAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(fd.get("email"));
  if (!email.success) return { error: "Please enter a valid email address." };
  if (!rateLimit(`email-change:${user.id}`, 5, 60 * 60_000).ok) return { error: "Too many attempts. Please try again later." };
  if (!(await verifyPassword(String(fd.get("currentPassword") ?? ""), user.passwordHash))) return { error: "Your current password is incorrect." };
  if (email.data === user.email) return { error: "That's already your email address." };
  const taken = await db.user.findUnique({ where: { email: email.data }, select: { id: true } });
  if (taken) return { error: "That email address can't be used. Please try a different one." };
  const updated = await db.user.update({ where: { id: user.id }, data: { email: email.data, emailVerifiedAt: null } });
  await db.verificationToken.deleteMany({ where: { userId: user.id, type: "EMAIL_VERIFY" } });
  await sendVerificationEmail(updated);
  await audit(user.id, "user.email_change", "User", user.id, { from: user.email, to: email.data });
  revalidatePath("/account/", "layout");
  return { message: `Email updated. We sent a confirmation link to ${email.data}.` };
}

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (!rateLimit(`pw-change:${user.id}`, 6, 15 * 60_000).ok) return { error: "Too many attempts. Please wait a few minutes." };
  const current = String(fd.get("currentPassword") ?? "");
  const next = String(fd.get("newPassword") ?? "");
  const confirm = String(fd.get("confirmPassword") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "Your current password is incorrect." };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== confirm) return { error: "The new passwords don't match." };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentSessionId = token ? hashToken(token) : "";
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } }),
    db.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } }),
  ]);
  await audit(user.id, "user.password_change", "User", user.id);
  return { message: "Password changed. You've been signed out on your other devices." };
}

export async function resendVerificationAction(_p: ActionState): Promise<ActionState> {
  const user = await me();
  if (user.emailVerifiedAt) return { message: "Your email is already confirmed." };
  const ip = await clientIp();
  if (!rateLimit(`verify-resend:${user.id}`, 3, 60 * 60_000).ok || !rateLimit(`verify-resend-ip:${ip}`, 10, 60 * 60_000).ok) {
    return { error: "We've sent a few links already. Please check your inbox (and spam) or try again later." };
  }
  await sendVerificationEmail(user);
  return { message: `Sent! Check ${user.email} for the confirmation link.` };
}

export async function saveNotificationPrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  const prefs: NotificationPrefs = { categories: Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, fd.get(k) === "on"])) as NotificationPrefs["categories"] };
  await db.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
  // Keep this user's push subscriptions in step with their choices.
  await db.pushSubscription.updateMany({ where: { userId: user.id }, data: { categories: enabledCategories(prefs) } });
  revalidatePath("/account/notifications/");
  return { message: "Notification preferences saved." };
}

export async function deleteAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await me();
  if (isStaff(user)) return { error: "Staff accounts must be removed by another administrator." };
  const typed = String(fd.get("confirmEmail") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) return { error: "Type your email address exactly to confirm." };
  if (user.passwordHash && !(await verifyPassword(String(fd.get("currentPassword") ?? ""), user.passwordHash))) {
    return { error: "Your password is incorrect." };
  }
  const ref = crypto.createHash("sha256").update(user.id).digest("hex").slice(0, 12);
  await db.$transaction([
    // Anonymize records that outlive the account.
    db.event.updateMany({ where: { submittedById: user.id }, data: { submitterEmail: null } }),
    db.businessApplication.updateMany({ where: { userId: user.id }, data: { email: `deleted-${ref}@invalid`, contactName: null, phone: null } }),
    // Cascades: sessions, tokens, saved items, follows, push subscriptions, redemptions, business links.
    db.user.delete({ where: { id: user.id } }),
  ]);
  await audit(null, "user.self_delete", "User", user.id, { ref });
  await destroySession();
  redirect("/?account=deleted");
}

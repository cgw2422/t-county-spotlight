"use server";
import { clientIp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { emailUpdateLabel } from "@/lib/notification-categories";
import { findUnsubscribeTarget, turnOffEmailUpdate } from "@/lib/notifications/preferences";
import type { ActionState } from "@/components/ui/form-message";

/** Form POST from the email link page (no login): turns off only the update named by the signed token. */
export async function turnOffEmailUpdateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`upd-unsub:${ip}`, 30, 600_000).ok) return { error: "Too many requests. Please try again shortly." };
  const target = await findUnsubscribeTarget(String(fd.get("t") ?? ""));
  if (!target) return { error: "This link isn't valid. Use the link from your most recent email, or sign in to manage your email updates." };
  await turnOffEmailUpdate(target.user.id, target.kind, "link");
  return { ok: true, message: `Done — “${emailUpdateLabel(target.kind)}” emails are turned off. Your other email choices haven’t changed.` };
}

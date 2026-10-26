"use server";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { PUBLIC_SIGNUP_SOURCES, SIGNUP_NEUTRAL_MESSAGE, TOPICS, type Preferences, type SignupSource } from "@/lib/newsletter/copy";
import { findByUnsubscribeToken, findMemberSubscriber, normalizeEmail, requestSubscription, unsubscribe, updatePreferences } from "@/lib/newsletter/subscribers";
import type { ActionState } from "@/components/ui/form-message";

/** Public signup. Always answers with the same neutral message for valid addresses. */
export async function subscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  // Honeypot: real people never fill this hidden field. Pretend success.
  if (String(fd.get("website") ?? "").trim()) return { ok: true, message: SIGNUP_NEUTRAL_MESSAGE };
  const email = normalizeEmail(fd.get("email"));
  if (!email) return { error: "Please enter a valid email address.", fieldErrors: { email: "Enter a valid email address" } };
  const rawSource = String(fd.get("source") ?? "");
  const source = ((PUBLIC_SIGNUP_SOURCES as readonly string[]).includes(rawSource) ? rawSource : "newsletter_page") as SignupSource;
  const ip = await clientIp();
  if (!rateLimit(`nl-signup-ip:${ip}`, 10, 3600_000).ok) return { error: "Too many signup attempts. Please try again in a little while." };
  // Per-address limit: still reply neutrally so the limit doesn't reveal anything.
  if (!rateLimit(`nl-signup-email:${email}`, 5, 3600_000).ok) return { ok: true, message: SIGNUP_NEUTRAL_MESSAGE };
  const user = await getCurrentUser();
  try {
    await requestSubscription({ email, firstName: String(fd.get("firstName") ?? ""), source, userId: user?.id ?? null, ip });
  } catch (e) {
    console.error("[newsletter] signup failed", e);
    return { error: "Something went wrong. Please try again." };
  }
  return { ok: true, message: SIGNUP_NEUTRAL_MESSAGE };
}

function prefsFrom(fd: FormData): Preferences {
  return Object.fromEntries(TOPICS.map((t) => [t.key, fd.get(`topic_${t.key}`) === "on"])) as Preferences;
}

/** Preferences via the capability token from an email (no login). */
export async function savePreferencesByTokenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`nl-prefs:${ip}`, 30, 600_000).ok) return { error: "Too many requests. Please try again shortly." };
  const sub = await findByUnsubscribeToken(String(fd.get("token") ?? ""));
  if (!sub) return { error: "This link is invalid. Use the link from your most recent email." };
  if (sub.status !== "ACTIVE") return { error: "This address isn't currently subscribed." };
  const prefs = prefsFrom(fd);
  if (!Object.values(prefs).some(Boolean)) return { error: "Pick at least one topic — or unsubscribe below if you'd rather not get the newsletter." };
  await updatePreferences(sub.id, prefs, String(fd.get("firstName") ?? ""));
  return { ok: true, message: "Your preferences are saved." };
}

/** Form POST from /newsletter/unsubscribe/ (no login). */
export async function unsubscribeByTokenAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ip = await clientIp();
  if (!rateLimit(`nl-unsub:${ip}`, 30, 600_000).ok) return { error: "Too many requests. Please try again shortly." };
  const sub = await findByUnsubscribeToken(String(fd.get("token") ?? ""));
  if (!sub) return { error: "This link is invalid. Use the link from your most recent email." };
  await unsubscribe(sub.id, { reason: String(fd.get("reason") ?? ""), method: "link" });
  return { ok: true, message: "You've been unsubscribed. You won't receive the T-County Weekly anymore." };
}

// ── Signed-in members (/account/newsletter/) ──
async function memberSubscriber() {
  const user = await getCurrentUser();
  if (!user) return { user: null, sub: null };
  return { user, sub: await findMemberSubscriber(user) };
}


export async function accountSubscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await memberSubscriber();
  if (!user) return { error: "Please sign in again." };
  if (String(fd.get("consent") ?? "") !== "on") return { error: "Please tick the box to confirm you'd like the newsletter." };
  if (!rateLimit(`nl-signup-email:${user.email.toLowerCase()}`, 5, 3600_000).ok) return { error: "Please wait a little before trying again." };
  await requestSubscription({ email: user.email, firstName: user.name?.split(/\s+/)[0] ?? null, source: "account", userId: user.id, ip: await clientIp() });
  return { ok: true, message: `Almost done! We sent a confirmation link to ${user.email}. Open it to start receiving the T-County Weekly.` };
}

export async function accountPreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { sub } = await memberSubscriber();
  if (!sub || sub.status !== "ACTIVE") return { error: "You're not currently subscribed." };
  const prefs = prefsFrom(fd);
  if (!Object.values(prefs).some(Boolean)) return { error: "Pick at least one topic, or unsubscribe instead." };
  await updatePreferences(sub.id, prefs);
  return { ok: true, message: "Your preferences are saved." };
}

export async function accountUnsubscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { sub } = await memberSubscriber();
  if (!sub) return { error: "You're not subscribed." };
  await unsubscribe(sub.id, { reason: String(fd.get("reason") ?? ""), method: "account" });
  return { ok: true, message: "You've been unsubscribed from the T-County Weekly." };
}

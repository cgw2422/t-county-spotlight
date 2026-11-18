import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { absoluteUrl } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { BEEHIIV_SIGNUP_MESSAGES as MSG, SIGNUP_PLACEMENTS, type SignupPlacement } from "@/lib/newsletter/copy";
import { BeehiivCallError, beehiivEnv, createSubscription, getPublication, getSubscriptionByEmail, type BeehiivEnv } from "./client";

/**
 * Native newsletter signup → beehiiv API, through our server only.
 * No local subscriber record, no account, no email from our side. The API key
 * and publication id never reach the browser, responses or logs.
 */

export const SIGNUP_LIMITS = {
  ip: { limit: 5, windowMs: 10 * 60_000 },
  email: { limit: 3, windowMs: 60 * 60_000 },
} as const;

/** Default page per placement (referring_site when the form's page path is missing or unusable). */
const PLACEMENT_PATH: Record<SignupPlacement | "admin_test", string> = {
  homepage_hero: "/", homepage: "/", newsletter_page: "/newsletter/", newsletter_issue: "/newsletter/", footer: "/", article: "/articles/",
  event: "/events/", explore: "/explore/", account: "/account/", admin_test: "/admin/newsletter/settings/",
};

export function cleanPlacement(v: unknown): SignupPlacement {
  const s = String(v ?? "");
  return ((SIGNUP_PLACEMENTS as readonly string[]).includes(s) ? s : "newsletter_page") as SignupPlacement;
}

/** A same-site path like "/events/fair/" (no scheme, host, query or odd characters) → absolute URL; else the placement's page. */
export function referringSiteFor(page: unknown, placement: SignupPlacement | "admin_test") {
  const p = String(page ?? "");
  const ok = p.length <= 300 && /^\/(?!\/)[A-Za-z0-9\-._~/%]*$/.test(p);
  return absoluteUrl(ok ? p : PLACEMENT_PATH[placement]);
}

const BAD_TLDS = new Set(["invalid", "localhost", "local", "test", "lan", "internal"]);
const emailSchema = z.email();

/** trim + lowercase, ≤ 254 chars, zod email, plus checks for obviously unusable addresses. null when unusable. */
export function normalizeSignupEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!emailSchema.safeParse(email).success) return null;
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !l || l.length > 63 || l.startsWith("-") || l.endsWith("-"))) return null;
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld) && !/^xn--[a-z0-9-]{2,59}$/.test(tld)) return null;
  if (BAD_TLDS.has(tld)) return null;
  return email;
}

/** "jane.doe@example.com" → "j***@example.com" (what audit logs and admin status keep). */
export function maskEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***@${email.slice(at + 1)}`;
}

export type SignupOutcome = "subscribed" | "pending" | "neutral";

/** beehiiv subscription status → what we tell the visitor. Unknown statuses are treated like "pending". */
export function outcomeForStatus(status: unknown): SignupOutcome {
  switch (String(status ?? "").toLowerCase()) {
    case "active": return "subscribed";
    case "inactive": // previously unsubscribed: never reactivated, never revealed
    case "invalid":
    case "needs_attention": return "neutral";
    default: return "pending"; // pending, validating, unknown
  }
}
export const messageForOutcome = (o: SignupOutcome) => (o === "subscribed" ? MSG.subscribed : o === "neutral" ? MSG.neutral : MSG.pending);

// ───────── Connection state (Setting "beehiiv.connection") ─────────

const STATE_KEY = "beehiiv.connection";

export type ConnectionCheck = { ok: boolean; at: string; publicationName?: string | null; error?: string; pub: string };
export type SignupVerification = { ok: boolean; at: string; status?: string | null; publicationName?: string | null; maskedEmail: string; error?: string; pub: string };
export type ConnectionState = { check?: ConnectionCheck; verification?: SignupVerification; signupProblem?: { at: string; httpStatus: number } };

/** Fingerprint of the publication + API base (not the id itself): a check only counts for the configuration it was made with. */
export function publicationFingerprint(env: BeehiivEnv) {
  return crypto.createHash("sha256").update(`${env.apiBase}|${env.publicationId}`).digest("hex").slice(0, 16);
}

export async function getConnectionState(): Promise<ConnectionState> {
  const row = await db.setting.findUnique({ where: { key: STATE_KEY } }).catch(() => null);
  return (row?.value && typeof row.value === "object" ? row.value : {}) as ConnectionState;
}

async function patchConnectionState(patch: Partial<ConnectionState>) {
  const merged: Record<string, unknown> = { ...(await getConnectionState()), ...patch };
  for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
  const value = merged as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: STATE_KEY }, create: { key: STATE_KEY, value }, update: { value } });
}

export type BeehiivReadiness = {
  env: { apiKey: boolean; publicationId: boolean };
  envOk: boolean;
  check: ConnectionCheck | null;
  checkOk: boolean;
  verification: SignupVerification | null;
  verifiedOk: boolean;
  /** A failed connection check, or a public signup that hit 401/403/404 after the last good check. */
  connectionProblem: boolean;
  ready: boolean;
};

/** "Ready to switch": env present + successful connection check + a verified test signup, both for the current configuration. */
export async function beehiivReadiness(): Promise<BeehiivReadiness> {
  const env = beehiivEnv();
  const envStatus = { apiKey: !!process.env.BEEHIIV_API_KEY?.trim(), publicationId: !!process.env.BEEHIIV_PUBLICATION_ID?.trim() };
  const st = await getConnectionState();
  const fp = env ? publicationFingerprint(env) : "";
  const check = st.check && st.check.pub === fp ? st.check : null;
  const verification = st.verification && st.verification.pub === fp ? st.verification : null;
  const checkOk = !!env && !!check?.ok;
  const verifiedOk = !!env && !!verification?.ok;
  const problemAfterCheck = !!st.signupProblem && (!check?.ok || new Date(st.signupProblem.at) > new Date(check.at));
  const connectionProblem = !!env && ((!!check && !check.ok) || problemAfterCheck);
  return { env: envStatus, envOk: !!env, check, checkOk, verification, verifiedOk, connectionProblem, ready: !!env && checkOk && verifiedOk && !connectionProblem };
}

// ───────── Core: one subscription request ─────────

type SubscribeResult = { ok: true; status: string | null; outcome: SignupOutcome } | { ok: false; kind: BeehiivCallError["kind"] | "not_configured"; httpStatus: number; message: string };

/** The single code path every signup uses (public form and admin test). Never throws. */
async function subscribeEmail(email: string, placement: SignupPlacement | "admin_test" | "register", referringSite: string, timeoutMs?: number): Promise<SubscribeResult> {
  const env = beehiivEnv();
  if (!env) return { ok: false, kind: "not_configured", httpStatus: 0, message: "BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set" };
  try {
    const sub = await createSubscription(env, { email, utmCampaign: placement, referringSite }, fetch, timeoutMs);
    const status = typeof sub.status === "string" ? sub.status.toLowerCase() : null;
    return { ok: true, status, outcome: outcomeForStatus(status) };
  } catch (e) {
    const err = e instanceof BeehiivCallError ? e : new BeehiivCallError("Unexpected error calling beehiiv", 0, "unexpected");
    return { ok: false, kind: err.kind, httpStatus: err.status, message: err.message };
  }
}

// ───────── Public signup ─────────

export type SignupState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string>; email?: string; outcome?: SignupOutcome } | null;

export type SignupRequest = { email: unknown; honeypot: unknown; placement: unknown; page: unknown; ip: string };

/** Validation, honeypot, rate limits, beehiiv call and message mapping for the public form. */
export async function handlePublicSignup(req: SignupRequest): Promise<SignupState> {
  const typed = String(req.email ?? "").trim().slice(0, 254);
  // Honeypot: real people never fill it. Answer like a normal signup, send nothing.
  if (String(req.honeypot ?? "").trim()) return { ok: true, outcome: "neutral", message: MSG.neutral };
  const email = normalizeSignupEmail(req.email);
  if (!email) return { error: MSG.invalidEmail, fieldErrors: { email: "Enter a valid email address" }, email: typed };
  const placement = cleanPlacement(req.placement);
  if (!rateLimit(`bh-signup-ip:${req.ip}`, SIGNUP_LIMITS.ip.limit, SIGNUP_LIMITS.ip.windowMs).ok) return { error: MSG.tooMany, email: typed };
  // Per-address limit answers neutrally, so it can't be used to learn anything about an address.
  if (!rateLimit(`bh-signup-email:${email}`, SIGNUP_LIMITS.email.limit, SIGNUP_LIMITS.email.windowMs).ok) return { ok: true, outcome: "neutral", message: MSG.neutral };

  const r = await subscribeEmail(email, placement, referringSiteFor(req.page, placement));
  if (!r.ok) {
    if (r.kind === "config" || r.kind === "not_configured") {
      console.error(`[beehiiv] newsletter signup refused — connection problem: ${r.message}. Check BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID (Admin → Newsletter → Settings → beehiiv connection).`);
      if (r.kind === "config") await patchConnectionState({ signupProblem: { at: new Date().toISOString(), httpStatus: r.httpStatus } }).catch(() => {});
    } else {
      console.warn(`[beehiiv] newsletter signup failed (${r.kind}): ${r.message} [placement=${placement}]`);
    }
    return { error: MSG.retry, email: typed };
  }
  // Aggregate only: which placement produced a signup. No email, no visitor id.
  await db.engagementEvent.create({ data: { type: "newsletter_signup", targetType: "NEWSLETTER", targetId: placement } }).catch(() => {});
  return { ok: true, outcome: r.outcome, message: messageForOutcome(r.outcome) };
}

/** Short timeout for the opt-in made while creating an account (registration never waits long on beehiiv). */
export const REGISTER_SIGNUP_TIMEOUT_MS = 4_000;

/**
 * The newsletter checkbox on /register/ (beehiiv mode), called only after the account exists.
 * Same validation, per-IP/per-address limits and beehiiv request as the public form, with
 * utm_campaign "register". Never throws and returns nothing the caller could show: any failure,
 * rate limit or inactive/invalid address is logged (no email) and ignored. No local subscriber row.
 */
export async function subscribeAfterRegistration(rawEmail: unknown, ip: string): Promise<void> {
  try {
    const email = normalizeSignupEmail(rawEmail);
    if (!email) return;
    if (!rateLimit(`bh-signup-ip:${ip}`, SIGNUP_LIMITS.ip.limit, SIGNUP_LIMITS.ip.windowMs).ok) return;
    if (!rateLimit(`bh-signup-email:${email}`, SIGNUP_LIMITS.email.limit, SIGNUP_LIMITS.email.windowMs).ok) return;
    const r = await subscribeEmail(email, "register", referringSiteFor("/register/", "account"), REGISTER_SIGNUP_TIMEOUT_MS);
    if (!r.ok) {
      console.warn(`[beehiiv] newsletter opt-in at registration failed (${r.kind}): ${r.message}`);
      if (r.kind === "config") await patchConnectionState({ signupProblem: { at: new Date().toISOString(), httpStatus: r.httpStatus } }).catch(() => {});
      return;
    }
    await db.engagementEvent.create({ data: { type: "newsletter_signup", targetType: "NEWSLETTER", targetId: "register" } }).catch(() => {});
  } catch (e) {
    console.warn("[beehiiv] newsletter opt-in at registration failed (unexpected)", (e as Error)?.name ?? "error");
  }
}

// ───────── Admin: connection check & test signup ─────────

/** GET /publications/{id}; stores ok/error, publication name and time. */
export async function checkBeehiivConnection(): Promise<ConnectionCheck> {
  const env = beehiivEnv();
  const at = new Date().toISOString();
  if (!env) return { ok: false, at, error: "BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID must both be set on the server.", pub: "" };
  let check: ConnectionCheck;
  try {
    const pub = await getPublication(env);
    check = { ok: true, at, publicationName: typeof pub.name === "string" ? pub.name.slice(0, 200) : null, pub: publicationFingerprint(env) };
  } catch (e) {
    check = { ok: false, at, error: e instanceof BeehiivCallError ? e.message : "Unexpected error calling beehiiv", pub: publicationFingerprint(env) };
  }
  await patchConnectionState({ check, ...(check.ok ? { signupProblem: undefined } : {}) });
  return check;
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "pending — confirmation email sent",
  validating: "validating — beehiiv is checking the address",
  active: "active — subscribed",
  inactive: "inactive — previously unsubscribed (not reactivated)",
  invalid: "invalid — beehiiv rejected the address",
  needs_attention: "needs attention — review it in beehiiv",
};
export const statusLabel = (s: string | null | undefined) => (s ? STATUS_LABELS[s] ?? s : "unknown");

/**
 * Submits `email` through the same path as the public form (utm_campaign
 * "admin_test"), then confirms it via GET …/subscriptions/by_email/{email}.
 * Stores only a masked address with the result.
 */
export async function sendTestSignup(rawEmail: unknown): Promise<SignupVerification & { message: string }> {
  const at = new Date().toISOString();
  const env = beehiivEnv();
  const email = normalizeSignupEmail(rawEmail);
  if (!email) return { ok: false, at, maskedEmail: "", pub: "", error: "Enter a valid email address.", message: "Enter a valid email address." };
  const maskedEmail = maskEmail(email);
  if (!env) return { ok: false, at, maskedEmail, pub: "", error: "beehiiv isn't configured on the server.", message: "BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID must both be set on the server." };
  const pub = publicationFingerprint(env);
  const fail = async (error: string) => {
    const v: SignupVerification = { ok: false, at, maskedEmail, pub, error };
    await patchConnectionState({ verification: v });
    return { ...v, message: error };
  };
  const r = await subscribeEmail(email, "admin_test", referringSiteFor("/admin/newsletter/settings/", "admin_test"));
  if (!r.ok) return fail(`The signup request failed: ${r.message}`);
  let found: { status?: string; email?: string };
  try {
    found = await getSubscriptionByEmail(env, email);
  } catch (e) {
    return fail(`Signup was sent, but looking it up failed: ${e instanceof BeehiivCallError ? e.message : "unexpected error"}`);
  }
  if (String(found.email ?? "").toLowerCase() !== email) return fail("beehiiv answered the lookup with a different address.");
  let publicationName: string | null = null;
  try {
    const p = await getPublication(env);
    publicationName = typeof p.name === "string" ? p.name.slice(0, 200) : null;
  } catch {
    /* the name is informational; the verification itself succeeded */
  }
  const status = typeof found.status === "string" ? found.status.toLowerCase() : null;
  const v: SignupVerification = { ok: true, at, status, publicationName, maskedEmail, pub };
  await patchConnectionState({ verification: v });
  return { ...v, message: `Verified in ${publicationName ? `“${publicationName}”` : "the publication"}: ${maskedEmail} is ${statusLabel(status)}.` };
}

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
 *
 * Single opt-in + welcome email, for every signup through this code path
 * (subscribe page, every native placement, registration checkbox, admin test):
 *   1. GET …/subscriptions/by_email/{email}
 *        active                 → "already" (no POST, no second welcome email)
 *        inactive / invalid / needs_attention → "neutral" (never reactivated)
 *        validating / pending   → "finishing" / "pending" (no POST)
 *        404                    → step 2
 *   2. POST …/subscriptions { send_welcome_email: true, double_opt_override: "off", reactivate_existing: false, utm_* }
 *        active → "subscribed"; validating → one re-check after ~1.5 s (active → "subscribed", else "finishing")
 *   One request per address at a time (in-flight map), so a double submit can't send two welcome emails.
 */

export const SIGNUP_LIMITS = {
  ip: { limit: 5, windowMs: 10 * 60_000 },
  email: { limit: 3, windowMs: 60 * 60_000 },
} as const;

/** Default page per placement (referring_site when the form's page path is missing or unusable). */
const PLACEMENT_PATH: Record<SignupPlacement | "admin_test", string> = {
  subscribe_page: "/subscribe/", homepage_hero: "/", homepage: "/", newsletter_page: "/newsletter/", newsletter_issue: "/newsletter/", footer: "/", article: "/articles/",
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

export type SignupOutcome = "subscribed" | "already" | "finishing" | "pending" | "neutral";

/** Status of a NEW subscription (POST answer) → what we tell the visitor. Unknown statuses are treated like "pending". */
export function outcomeForStatus(status: unknown): SignupOutcome {
  switch (String(status ?? "").toLowerCase()) {
    case "active": return "subscribed";
    case "validating": return "finishing";
    case "inactive": // previously unsubscribed: never reactivated, never revealed
    case "invalid":
    case "needs_attention": return "neutral";
    default: return "pending"; // pending, unknown
  }
}
/** Status of an EXISTING subscription (by_email lookup) → outcome. Active means already subscribed. */
export function outcomeForExisting(status: unknown): SignupOutcome {
  const s = String(status ?? "").toLowerCase();
  return s === "active" ? "already" : outcomeForStatus(s);
}
export const messageForOutcome = (o: SignupOutcome) => MSG[o];

// ───────── Connection state (Setting "beehiiv.connection") ─────────

const STATE_KEY = "beehiiv.connection";

export type ConnectionCheck = { ok: boolean; at: string; publicationName?: string | null; error?: string; pub: string };
export type SignupVerification = { ok: boolean; at: string; status?: string | null; publicationName?: string | null; maskedEmail: string; error?: string; pub: string; /** true: we created it (welcome email requested); false: it already existed (nothing sent). */ created?: boolean };
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

/** Delay before the one re-check of a "validating" new subscription. */
export const VALIDATING_RECHECK_MS = 1_500;

type SubscribeResult =
  | { ok: true; status: string | null; outcome: SignupOutcome; /** true when we POSTed a new subscription (welcome email requested). */ created: boolean }
  | { ok: false; kind: BeehiivCallError["kind"] | "not_configured"; httpStatus: number; message: string };

const asCallError = (e: unknown) => (e instanceof BeehiivCallError ? e : new BeehiivCallError("Unexpected error calling beehiiv", 0, "unexpected"));
const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : null);

/** Addresses with a request in progress → that request. A second submit for the same address shares the first one's answer. */
const inFlight = new Map<string, Promise<SubscribeResult>>();

async function runSubscribe(env: BeehiivEnv, email: string, placement: string, referringSite: string, timeoutMs?: number): Promise<SubscribeResult> {
  try {
    // 1. Lookup first: an existing subscription is never POSTed again (no second welcome email, no reactivation).
    let existing: { status?: string } | null = null;
    try {
      existing = await getSubscriptionByEmail(env, email, fetch, timeoutMs);
    } catch (e) {
      const err = asCallError(e);
      if (err.status !== 404) throw err; // 404 = no subscription for this address
    }
    if (existing) {
      const status = lower(existing.status);
      return { ok: true, status, outcome: outcomeForExisting(status), created: false };
    }
    // 2. New address: single opt-in + welcome email.
    const sub = await createSubscription(env, { email, utmCampaign: placement, referringSite }, fetch, timeoutMs);
    let status = lower(sub.status);
    if (status === "validating") {
      await new Promise((r) => setTimeout(r, VALIDATING_RECHECK_MS));
      try {
        status = lower((await getSubscriptionByEmail(env, email, fetch, timeoutMs)).status) ?? status;
      } catch {
        /* keep "validating": the subscription was created; we just can't confirm it yet */
      }
    }
    return { ok: true, status, outcome: outcomeForStatus(status), created: true };
  } catch (e) {
    const err = asCallError(e);
    return { ok: false, kind: err.kind, httpStatus: err.status, message: err.message };
  }
}

/** The single code path every signup uses (public form, registration and admin test). Never throws. */
async function subscribeEmail(email: string, placement: SignupPlacement | "admin_test" | "register" | "business_application", referringSite: string, timeoutMs?: number): Promise<SubscribeResult> {
  const env = beehiivEnv();
  if (!env) return { ok: false, kind: "not_configured", httpStatus: 0, message: "BEEHIIV_API_KEY / BEEHIIV_PUBLICATION_ID not set" };
  const running = inFlight.get(email);
  // Shares the first request's answer; only the first one counts as having created the subscription.
  if (running) return running.then((r) => (r.ok ? { ...r, created: false } : r));
  const p = runSubscribe(env, email, placement, referringSite, timeoutMs).finally(() => inFlight.delete(email));
  inFlight.set(email, p);
  return p;
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
  // Aggregate only: which placement produced a new signup. No email, no visitor id.
  if (r.created) await db.engagementEvent.create({ data: { type: "newsletter_signup", targetType: "NEWSLETTER", targetId: placement } }).catch(() => {});
  return { ok: true, outcome: r.outcome, message: messageForOutcome(r.outcome) };
}

/** Short timeout for each beehiiv call made while creating an account (registration never waits long on beehiiv). */
export const REGISTER_SIGNUP_TIMEOUT_MS = 4_000;

/** What happened to the newsletter checkbox at registration ("failed": nothing went through — the account still exists). */
export type RegisterNewsletterOutcome = SignupOutcome | "failed";

/**
 * The newsletter checkbox on /register/ and on the business application (beehiiv mode), called only after
 * the account / application exists (`placement` "register" | "business_application" → utm_campaign).
 * Same validation, per-IP/per-address limits and beehiiv flow (lookup → single opt-in + welcome email)
 * as the public form, with utm_campaign "register". Never throws: failures, rate limits and timeouts
 * are logged (no email) and returned as "failed" so the welcome screen can offer a retry. No local subscriber row.
 */
export async function subscribeAfterRegistration(rawEmail: unknown, ip: string, opts: { placement?: "register" | "business_application" } = {}): Promise<RegisterNewsletterOutcome> {
  const placement = opts.placement ?? "register";
  try {
    const email = normalizeSignupEmail(rawEmail);
    if (!email) return "failed";
    if (!rateLimit(`bh-signup-ip:${ip}`, SIGNUP_LIMITS.ip.limit, SIGNUP_LIMITS.ip.windowMs).ok) return "failed";
    if (!rateLimit(`bh-signup-email:${email}`, SIGNUP_LIMITS.email.limit, SIGNUP_LIMITS.email.windowMs).ok) return "failed";
    const r = await subscribeEmail(email, placement, referringSiteFor(placement === "register" ? "/register/" : "/list-your-business/", "account"), REGISTER_SIGNUP_TIMEOUT_MS);
    if (!r.ok) {
      console.warn(`[beehiiv] newsletter opt-in (${placement}) failed (${r.kind}): ${r.message}`);
      if (r.kind === "config") await patchConnectionState({ signupProblem: { at: new Date().toISOString(), httpStatus: r.httpStatus } }).catch(() => {});
      return "failed";
    }
    if (r.created) await db.engagementEvent.create({ data: { type: "newsletter_signup", targetType: "NEWSLETTER", targetId: placement } }).catch(() => {});
    return r.outcome;
  } catch (e) {
    console.warn("[beehiiv] newsletter opt-in at registration failed (unexpected)", (e as Error)?.name ?? "error");
    return "failed";
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
  pending: "pending — beehiiv is waiting for a confirmation (double opt-in still on for this address?)",
  validating: "validating — beehiiv is checking the address",
  active: "active — subscribed",
  inactive: "inactive — previously unsubscribed (not reactivated)",
  invalid: "invalid — beehiiv rejected the address",
  needs_attention: "needs attention — review it in beehiiv",
};
export const statusLabel = (s: string | null | undefined) => (s ? STATUS_LABELS[s] ?? s : "unknown");

/**
 * Submits `email` through the same path as the public form (lookup first, then single opt-in +
 * welcome email, utm_campaign "admin_test"), then confirms it via GET …/subscriptions/by_email/{email}.
 * Reports whether it was a new subscriber (welcome email requested) or already active (nothing sent).
 * Stores only a masked address with the result.
 */
export async function sendTestSignup(rawEmail: unknown): Promise<SignupVerification & { message: string; created?: boolean }> {
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
  const v: SignupVerification = { ok: true, at, status, publicationName, maskedEmail, pub, created: r.created };
  await patchConnectionState({ verification: v });
  return { ...v, message: `Verified in ${publicationName ? `“${publicationName}”` : "the publication"}: ${maskedEmail} is ${statusLabel(status)} (${testSignupKind(r.created, r.status)}).` };
}

/** "new subscriber — welcome email requested" vs "already active — no welcome email sent". */
export function testSignupKind(created: boolean | undefined, status?: string | null) {
  if (created) return "new subscriber — welcome email requested";
  return status === "active" ? "already active — no welcome email sent" : "existing subscription — not changed, no welcome email sent";
}

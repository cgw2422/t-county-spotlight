import "server-only";

/**
 * beehiiv v2 API (server-side only). Docs: https://developers.beehiiv.com/
 *   GET /publications/{publicationId}/posts
 *     ?status=confirmed&content_tags[]=<tag>&expand[]=free_web_content&expand[]=free_email_content&limit=100&page=N
 *   Authorization: Bearer <BEEHIIV_API_KEY>
 * The key is read from the environment on each call and is never logged,
 * returned, or included in error messages.
 */
export const BEEHIIV_DEFAULT_API_BASE = "https://api.beehiiv.com/v2";
export const BEEHIIV_PAGE_LIMIT = 100;
const MAX_PAGES = 50; // 5,000 posts per tag per run — far beyond a local newsletter's archive

export type BeehiivEnv = { apiKey: string; publicationId: string; apiBase: string };

/** Present/missing only — never the values. */
export function beehiivEnvStatus() {
  return {
    apiKey: !!process.env.BEEHIIV_API_KEY?.trim(),
    publicationId: !!process.env.BEEHIIV_PUBLICATION_ID?.trim(),
    customApiBase: !!process.env.BEEHIIV_API_BASE?.trim(),
  };
}

export function beehiivEnv(): BeehiivEnv | null {
  const apiKey = process.env.BEEHIIV_API_KEY?.trim();
  const publicationId = process.env.BEEHIIV_PUBLICATION_ID?.trim();
  if (!apiKey || !publicationId) return null;
  const apiBase = (process.env.BEEHIIV_API_BASE?.trim() || BEEHIIV_DEFAULT_API_BASE).replace(/\/+$/, "");
  return { apiKey, publicationId, apiBase };
}

export type BeehiivPost = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  slug?: string | null;
  status?: string | null; // draft | confirmed | archived
  publish_date?: number | null; // unix seconds
  displayed_date?: number | null;
  created?: number | null;
  thumbnail_url?: string | null;
  web_url?: string | null;
  platform?: string | null; // web | email | both
  audience?: string | null;
  content_tags?: string[] | null;
  authors?: string[] | null;
  preview_text?: string | null;
  meta_default_title?: string | null;
  meta_default_description?: string | null;
  hidden_from_feed?: boolean | null;
  content?: { free?: { web?: string | null; email?: string | null; rss?: string | null } | null } | null;
};

type ListResponse = { data?: BeehiivPost[]; page?: number; total_pages?: number; total_results?: number; limit?: number };

export class BeehiivError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** All confirmed posts carrying `tag` (every page). Throws BeehiivError on any HTTP/network failure. */
export async function listConfirmedPostsByTag(env: BeehiivEnv, tag: string, fetchImpl: typeof fetch = fetch): Promise<BeehiivPost[]> {
  const out: BeehiivPost[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = new URLSearchParams();
    q.set("status", "confirmed");
    q.append("content_tags[]", tag);
    q.append("expand[]", "free_web_content");
    q.append("expand[]", "free_email_content");
    q.set("limit", String(BEEHIIV_PAGE_LIMIT));
    q.set("page", String(page));
    q.set("order_by", "publish_date");
    q.set("direction", "desc");
    const url = `${env.apiBase}/publications/${encodeURIComponent(env.publicationId)}/posts?${q.toString()}`;
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.apiKey}`, Accept: "application/json", "User-Agent": "TCountyConnect-Sync/1.0" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      throw new BeehiivError(`Network error contacting beehiiv (${(e as Error).name})`, 0);
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403 ? " — check BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID" : res.status === 404 ? " — publication not found (check BEEHIIV_PUBLICATION_ID)" : res.status === 429 ? " — rate limited, try again later" : "";
      throw new BeehiivError(`beehiiv API returned HTTP ${res.status}${hint}`, res.status);
    }
    const json = (await res.json().catch(() => null)) as ListResponse | null;
    if (!json || !Array.isArray(json.data)) throw new BeehiivError("beehiiv API returned an unexpected response", res.status);
    out.push(...json.data.filter((p) => p && typeof p.id === "string" && p.id));
    const totalPages = typeof json.total_pages === "number" ? json.total_pages : json.data.length < BEEHIIV_PAGE_LIMIT ? page : page + 1;
    if (page >= totalPages || json.data.length === 0) break;
  }
  return out;
}

// ───────── Subscriptions & publication (native signup form) ─────────
//   POST /publications/{publicationId}/subscriptions                    create a subscription
//   GET  /publications/{publicationId}                                  publication name (admin connection check)
//   GET  /publications/{publicationId}/subscriptions/by_email/{email}   verify a test signup landed (email URL-encoded)

/** Signup requests must answer quickly: the visitor is waiting on the form. */
export const BEEHIIV_SIGNUP_TIMEOUT_MS = 8_000;

/** How a failed call failed. `config` (401/403/404) means the key or publication id is wrong. */
export type BeehiivFailure = "network" | "timeout" | "rate_limited" | "server" | "config" | "bad_request" | "unexpected";

export class BeehiivCallError extends BeehiivError {
  constructor(message: string, status: number, public kind: BeehiivFailure) {
    super(message, status);
  }
}

/** Subscription statuses beehiiv documents (anything else is treated like "pending"). */
export type BeehiivSubscriptionStatus = "validating" | "invalid" | "pending" | "active" | "inactive" | "needs_attention";

export type BeehiivSubscription = { id?: string; email?: string; status?: string; created?: number | null };
export type BeehiivPublication = { id?: string; name?: string | null; organization_name?: string | null; created?: number | null };

function failureKind(status: number): BeehiivFailure {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  if (status === 401 || status === 403 || status === 404) return "config";
  if (status >= 400) return "bad_request";
  return "unexpected";
}

/** beehiiv's error body is `{ errors: [{ message, code }] }`. Only a short, email-free hint is kept. */
async function errorHint(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { errors?: { message?: unknown; code?: unknown }[]; message?: unknown };
    const first = Array.isArray(j?.errors) ? j.errors[0] : undefined;
    const msg = String(first?.message ?? j?.message ?? "").replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]").replace(/\s+/g, " ").slice(0, 160);
    const code = first?.code ? String(first.code).slice(0, 40) : "";
    return [code, msg].filter(Boolean).join(": ");
  } catch {
    return "";
  }
}

/**
 * One JSON call to beehiiv. Throws BeehiivCallError (never containing the key)
 * with a `kind` the caller maps to a user-facing message.
 */
async function beehiivJson<T>(env: BeehiivEnv, method: "GET" | "POST", path: string, body: unknown, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetchImpl(`${env.apiBase}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.apiKey}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}), "User-Agent": "TCountyConnect/1.0" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = (e as Error)?.name;
    const timeout = name === "TimeoutError" || name === "AbortError";
    throw new BeehiivCallError(timeout ? `beehiiv did not answer within ${Math.round(timeoutMs / 1000)}s` : `Network error contacting beehiiv (${name || "error"})`, 0, timeout ? "timeout" : "network");
  }
  if (!res.ok) {
    const kind = failureKind(res.status);
    const hint = await errorHint(res);
    const why = kind === "config" ? (res.status === 404 ? " — publication not found (check BEEHIIV_PUBLICATION_ID)" : " — check BEEHIIV_API_KEY and its access to BEEHIIV_PUBLICATION_ID") : kind === "rate_limited" ? " — rate limited" : "";
    throw new BeehiivCallError(`beehiiv API returned HTTP ${res.status}${why}${hint ? ` (${hint})` : ""}`, res.status, kind);
  }
  const json = (await res.json().catch(() => null)) as { data?: T } | null;
  if (!json || typeof json !== "object" || !json.data || typeof json.data !== "object") throw new BeehiivCallError("beehiiv API returned an unexpected response", res.status, "unexpected");
  return { status: res.status, data: json.data };
}

const pubPath = (env: BeehiivEnv) => `/publications/${encodeURIComponent(env.publicationId)}`;

export type CreateSubscriptionInput = {
  email: string;
  /** Where on the site the form was, e.g. "homepage_hero". */
  utmCampaign: string;
  /** Absolute URL of the page the visitor signed up on. */
  referringSite: string;
};

/**
 * Request body sent to beehiiv: single opt-in with beehiiv's welcome email.
 * `double_opt_override: "off"` skips the confirmation step for site signups;
 * `send_welcome_email: true` asks beehiiv to send the publication's welcome
 * email; existing (unsubscribed) addresses are never reactivated from the site.
 * Only ever sent after a by_email lookup found no subscription (see signup.ts).
 */
export function subscriptionBody(input: CreateSubscriptionInput) {
  return {
    email: input.email,
    reactivate_existing: false,
    send_welcome_email: true,
    double_opt_override: "off",
    utm_source: "tcountyconnect.com",
    utm_medium: "website",
    utm_campaign: input.utmCampaign,
    referring_site: input.referringSite,
  };
}

/** POST /publications/{id}/subscriptions. */
export async function createSubscription(env: BeehiivEnv, input: CreateSubscriptionInput, fetchImpl: typeof fetch = fetch, timeoutMs = BEEHIIV_SIGNUP_TIMEOUT_MS) {
  return (await beehiivJson<BeehiivSubscription>(env, "POST", `${pubPath(env)}/subscriptions`, subscriptionBody(input), fetchImpl, timeoutMs)).data;
}

/** GET /publications/{id} — used to show the publication's name in admin. */
export async function getPublication(env: BeehiivEnv, fetchImpl: typeof fetch = fetch, timeoutMs = BEEHIIV_SIGNUP_TIMEOUT_MS) {
  return (await beehiivJson<BeehiivPublication>(env, "GET", pubPath(env), undefined, fetchImpl, timeoutMs)).data;
}

/** GET /publications/{id}/subscriptions/by_email/{email}. A missing subscription is HTTP 404 (BeehiivCallError status 404). */
export async function getSubscriptionByEmail(env: BeehiivEnv, email: string, fetchImpl: typeof fetch = fetch, timeoutMs = BEEHIIV_SIGNUP_TIMEOUT_MS) {
  return (await beehiivJson<BeehiivSubscription>(env, "GET", `${pubPath(env)}/subscriptions/by_email/${encodeURIComponent(email)}`, undefined, fetchImpl, timeoutMs)).data;
}

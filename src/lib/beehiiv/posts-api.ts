import "server-only";
import type { BeehiivEnv } from "./client";

/**
 * beehiiv v2 posts API — DRAFTS ONLY (server-side only).
 *
 *   POST /publications/{publicationId}/posts                 create a post (Pro/Enterprise; OAuth scope posts:write)
 *   GET  /publications/{publicationId}/posts/{postId}         200 ready · 202 still being created · 404 POST_CREATION_FAILED
 *   GET  /publications/{publicationId}/posts?status=draft     recent drafts (recovering an ambiguous create)
 *
 * Safety rules enforced here (and unit-tested in scripts/test-newsletter-events.ts):
 *  - every create body comes from `buildDraftPostBody()` and passes `assertDraftOnly()`,
 *    which also runs again inside `createDraftPost()` right before the request is sent;
 *  - `status` is always the literal "draft"; `scheduled_at` / `override_scheduled_at` are never sent;
 *  - nothing in this module publishes, schedules or sends a post.
 * The API key is read from `env` per call and is never logged, returned or put in an error message.
 */

export const DRAFT_STATUS = "draft" as const;
export const BEEHIIV_CREATE_TIMEOUT_MS = 20_000;
export const BEEHIIV_READ_TIMEOUT_MS = 10_000;
/** The beehiiv app's post list (fallback link — the per-post editor URL format is not documented). */
export const BEEHIIV_APP_POSTS_URL = "https://app.beehiiv.com/posts";
/** Documented example id: "post_template_00000000-0000-0000-0000-000000000000". */
export const POST_TEMPLATE_ID_RE = /^post_template_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_ID_RE = /^post_[0-9A-Za-z-]{1,80}$/;

// ── Request body ──

type Formatted = { text: string; styling?: ("bold" | "italic" | "underline" | "strikethrough")[]; text_color?: string };
export type DraftBlock =
  | { type: "heading"; level: "1" | "2" | "3" | "4" | "5" | "6"; text: string; anchorHeader?: boolean; anchorIncludeInToc?: boolean; textAlignment?: "left" | "center" | "right" }
  | { type: "paragraph"; plaintext?: string; formattedText?: Formatted[]; textAlignment?: "left" | "center" | "right" }
  | { type: "html"; html: string }
  | { type: "button"; href: string; text: string; alignment?: "left" | "center" | "right"; size?: "small" | "normal" | "large"; target?: string };

export type DraftPostBody = {
  title: string;
  subtitle?: string;
  blocks: DraftBlock[];
  status: typeof DRAFT_STATUS;
  content_tags?: string[];
  post_template_id?: string;
};

export type DraftPostInput = {
  title: string;
  subtitle?: string | null;
  blocks: DraftBlock[];
  contentTags?: string[];
  templateId?: string | null;
};

/** Keys a create body may contain. Anything else (scheduled_at, recipients, …) is refused. */
const ALLOWED_KEYS = new Set(["title", "subtitle", "blocks", "status", "content_tags", "post_template_id"]);

/** Throws unless `body` is a draft-only create body. Called by the builder and again before sending. */
export function assertDraftOnly(body: unknown): asserts body is DraftPostBody {
  if (!body || typeof body !== "object") throw new Error("Draft body must be an object");
  const b = body as Record<string, unknown>;
  if (b.status !== DRAFT_STATUS) throw new Error(`Refusing to send a beehiiv post with status ${JSON.stringify(b.status)} — only "draft" is allowed`);
  for (const k of Object.keys(b)) if (!ALLOWED_KEYS.has(k)) throw new Error(`Refusing to send a beehiiv post with field "${k}"`);
  if ("scheduled_at" in b || "override_scheduled_at" in b) throw new Error("Refusing to schedule a beehiiv post");
  if (typeof b.title !== "string" || !b.title.trim()) throw new Error("Draft title is required");
  if (!Array.isArray(b.blocks) || b.blocks.length === 0) throw new Error("Draft must have content blocks");
  if ("body_content" in b) throw new Error("Send blocks or body_content, not both");
}

/** The ONE place a beehiiv create-post body is built. Always `status: "draft"`; never `scheduled_at`. */
export function buildDraftPostBody(input: DraftPostInput): DraftPostBody {
  const title = input.title.replace(/\s+/g, " ").trim().slice(0, 250);
  const subtitle = (input.subtitle ?? "").replace(/\s+/g, " ").trim().slice(0, 250);
  const tags = [...new Set((input.contentTags ?? []).map((t) => t.trim()).filter(Boolean))];
  const templateId = input.templateId?.trim() || "";
  if (templateId && !POST_TEMPLATE_ID_RE.test(templateId)) throw new Error("Invalid beehiiv template id");
  const body: DraftPostBody = {
    title,
    ...(subtitle ? { subtitle } : {}),
    blocks: input.blocks,
    status: DRAFT_STATUS,
    ...(tags.length ? { content_tags: tags } : {}),
    ...(templateId ? { post_template_id: templateId } : {}),
  };
  assertDraftOnly(body);
  return body;
}

// ── Links ──

/**
 * Best-guess editor URL in the beehiiv app (https://app.beehiiv.com/posts/<uuid>/edit).
 * NOT documented by beehiiv — always show BEEHIIV_APP_POSTS_URL (or the API's preview_url) next to it.
 */
export function beehiivEditUrl(postId: string) {
  return `${BEEHIIV_APP_POSTS_URL}/${encodeURIComponent(postId.replace(/^post_/, ""))}/edit`;
}

export function isPostId(s: unknown): s is string {
  return typeof s === "string" && POST_ID_RE.test(s);
}

/** Only https://app.beehiiv.com/… URLs from the API are shown as links. */
export function safeAppUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname === "app.beehiiv.com" ? url.toString() : null;
  } catch {
    return null;
  }
}

// ── HTTP ──

export type CreateOutcome =
  | { kind: "created"; postId: string; previewUrl: string | null; httpStatus: number }
  /** beehiiv answered with an error: the post was not created. Safe to fix and try again. */
  | { kind: "rejected"; httpStatus: number; code: string; message: string }
  /** The request may have reached beehiiv but we don't know whether a draft exists (timeout, dropped connection, 5xx). */
  | { kind: "ambiguous"; httpStatus: number; message: string }
  /** The request never left this server (connection refused / DNS). Safe to try again. */
  | { kind: "not_sent"; message: string };

const NOT_SENT_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ERR_INVALID_URL", "UND_ERR_INVALID_ARG"]);

function errorCode(e: unknown): string {
  const err = e as { code?: unknown; cause?: { code?: unknown; errors?: { code?: unknown }[] } } | null;
  const c = err?.cause?.code ?? err?.code ?? err?.cause?.errors?.[0]?.code;
  return typeof c === "string" ? c : "";
}

/** `{ errors: [{ message, code }] }` → short hint without emails or secrets. */
async function readError(res: Response): Promise<{ code: string; message: string }> {
  try {
    const j = (await res.json()) as { errors?: { message?: unknown; code?: unknown }[]; message?: unknown };
    const first = Array.isArray(j?.errors) ? j.errors[0] : undefined;
    const message = String(first?.message ?? j?.message ?? "").replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[email]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/\s+/g, " ").slice(0, 200);
    const code = first?.code ? String(first.code).replace(/[^\w.-]/g, "").slice(0, 60) : "";
    return { code, message };
  } catch {
    return { code: "", message: "" };
  }
}

const headers = (env: BeehiivEnv, json: boolean) => ({
  Authorization: `Bearer ${env.apiKey}`,
  Accept: "application/json",
  ...(json ? { "Content-Type": "application/json" } : {}),
  "User-Agent": "TCountyConnect-NewsletterEvents/1.0",
});
const postsPath = (env: BeehiivEnv) => `${env.apiBase}/publications/${encodeURIComponent(env.publicationId)}/posts`;

/** What a 401/403/404/429/4xx from beehiiv means for this tool, in plain words. */
export function explainHttpError(status: number, code = "", message = ""): string {
  const detail = [code, message].filter(Boolean).join(": ");
  const suffix = detail ? ` beehiiv said: ${detail}` : "";
  if (status === 401 || status === 403)
    return `beehiiv refused the request (HTTP ${status}). The API key in BEEHIIV_API_KEY may not have permission to create posts (posts:write), or the publication's plan may not include post creation through the API (Pro or Enterprise).${suffix}`;
  if (status === 404) return `beehiiv could not find the publication (HTTP 404). Check BEEHIIV_PUBLICATION_ID.${suffix}`;
  if (status === 429) return `beehiiv is rate limiting requests (HTTP 429). Wait a minute and try again.${suffix}`;
  if (status === 400 || status === 422) return `beehiiv rejected the draft (HTTP ${status}). Nothing was created.${suffix}`;
  return `beehiiv returned HTTP ${status}.${suffix}`;
}

/**
 * POST a draft. Never retries — a retry after an ambiguous failure could create a
 * duplicate draft (beehiiv documents no idempotency key).
 */
export async function createDraftPost(env: BeehiivEnv, body: DraftPostBody, fetchImpl: typeof fetch = fetch, timeoutMs = BEEHIIV_CREATE_TIMEOUT_MS): Promise<CreateOutcome> {
  assertDraftOnly(body);
  let res: Response;
  try {
    res = await fetchImpl(postsPath(env), { method: "POST", headers: headers(env, true), body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") return { kind: "ambiguous", httpStatus: 0, message: `beehiiv did not answer within ${Math.round(timeoutMs / 1000)} seconds.` };
    const code = errorCode(e);
    if (NOT_SENT_CODES.has(code)) return { kind: "not_sent", message: `Could not connect to beehiiv (${code}). Nothing was sent.` };
    return { kind: "ambiguous", httpStatus: 0, message: `The connection to beehiiv failed while the request was being sent (${code || name || "network error"}).` };
  }
  if (res.status >= 500) return { kind: "ambiguous", httpStatus: res.status, message: `beehiiv returned HTTP ${res.status} (server error).` };
  if (!res.ok) {
    const { code, message } = await readError(res);
    return { kind: "rejected", httpStatus: res.status, code, message: explainHttpError(res.status, code, message) };
  }
  const json = (await res.json().catch(() => null)) as { data?: { id?: unknown; preview_url?: unknown } } | null;
  const id = json?.data?.id;
  if (!isPostId(id)) return { kind: "ambiguous", httpStatus: res.status, message: `beehiiv answered HTTP ${res.status} without a post id.` };
  return { kind: "created", postId: id, previewUrl: safeAppUrl(json?.data?.preview_url), httpStatus: res.status };
}

export type PostState =
  | { state: "ready"; status: string | null; title: string | null }
  | { state: "creating" }
  | { state: "failed"; message: string }
  | { state: "error"; message: string };

/** GET one post: 200 ready · 202 still being created · 404 POST_CREATION_FAILED. */
export async function getPostState(env: BeehiivEnv, postId: string, fetchImpl: typeof fetch = fetch, timeoutMs = BEEHIIV_READ_TIMEOUT_MS): Promise<PostState> {
  if (!isPostId(postId)) return { state: "error", message: "Invalid post id" };
  let res: Response;
  try {
    res = await fetchImpl(`${postsPath(env)}/${encodeURIComponent(postId)}`, { headers: headers(env, false), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { state: "error", message: `Could not reach beehiiv (${(e as Error)?.name || "error"}).` };
  }
  if (res.status === 202) return { state: "creating" };
  if (res.status === 404) {
    const { code, message } = await readError(res);
    if (code === "POST_CREATION_FAILED") return { state: "failed", message: message || "beehiiv could not finish creating this post." };
    return { state: "error", message: explainHttpError(404, code, message) };
  }
  if (!res.ok) {
    const { code, message } = await readError(res);
    return { state: "error", message: explainHttpError(res.status, code, message) };
  }
  const json = (await res.json().catch(() => null)) as { data?: { status?: unknown; title?: unknown } } | null;
  return { state: "ready", status: typeof json?.data?.status === "string" ? json.data.status : null, title: typeof json?.data?.title === "string" ? json.data.title : null };
}

export type DraftSummary = { id: string; title: string; created: number | null; status: string | null };

/** GET the most recent drafts (limit 10) — used to find a draft after an ambiguous create. */
export async function listRecentDrafts(env: BeehiivEnv, fetchImpl: typeof fetch = fetch, timeoutMs = BEEHIIV_READ_TIMEOUT_MS): Promise<{ ok: true; drafts: DraftSummary[] } | { ok: false; message: string }> {
  const q = new URLSearchParams({ status: "draft", limit: "10", order_by: "created", direction: "desc" });
  let res: Response;
  try {
    res = await fetchImpl(`${postsPath(env)}?${q.toString()}`, { headers: headers(env, false), cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, message: `Could not reach beehiiv (${(e as Error)?.name || "error"}).` };
  }
  if (!res.ok) {
    const { code, message } = await readError(res);
    return { ok: false, message: explainHttpError(res.status, code, message) };
  }
  const json = (await res.json().catch(() => null)) as { data?: { id?: unknown; title?: unknown; created?: unknown; status?: unknown }[] } | null;
  if (!json || !Array.isArray(json.data)) return { ok: false, message: "beehiiv returned an unexpected response." };
  const drafts = json.data
    .filter((p) => isPostId(p?.id))
    .map((p) => ({ id: p.id as string, title: typeof p.title === "string" ? p.title : "", created: typeof p.created === "number" ? p.created : null, status: typeof p.status === "string" ? p.status : null }))
    // Defensive: only drafts, whatever the API returns.
    .filter((p) => !p.status || p.status === "draft");
  return { ok: true, drafts };
}

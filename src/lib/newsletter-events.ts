import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import { expandOccurrences, upcomingEventWhere, type Recurrence } from "./events";
import { addDaysKey, endOfNyDay, isDateKey, nyDateKey, startOfNyDay } from "@/components/public/dates";
import { beehiivEnv, type BeehiivEnv } from "./beehiiv/client";
import { ARCHIVE_TAG } from "./beehiiv/sync";
import {
  BEEHIIV_CREATE_TIMEOUT_MS, POST_TEMPLATE_ID_RE, beehiivEditUrl, buildDraftPostBody, createDraftPost, getPostState, isPostId, listRecentDrafts,
  type CreateOutcome, type DraftPostBody, type DraftSummary,
} from "./beehiiv/posts-api";
import { buildSectionBlocks, type NewsletterOccurrence } from "./newsletter-events-html";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Admin "Newsletter Events" tool: picks upcoming public events for a date range and
 * creates a beehiiv DRAFT with a "Things to Do" section. Never publishes or schedules.
 * State lives in the Setting table (no schema changes):
 *   newsletterEvents.templateId         optional beehiiv post_template_id
 *   newsletterEvents.request.<token>    one row per create attempt (duplicate guard + history)
 */

export const TEMPLATE_KEY = "newsletterEvents.templateId";
export const REQUEST_PREFIX = "newsletterEvents.request.";
export const DEFAULT_DAYS = 7;
export const MAX_RANGE_DAYS = 62;
export const FALLBACK_BASE_URL = "https://tcountyconnect.com";
const TOKEN_RE = /^[A-Za-z0-9_-]{22,64}$/;

// ───────── Environment ─────────

/** Railway variable NAMES that are missing (never values). */
export function missingBeehiivVars(): string[] {
  const out: string[] = [];
  if (!process.env.BEEHIIV_API_KEY?.trim()) out.push("BEEHIIV_API_KEY");
  if (!process.env.BEEHIIV_PUBLICATION_ID?.trim()) out.push("BEEHIIV_PUBLICATION_ID");
  return out;
}

/** Base for absolute links in the email: APP_URL, else the production domain (flagged so the UI can warn). */
export function newsletterBaseUrl(): { base: string; fromEnv: boolean } {
  const raw = process.env.APP_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") return { base: `${u.origin}${u.pathname.replace(/\/+$/, "")}`, fromEnv: true };
    } catch {}
  }
  return { base: FALLBACK_BASE_URL, fromEnv: false };
}

// ───────── Date range (America/New_York) ─────────

export type Range = { fromKey: string; toKey: string; start: Date; end: Date };

/** Default: today 00:00 → today + 7 days 00:00 (NY), i.e. the inclusive dates today … today + 6. */
export function defaultRange(now = new Date()): Range {
  const fromKey = nyDateKey(now);
  return rangeFromKeys(fromKey, addDaysKey(fromKey, DEFAULT_DAYS - 1));
}

function rangeFromKeys(fromKey: string, toKey: string): Range {
  return { fromKey, toKey, start: startOfNyDay(fromKey), end: endOfNyDay(toKey) };
}

/** Parses ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive); falls back to the default window. */
export function parseRange(from: string | null | undefined, to: string | null | undefined, now = new Date()): Range & { error?: string } {
  const def = defaultRange(now);
  const f = from && isDateKey(from) ? from : def.fromKey;
  let t = to && isDateKey(to) ? to : from && isDateKey(from) ? addDaysKey(f, DEFAULT_DAYS - 1) : def.toKey;
  let error: string | undefined;
  if (t < f) { t = f; error = "The end date was before the start date, so the range was set to one day."; }
  const maxTo = addDaysKey(f, MAX_RANGE_DAYS - 1);
  if (t > maxTo) { t = maxTo; error = `The range is limited to ${MAX_RANGE_DAYS} days.`; }
  return { ...rangeFromKeys(f, t), ...(error ? { error } : {}) };
}

// ───────── Event selection (same visibility as the public Events page) ─────────

const select = {
  id: true, slug: true, title: true, description: true, locationName: true, city: true, isFree: true, price: true,
  allDay: true, startAt: true, endAt: true, recurrence: true,
} satisfies Prisma.EventSelect;

export const occurrenceKey = (id: string, start: Date) => `${id}~${start.getTime().toString(36)}`;

/**
 * Every occurrence in the range: published, not deleted (upcomingEventWhere — the rule the
 * public /events/ page uses), recurring events expanded per occurrence, nothing that has
 * already ended (the window never starts before `now`), sorted by start time.
 */
export async function loadRangeOccurrences(range: Range, now = new Date()): Promise<NewsletterOccurrence[]> {
  const start = range.start < now ? now : range.start;
  if (range.end < start) return [];
  const events = await db.event.findMany({
    where: { AND: [upcomingEventWhere(start), { startAt: { lte: range.end } }] },
    select,
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  return expandOccurrences(events, start, range.end, 120)
    .map((o) => ({
      key: occurrenceKey(o.id, o.occurrenceStart),
      id: o.id, slug: o.slug, title: o.title, description: o.description, locationName: o.locationName, city: o.city,
      isFree: o.isFree, price: o.price, allDay: o.allDay, recurring: !!(o.recurrence as Recurrence | null)?.freq,
      occurrenceStart: o.occurrenceStart, occurrenceEnd: o.occurrenceEnd,
    }))
    .sort((a, b) => a.occurrenceStart.getTime() - b.occurrenceStart.getTime() || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export type Selection = { excluded: string[]; featured: string | null };

/** Selected occurrences (default: all) and the featured one, which is left out of the regular list. */
export function applySelection(all: NewsletterOccurrence[], sel: Selection) {
  const ex = new Set(sel.excluded);
  const featured = sel.featured ? all.find((o) => o.key === sel.featured) ?? null : null;
  const items = all.filter((o) => !ex.has(o.key) && o.key !== featured?.key);
  return { featured, items };
}

// ───────── Settings ─────────

export async function getTemplateId(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: TEMPLATE_KEY } }).catch(() => null);
  return typeof row?.value === "string" && POST_TEMPLATE_ID_RE.test(row.value) ? row.value : null;
}

export async function saveTemplateId(value: string, userId: string | null): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const v = value.trim();
  if (v && !POST_TEMPLATE_ID_RE.test(v)) return { ok: false, error: "That doesn't look like a beehiiv template ID. It should look like post_template_00000000-0000-0000-0000-000000000000." };
  if (!v) await db.setting.deleteMany({ where: { key: TEMPLATE_KEY } });
  else await db.setting.upsert({ where: { key: TEMPLATE_KEY }, create: { key: TEMPLATE_KEY, value: v }, update: { value: v } });
  await audit(userId, "newsletter.events_template", "Setting", TEMPLATE_KEY, { templateId: v || null });
  return { ok: true, value: v || null };
}

// ───────── Draft request records (duplicate guard) ─────────

export type RequestStatus = "pending" | "created" | "failed" | "unknown" | "abandoned";
export type RequestRecord = {
  token: string;
  status: RequestStatus;
  title: string;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  featured: boolean;
  archiveTag: boolean;
  templateId: string | null;
  postId?: string | null;
  previewUrl?: string | null;
  postState?: "ready" | "creating" | "failed" | null;
  httpStatus?: number | null;
  message?: string | null;
  recovered?: boolean;
};

export const newRequestToken = () => randomBytes(18).toString("base64url");
export const isRequestToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);
const requestKey = (token: string) => `${REQUEST_PREFIX}${token}`;

export async function getRequest(token: string): Promise<RequestRecord | null> {
  if (!isRequestToken(token)) return null;
  const row = await db.setting.findUnique({ where: { key: requestKey(token) } });
  return row?.value && typeof row.value === "object" ? (row.value as unknown as RequestRecord) : null;
}

async function writeRequest(rec: RequestRecord) {
  const value = { ...rec, updatedAt: new Date().toISOString() } as unknown as Prisma.InputJsonValue;
  await db.setting.update({ where: { key: requestKey(rec.token) }, data: { value } });
  return value as unknown as RequestRecord;
}

/** Atomic lock: INSERT … ON CONFLICT DO NOTHING. true = this call owns the token. */
async function claimToken(rec: RequestRecord): Promise<boolean> {
  const n = await db.$executeRaw`INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (${requestKey(rec.token)}, ${JSON.stringify(rec)}::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
  return n > 0;
}

/** Drafts created by this tool, newest first (also unknown-outcome attempts, so they can be checked). */
export async function listToolDrafts(limit = 10): Promise<RequestRecord[]> {
  const rows = await db.$queryRaw<{ value: RequestRecord }[]>`
    SELECT "value" FROM "Setting"
    WHERE "key" LIKE ${`${REQUEST_PREFIX}%`} AND "value"->>'status' IN ('created', 'unknown')
    ORDER BY "updatedAt" DESC LIMIT ${limit}`;
  return rows.map((r) => r.value);
}

/** Old attempts that never created anything are pruned so the Setting table stays small. */
async function pruneRequests() {
  await db.$executeRaw`DELETE FROM "Setting" WHERE "key" LIKE ${`${REQUEST_PREFIX}%`} AND "value"->>'status' IN ('failed', 'abandoned') AND "updatedAt" < now() - interval '30 days'`;
  await db.$executeRaw`DELETE FROM "Setting" WHERE "key" LIKE ${`${REQUEST_PREFIX}%`} AND "updatedAt" < now() - interval '365 days'`;
}

// ───────── Create draft ─────────

export type DraftForm = {
  token: string;
  fromKey: string | null;
  toKey: string | null;
  excluded: string[];
  featured: string | null;
  title: string;
  subtitle: string;
  intro: string;
  archiveTag: boolean;
};

export type CreateResult =
  | { status: "missing_env"; missing: string[]; message: string }
  | { status: "invalid"; message: string; nextToken: string }
  | { status: "duplicate"; record: RequestRecord; message: string }
  | { status: "created"; record: RequestRecord; message: string; editUrl: string }
  | { status: "failed"; record: RequestRecord | null; message: string; nextToken: string }
  | { status: "unknown"; record: RequestRecord; message: string };

/** Everything a draft needs, built from DB data (client-sent keys only pick from the server's list). */
export async function buildDraftFromForm(form: Omit<DraftForm, "token">, opts: { now?: Date; templateId?: string | null } = {}) {
  const now = opts.now ?? new Date();
  const range = parseRange(form.fromKey, form.toKey, now);
  const all = await loadRangeOccurrences(range, now);
  const { featured, items } = applySelection(all, { excluded: form.excluded, featured: form.featured });
  const { base, fromEnv } = newsletterBaseUrl();
  const blocks = buildSectionBlocks({ featured, items, baseUrl: base, intro: form.intro });
  const templateId = opts.templateId === undefined ? await getTemplateId() : opts.templateId;
  const count = items.length + (featured ? 1 : 0);
  const body: DraftPostBody | null = form.title.trim() && count
    ? buildDraftPostBody({ title: form.title, subtitle: form.subtitle, blocks, contentTags: form.archiveTag ? [ARCHIVE_TAG] : [], templateId })
    : null;
  return { range, all, featured, items, blocks, body, count, baseFromEnv: fromEnv, templateId };
}

const CHECK_MESSAGE = "Open your beehiiv Drafts and look for this title before trying again — a second attempt could create a duplicate draft. You can also use “Check beehiiv” to find it.";

export async function createNewsletterDraft(form: DraftForm, opts: { userId: string | null; now?: Date; fetchImpl?: typeof fetch; timeoutMs?: number; pollDelayMs?: number }): Promise<CreateResult> {
  const missing = missingBeehiivVars();
  if (missing.length) return { status: "missing_env", missing, message: `beehiiv is not configured. Add these Railway variables: ${missing.join(", ")}.` };
  const env = beehiivEnv() as BeehiivEnv;
  if (!isRequestToken(form.token)) return { status: "invalid", message: "This form has expired. Reload the page and try again.", nextToken: newRequestToken() };

  // Same token again (double click, resubmit, retry after a slow response): never call beehiiv twice.
  const existing = await getRequest(form.token);
  if (existing) return duplicateResult(existing);

  if (!form.title.trim()) return { status: "invalid", message: "Enter an issue title.", nextToken: form.token };
  const draft = await buildDraftFromForm(form, { now: opts.now });
  if (!draft.count || !draft.body) return { status: "invalid", message: "Select at least one event.", nextToken: form.token };

  const nowIso = new Date().toISOString();
  const rec: RequestRecord = {
    token: form.token, status: "pending", title: draft.body.title, userId: opts.userId, createdAt: nowIso, updatedAt: nowIso,
    eventCount: draft.count, featured: !!draft.featured, archiveTag: form.archiveTag, templateId: draft.templateId ?? null,
  };
  if (!(await claimToken(rec))) {
    const other = await getRequest(form.token);
    return other ? duplicateResult(other) : { status: "invalid", message: "Could not start the request. Reload and try again.", nextToken: newRequestToken() };
  }
  await pruneRequests().catch(() => {});

  const auditBase = { token: form.token, title: rec.title, eventCount: rec.eventCount, featured: rec.featured, archiveTag: rec.archiveTag, templateId: rec.templateId, status: "draft" };
  let outcome: CreateOutcome;
  try {
    outcome = await createDraftPost(env, draft.body, opts.fetchImpl, opts.timeoutMs ?? BEEHIIV_CREATE_TIMEOUT_MS);
  } catch (e) {
    // Thrown before sending (e.g. the draft-only assertion). Nothing reached beehiiv.
    outcome = { kind: "not_sent", message: (e as Error).message.slice(0, 200) };
  }

  if (outcome.kind === "created") {
    let saved = await writeRequest({ ...rec, status: "created", postId: outcome.postId, previewUrl: outcome.previewUrl, httpStatus: outcome.httpStatus, postState: "creating", message: null });
    await audit(opts.userId, "newsletter.events_draft_created", "BeehiivPost", outcome.postId, { ...auditBase, httpStatus: outcome.httpStatus });
    // beehiiv finishes creating the post in the background — check once or twice.
    const state = await pollPost(env, outcome.postId, opts.fetchImpl, opts.pollDelayMs ?? 1000);
    if (state) saved = await writeRequest({ ...saved, postState: state.state, message: state.state === "failed" ? state.message : null });
    const failedLater = saved.postState === "failed";
    return {
      status: "created", record: saved, editUrl: beehiivEditUrl(outcome.postId),
      message: failedLater ? "beehiiv accepted the draft but then reported that it could not finish creating it. Check beehiiv Drafts; you can try again with a new request." : saved.postState === "ready" ? "Draft created in beehiiv." : "Draft created — beehiiv is still finishing it (this can take a few seconds).",
    };
  }
  if (outcome.kind === "ambiguous") {
    const saved = await writeRequest({ ...rec, status: "unknown", httpStatus: outcome.httpStatus || null, message: outcome.message });
    await audit(opts.userId, "newsletter.events_draft_unknown", "Setting", requestKey(form.token), { ...auditBase, httpStatus: outcome.httpStatus || null, reason: outcome.message });
    return { status: "unknown", record: saved, message: `${outcome.message} We don't know whether beehiiv created the draft, so it was NOT retried. ${CHECK_MESSAGE}` };
  }
  const httpStatus = outcome.kind === "rejected" ? outcome.httpStatus : null;
  const saved = await writeRequest({ ...rec, status: "failed", httpStatus, message: outcome.message });
  await audit(opts.userId, "newsletter.events_draft_failed", "Setting", requestKey(form.token), { ...auditBase, httpStatus, reason: outcome.message });
  return { status: "failed", record: saved, message: outcome.message, nextToken: newRequestToken() };
}

function duplicateResult(r: RequestRecord): CreateResult {
  if (r.status === "created" && r.postId) return { status: "created", record: r, editUrl: beehiivEditUrl(r.postId), message: "This request already created a draft (it was not sent again)." };
  if (r.status === "unknown") return { status: "unknown", record: r, message: `This request was already sent and its outcome is unknown, so it was not sent again. ${CHECK_MESSAGE}` };
  if (r.status === "pending") return { status: "duplicate", record: r, message: "This request is already being sent to beehiiv. Wait a moment, then reload the page." };
  if (r.status === "failed") return { status: "failed", record: r, message: `This request already failed and was not sent again: ${r.message ?? "unknown error"}`, nextToken: newRequestToken() };
  return { status: "duplicate", record: r, message: "This request was closed. Reload the page to start a new one." };
}

async function pollPost(env: BeehiivEnv, postId: string, fetchImpl: typeof fetch | undefined, delayMs: number) {
  let last: Awaited<ReturnType<typeof getPostState>> | null = null;
  for (let i = 0; i < 2; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    last = await getPostState(env, postId, fetchImpl);
    if (last.state !== "creating") break;
  }
  return last && last.state !== "error" ? last : null;
}

// ───────── Recovering an unknown outcome ─────────

export type CheckResult =
  | { status: "missing_env"; missing: string[]; message: string }
  | { status: "error"; message: string; drafts: DraftSummary[] }
  | { status: "recovered"; message: string; record: RequestRecord; editUrl: string; drafts: DraftSummary[] }
  | { status: "not_found" | "ambiguous" | "not_unknown"; message: string; drafts: DraftSummary[]; matches: DraftSummary[] };

/** GET recent drafts and match the request's exact title. One match → the record becomes "created". */
export async function checkBeehiivForRequest(token: string, opts: { userId: string | null; fetchImpl?: typeof fetch }): Promise<CheckResult> {
  const missing = missingBeehiivVars();
  if (missing.length) return { status: "missing_env", missing, message: `beehiiv is not configured. Add these Railway variables: ${missing.join(", ")}.` };
  const rec = await getRequest(token);
  if (!rec) return { status: "error", message: "That request was not found.", drafts: [] };
  const list = await listRecentDrafts(beehiivEnv() as BeehiivEnv, opts.fetchImpl);
  if (!list.ok) return { status: "error", message: list.message, drafts: [] };
  const matches = list.drafts.filter((d) => d.title === rec.title);
  if (rec.status !== "unknown") return { status: "not_unknown", message: rec.status === "created" ? "This request already has a draft." : "Nothing to recover for this request.", drafts: list.drafts, matches };
  if (matches.length === 1) {
    const saved = await writeRequest({ ...rec, status: "created", postId: matches[0].id, recovered: true, postState: "ready", message: "Found in beehiiv Drafts after an unknown result." });
    await audit(opts.userId, "newsletter.events_draft_recovered", "BeehiivPost", matches[0].id, { token, title: rec.title });
    return { status: "recovered", record: saved, editUrl: beehiivEditUrl(matches[0].id), drafts: list.drafts, message: "Found the draft in beehiiv — it was created. No new request is needed." };
  }
  if (matches.length > 1) return { status: "ambiguous", matches, drafts: list.drafts, message: `${matches.length} recent drafts have this exact title. Open beehiiv Drafts to check which one to keep.` };
  return { status: "not_found", matches, drafts: list.drafts, message: "No recent draft in beehiiv has this exact title. beehiiv may still be processing it — wait a minute and check again. If it still isn't there, start a new request." };
}

/** Admin confirmed beehiiv has no such draft: close the unknown request and hand out a fresh token. */
export async function abandonRequest(token: string, userId: string | null): Promise<{ ok: boolean; nextToken: string }> {
  const rec = await getRequest(token);
  if (rec && rec.status === "unknown") {
    await writeRequest({ ...rec, status: "abandoned", message: "Closed by an admin after checking beehiiv." });
    await audit(userId, "newsletter.events_draft_abandoned", "Setting", requestKey(token), { token, title: rec.title });
  }
  return { ok: !!rec, nextToken: newRequestToken() };
}

export { isPostId };

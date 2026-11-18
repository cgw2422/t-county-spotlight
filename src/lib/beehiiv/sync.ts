import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { slugify, stripHtml, truncate } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { BeehiivError, beehiivEnv, listConfirmedPostsByTag, type BeehiivPost } from "./client";
import { prepareBeehiivContent } from "./html";

/** beehiiv content tags that route posts into the site. */
export const ARCHIVE_TAG = "newsletter-archive";
export const ARTICLE_TAG = "tcc-article";
/** Never used as issue slugs: these are real routes under /newsletter/. */
export const RESERVED_ISSUE_SLUGS = new Set(["confirm", "preferences", "unsubscribe", "thanks", "page", "archive", "feed", "rss"]);

const RESULT_KEY = "beehiiv.sync";
const LOCK_KEY = "beehiiv.syncLock";
const LOCK_MS = 10 * 60_000;
/** Cron runs the sync at most this often. */
export const CRON_INTERVAL_MS = 60 * 60_000;

export type SyncCounts = {
  fetched: number;
  issuesCreated: number; issuesUpdated: number; issuesUnchanged: number; issuesHidden: number;
  articlesCreated: number; articlesUpdated: number; articlesUnchanged: number; articlesUnpublished: number;
  preservedLocalEdits: number;
  /** confirmed but publish_date in the future, or not confirmed, or no content */
  skipped: number;
};
export type SyncResult = {
  status: "ok" | "error" | "not_configured" | "locked";
  message: string;
  trigger: string;
  startedAt: string;
  finishedAt: string;
  counts: SyncCounts;
  /** Posts whose body came from the email layout (no web content). */
  emailLayout: { id: string; title: string }[];
  errors: string[];
};

const zero = (): SyncCounts => ({ fetched: 0, issuesCreated: 0, issuesUpdated: 0, issuesUnchanged: 0, issuesHidden: 0, articlesCreated: 0, articlesUpdated: 0, articlesUnchanged: 0, articlesUnpublished: 0, preservedLocalEdits: 0, skipped: 0 });

export async function getLastSyncResult(): Promise<SyncResult | null> {
  const row = await db.setting.findUnique({ where: { key: RESULT_KEY } }).catch(() => null);
  return row?.value && typeof row.value === "object" ? (row.value as unknown as SyncResult) : null;
}

async function saveResult(r: SyncResult) {
  const value = r as unknown as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: RESULT_KEY }, create: { key: RESULT_KEY, value }, update: { value } });
}

// ── Lease lock in a Setting row: atomic UPDATE … WHERE expired, works across instances. ──
async function acquireLock(owner: string) {
  await db.$executeRaw`INSERT INTO "Setting" ("key", "value", "updatedAt") VALUES (${LOCK_KEY}, '{}'::jsonb, now()) ON CONFLICT ("key") DO NOTHING`;
  const until = new Date(Date.now() + LOCK_MS).toISOString();
  const n = await db.$executeRaw`
    UPDATE "Setting" SET "value" = jsonb_build_object('lockUntil', ${until}::text, 'owner', ${owner}::text), "updatedAt" = now()
    WHERE "key" = ${LOCK_KEY} AND (("value"->>'lockUntil') IS NULL OR ("value"->>'lockUntil')::timestamptz < now())`;
  return n > 0;
}
async function releaseLock(owner: string) {
  await db.$executeRaw`UPDATE "Setting" SET "value" = '{}'::jsonb, "updatedAt" = now() WHERE "key" = ${LOCK_KEY} AND "value"->>'owner' = ${owner}`;
}

/** Live = confirmed AND publish_date (unix seconds) has passed. Scheduled posts are "confirmed" with a future date. */
export function isLive(p: BeehiivPost, now = Date.now()) {
  return p.status === "confirmed" && typeof p.publish_date === "number" && p.publish_date > 0 && p.publish_date * 1000 <= now;
}

function hasTag(p: BeehiivPost, tag: string) {
  // The API filters by tag; when the post lists its tags, double-check (case-insensitive).
  return !Array.isArray(p.content_tags) || p.content_tags.some((t) => String(t).trim().toLowerCase() === tag);
}

function httpsUrl(u: string | null | undefined) {
  if (!u) return null;
  try {
    const x = new URL(u);
    return x.protocol === "https:" ? x.toString().slice(0, 2000) : null;
  } catch {
    return null;
  }
}

async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>, reserved = new Set<string>()) {
  const root = (slugify(base) || "issue").slice(0, 70);
  for (let i = 1; i < 500; i++) {
    const s = i === 1 ? root : `${root}-${i}`;
    if (!reserved.has(s) && !(await taken(s))) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

type Live = { post: BeehiivPost; tags: Set<string> };

/**
 * Imports live beehiiv posts: `newsletter-archive` → NewsletterIssue,
 * `tcc-article` → Article (a post with both tags becomes both). Dedupe is
 * strictly by beehiiv post id. Idempotent; one run at a time (lease lock).
 * Posts that stop coming back as live: the issue is hidden, the article goes
 * to DRAFT unless it was edited locally. No-op without BEEHIIV_API_KEY /
 * BEEHIIV_PUBLICATION_ID.
 */
export async function syncBeehiiv(opts: { trigger?: string; actorId?: string | null; fetchImpl?: typeof fetch; now?: Date } = {}): Promise<SyncResult> {
  const trigger = opts.trigger ?? "manual";
  const startedAt = new Date();
  const base = (status: SyncResult["status"], message: string): SyncResult => ({ status, message, trigger, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(), counts: zero(), emailLayout: [], errors: [] });
  const env = beehiivEnv();
  if (!env) return base("not_configured", "beehiiv sync is not configured: set BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID on the server. Nothing was changed.");
  const owner = `${trigger}-${startedAt.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!(await acquireLock(owner))) return base("locked", "Another beehiiv sync is already running. Try again in a few minutes.");

  const result = base("ok", "");
  const c = result.counts;
  try {
    const now = (opts.now ?? new Date()).getTime();
    const live = new Map<string, Live>();
    let complete = true;
    for (const tag of [ARCHIVE_TAG, ARTICLE_TAG]) {
      let posts: BeehiivPost[];
      try {
        posts = await listConfirmedPostsByTag(env, tag, opts.fetchImpl);
      } catch (e) {
        complete = false;
        result.errors.push(e instanceof BeehiivError ? e.message : `Fetching “${tag}” posts failed`);
        continue;
      }
      for (const p of posts) {
        c.fetched++;
        if (!hasTag(p, tag) || !isLive(p, now)) { c.skipped++; continue; }
        const entry = live.get(p.id) ?? { post: p, tags: new Set<string>() };
        entry.tags.add(tag);
        live.set(p.id, entry);
      }
    }

    const syncedAt = new Date();
    for (const { post: p, tags } of live.values()) {
      const content = prepareBeehiivContent(p.content?.free?.web, p.content?.free?.email);
      const title = sanitizePlain(p.title, 300) || "(untitled)";
      if (!content) {
        c.skipped += tags.size;
        result.errors.push(`“${title}” has no free web or email content — skipped.`);
        continue;
      }
      if (content.source === "email") result.emailLayout.push({ id: p.id, title });
      const subtitle = sanitizePlain(p.subtitle, 500) || null;
      const publishedAt = new Date((p.publish_date as number) * 1000);
      const thumbnailUrl = httpsUrl(p.thumbnail_url);
      const webUrl = httpsUrl(p.web_url);
      try {
        if (tags.has(ARCHIVE_TAG)) await upsertIssue(p, { title, subtitle, publishedAt, thumbnailUrl, webUrl, html: content.html, source: content.source, syncedAt }, c);
        if (tags.has(ARTICLE_TAG)) await upsertArticle(p, { title, subtitle, publishedAt, thumbnailUrl, html: content.html, source: content.source, syncedAt }, c);
      } catch (e) {
        result.errors.push(`“${title}”: ${(e as Error).message.slice(0, 200)}`);
      }
    }

    // Removal handling only after a complete fetch — a failed request must never hide the archive.
    if (complete) {
      const archiveIds = [...live.values()].filter((l) => l.tags.has(ARCHIVE_TAG)).map((l) => l.post.id);
      const articleIds = [...live.values()].filter((l) => l.tags.has(ARTICLE_TAG)).map((l) => l.post.id);
      const hidden = await db.newsletterIssue.updateMany({ where: { beehiivPostId: { notIn: archiveIds }, hidden: false }, data: { hidden: true, removedAt: syncedAt } });
      c.issuesHidden = hidden.count;
      const gone = await db.article.findMany({ where: { beehiivPostId: { not: null, notIn: articleIds }, status: "PUBLISHED", localEditedAt: null, deletedAt: null }, select: { id: true, title: true } });
      if (gone.length) {
        await db.article.updateMany({ where: { id: { in: gone.map((a) => a.id) }, localEditedAt: null }, data: { status: "DRAFT" } });
        for (const a of gone) await audit(opts.actorId ?? null, "beehiiv.article_unpublished", "Article", a.id, { title: a.title, reason: "no longer live in beehiiv" });
      }
      c.articlesUnpublished = gone.length;
    } else {
      result.errors.push("Removal check skipped because not every beehiiv request succeeded.");
    }
    result.status = result.errors.length && !complete ? "error" : "ok";
    result.message = complete
      ? `Synced ${live.size} live post(s) from beehiiv.`
      : "The beehiiv sync didn't finish: see the errors below. Nothing was hidden or unpublished.";
  } catch (e) {
    result.status = "error";
    result.message = "The beehiiv sync failed.";
    result.errors.push((e as Error).message.slice(0, 300));
  } finally {
    result.finishedAt = new Date().toISOString();
    await saveResult(result).catch((e) => console.error("[beehiiv] saving sync result failed", (e as Error).message));
    await releaseLock(owner).catch(() => {});
  }
  await audit(opts.actorId ?? null, "beehiiv.sync", "Setting", RESULT_KEY, { trigger, status: result.status, counts: result.counts, errors: result.errors.length } as unknown as Prisma.InputJsonValue);
  return result;
}

type Fields = { title: string; subtitle: string | null; publishedAt: Date; thumbnailUrl: string | null; html: string; source: "web" | "email"; syncedAt: Date };

async function upsertIssue(p: BeehiivPost, f: Fields & { webUrl: string | null }, c: SyncCounts) {
  const existing = await db.newsletterIssue.findUnique({ where: { beehiivPostId: p.id } });
  const data = { title: f.title, subtitle: f.subtitle, html: f.html, thumbnailUrl: f.thumbnailUrl, publishedAt: f.publishedAt, webUrl: f.webUrl, contentSource: f.source };
  if (existing) {
    const changed = existing.title !== data.title || existing.subtitle !== data.subtitle || existing.html !== data.html || existing.thumbnailUrl !== data.thumbnailUrl
      || existing.publishedAt.getTime() !== data.publishedAt.getTime() || existing.webUrl !== data.webUrl || existing.contentSource !== data.contentSource;
    // Back after being removed in beehiiv → visible again. An admin's manual hide (removedAt null) is kept.
    const restore = existing.hidden && !!existing.removedAt;
    await db.newsletterIssue.update({ where: { id: existing.id }, data: { ...data, syncedAt: f.syncedAt, ...(restore ? { hidden: false, removedAt: null } : {}) } });
    if (changed || restore) c.issuesUpdated++;
    else c.issuesUnchanged++;
    return;
  }
  const slug = await uniqueSlug(p.slug || f.title, async (s) => !!(await db.newsletterIssue.findUnique({ where: { slug: s }, select: { id: true } })), RESERVED_ISSUE_SLUGS);
  await db.newsletterIssue.create({ data: { ...data, beehiivPostId: p.id, slug, syncedAt: f.syncedAt } });
  c.issuesCreated++;
}

async function upsertArticle(p: BeehiivPost, f: Fields, c: SyncCounts) {
  const existing = await db.article.findUnique({ where: { beehiivPostId: p.id } });
  // Local edits win (same rule as the WordPress importer); deleted articles stay deleted.
  if (existing && (existing.localEditedAt || existing.deletedAt)) { c.preservedLocalEdits++; return; }
  const excerpt = f.subtitle || sanitizePlain(p.meta_default_description, 500) || sanitizePlain(p.preview_text, 500) || truncate(stripHtml(f.html), 280) || null;
  const data = {
    title: f.title.slice(0, 500), excerpt, content: f.html, status: "PUBLISHED" as const, publishedAt: f.publishedAt,
    featuredImageUrl: f.thumbnailUrl, featuredImageAlt: f.thumbnailUrl ? f.title.slice(0, 200) : null,
    authorName: Array.isArray(p.authors) && p.authors.length ? sanitizePlain(p.authors.join(", "), 200) || null : null,
    seoTitle: sanitizePlain(p.meta_default_title, 200) || null, seoDescription: sanitizePlain(p.meta_default_description, 300) || null,
    beehiivContentSource: f.source,
  };
  if (existing) {
    const changed = existing.title !== data.title || existing.excerpt !== data.excerpt || existing.content !== data.content || existing.status !== "PUBLISHED"
      || existing.publishedAt?.getTime() !== data.publishedAt.getTime() || existing.featuredImageUrl !== data.featuredImageUrl || existing.beehiivContentSource !== data.beehiivContentSource;
    if (!changed) { await db.article.update({ where: { id: existing.id }, data: { beehiivSyncedAt: f.syncedAt } }); c.articlesUnchanged++; return; }
    // Guarded: if someone saved the article while this ran, their edit wins.
    const n = await db.article.updateMany({ where: { id: existing.id, localEditedAt: null }, data: { ...data, beehiivSyncedAt: f.syncedAt } });
    if (n.count) c.articlesUpdated++;
    else c.preservedLocalEdits++;
    return;
  }
  const slug = await uniqueSlug(p.slug || f.title, async (s) => !!(await db.article.findUnique({ where: { slug: s }, select: { id: true } })));
  const a = await db.article.create({ data: { ...data, slug, kind: "GENERAL", beehiivPostId: p.id, beehiivSyncedAt: f.syncedAt } });
  await audit(null, "beehiiv.article_imported", "Article", a.id, { title: a.title, beehiivPostId: p.id });
  c.articlesCreated++;
}

/** Cron entry: runs the sync at most once per CRON_INTERVAL_MS; silent no-op without env. Never throws. */
export async function maybeSyncBeehiivFromCron(now = new Date()) {
  try {
    if (!beehiivEnv()) return { skipped: "not configured" };
    const last = await getLastSyncResult();
    const lastAt = last?.startedAt ? new Date(last.startedAt).getTime() : 0;
    if (last && last.status !== "locked" && now.getTime() - lastAt < CRON_INTERVAL_MS) return { skipped: "ran recently", lastRunAt: last.startedAt };
    const r = await syncBeehiiv({ trigger: "cron" });
    return { status: r.status, counts: r.counts, errors: r.errors.length };
  } catch (e) {
    console.error("[cron] beehiiv sync failed", (e as Error).message);
    return { error: "beehiiv sync failed" };
  }
}

import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl, slugify, stripHtml, truncate } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { BeehiivError, beehiivEnv, listConfirmedPosts, type BeehiivPost } from "./client";
import { prepareBeehiivContent } from "./html";
import { renderWebArticle, type DesignMeta } from "@/lib/newsletter-designer/render";
import type { DesignContent } from "@/lib/newsletter-designer/types";
import { NWS_FORECAST_PAGE } from "@/lib/weather/shared";
import { backfillNewsletterCategory as backfillCategory, ensureNewsletterCategory as ensureCategory } from "./newsletter-category";

export { NEWSLETTER_CATEGORY } from "./newsletter-category";
export const ensureNewsletterCategory = () => ensureCategory(db);
export const backfillNewsletterCategory = () => backfillCategory(db);

/** beehiiv content tags that route posts into the site. */
export const ARCHIVE_TAG = "newsletter-archive";
/** Legacy opt-in tag. No longer required (every public web post becomes an article); posts that still carry it keep their old behavior. */
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
  /** Scheduled posts imported (or refreshed) ahead of their send time — hidden on the site until then. */
  articlesScheduled: number;
  /** not confirmed, email-only, premium, a scheduled archive issue, or no content */
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

const zero = (): SyncCounts => ({ fetched: 0, issuesCreated: 0, issuesUpdated: 0, issuesUnchanged: 0, issuesHidden: 0, articlesCreated: 0, articlesUpdated: 0, articlesUnchanged: 0, articlesUnpublished: 0, preservedLocalEdits: 0, articlesScheduled: 0, skipped: 0 });

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

/** Confirmed (scheduled) in beehiiv with a send time still in the future. */
export function isScheduled(p: BeehiivPost, now = Date.now()) {
  return p.status === "confirmed" && typeof p.publish_date === "number" && p.publish_date * 1000 > now;
}

export function hasTag(p: BeehiivPost, tag: string) {
  return Array.isArray(p.content_tags) && p.content_tags.some((t) => String(t).trim().toLowerCase() === tag);
}

/** Readable on the public web: published to web (Web only or Email + Web) and not premium-only (gated). */
export function isPublicWebPost(p: BeehiivPost) {
  const platform = String(p.platform ?? "").toLowerCase();
  const audience = String(p.audience ?? "").toLowerCase();
  const onWeb = platform === "web" || platform === "both" || platform === "all";
  const gated = audience === "premium";
  return onWeb && !gated;
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

/** The slug an import starts from (before any -2, -3 suffix). Shared with the Article link tool. */
export function importSlugRoot(base: string) {
  return (slugify(base) || "issue").slice(0, 70);
}

/** Where the sync files a post (archive issue, article, or not imported) — the same rules the loop below applies. */
export type PostRoute = "issue" | "article" | "email_only" | "premium";
export function postRoute(p: BeehiivPost): PostRoute {
  if (hasTag(p, ARCHIVE_TAG)) return "issue";
  if (isPublicWebPost(p) || hasTag(p, ARTICLE_TAG)) return "article";
  return String(p.audience ?? "").toLowerCase() === "premium" ? "premium" : "email_only";
}

async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>, reserved = new Set<string>()) {
  const root = importSlugRoot(base);
  for (let i = 1; i < 500; i++) {
    const s = i === 1 ? root : `${root}-${i}`;
    if (!reserved.has(s) && !(await taken(s))) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

type Live = { post: BeehiivPost; tags: Set<string> };

/**
 * Imports live beehiiv posts. `newsletter-archive` → NewsletterIssue only (never also an
 * Article). Every other live, publicly readable web post (Web only or Email + Web, not
 * premium-gated) → Article — no tag needed; posts with the legacy `tcc-article` tag keep
 * importing as before. Drafts, scheduled-but-not-live, email-only and gated posts are skipped. Dedupe is
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
    await backfillNewsletterCategory().catch((e) => result.errors.push(`Newsletter category backfill failed: ${(e as Error).message.slice(0, 120)}`));
    const now = (opts.now ?? new Date()).getTime();
    const live = new Map<string, Live>();
    let complete = true;
    // One listing of every confirmed post; routing is decided per post below.
    let posts: BeehiivPost[] = [];
    try {
      posts = await listConfirmedPosts(env, null, opts.fetchImpl);
    } catch (e) {
      complete = false;
      result.errors.push(e instanceof BeehiivError ? e.message : "Fetching beehiiv posts failed");
    }
    for (const p of posts) {
      c.fetched++;
      const scheduled = isScheduled(p, now);
      if (!isLive(p, now) && !scheduled) { c.skipped++; continue; } // drafts and archived posts
      const tags = new Set<string>();
      const route = postRoute(p);
      // Archive issues are only imported once live. Scheduled ARTICLES are imported ahead of time with their
      // send time as publishedAt: every public query hides them until then, so they go live exactly when the email sends.
      if (route === "issue" && !scheduled) tags.add(ARCHIVE_TAG); // newsletter issue → /newsletter/ only
      else if (route === "article") tags.add(ARTICLE_TAG); // public web post (or legacy tag) → Articles
      if (!tags.size) { c.skipped++; continue; } // email-only send, premium-gated, or a not-yet-live archive issue
      if (scheduled) c.articlesScheduled++;
      live.set(p.id, { post: p, tags });
    }

    const syncedAt = new Date();
    const liveArticleIds = new Set([...live.values()].filter((l) => l.tags.has(ARTICLE_TAG)).map((l) => l.post.id));
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
        if (tags.has(ARTICLE_TAG)) {
          // Auto-imported articles use the public web version only; the email fallback is kept just for legacy-tagged posts.
          if (content.source === "web" || hasTag(p, ARTICLE_TAG)) await upsertArticle(p, { title, subtitle, publishedAt, thumbnailUrl, html: content.html, source: content.source, syncedAt }, c);
          else { c.skipped++; liveArticleIds.delete(p.id); }
        }
      } catch (e) {
        result.errors.push(`“${title}”: ${(e as Error).message.slice(0, 200)}`);
      }
    }

    // Removal handling only after a complete fetch — a failed request must never hide the archive.
    if (complete) {
      const archiveIds = [...live.values()].filter((l) => l.tags.has(ARCHIVE_TAG)).map((l) => l.post.id);
      const articleIds = [...liveArticleIds];
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
      ? `Synced ${live.size} post(s) from beehiiv${c.articlesScheduled ? ` (${c.articlesScheduled} scheduled — hidden on the site until their send time)` : ""}.`
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

/**
 * Posts built with the Newsletter designer arrive from beehiiv as email layout (600px tables with inline styles),
 * which doesn't belong on a web page. For those, the site uses a web version rendered from the saved design
 * instead: the same content in the same order as plain headings, paragraphs, images and links.
 */
async function designerWebHtml(p: BeehiivPost, selfPath: string | null, featuredImageUrl: string | null): Promise<string | null> {
  const d = await db.newsletterDesign.findFirst({ where: { beehiivPostId: p.id }, orderBy: { beehiivSentAt: "desc" } });
  if (!d) return null;
  const meta: DesignMeta = { title: d.title, previewText: d.previewText, issueNumber: d.issueNumber, issueDate: d.issueDate.toISOString().slice(0, 10), content: d.content as unknown as DesignContent };
  if (!Array.isArray(meta.content?.sections)) return null;
  const html = renderWebArticle(meta, { siteUrl: absoluteUrl("/").replace(/\/$/, ""), logoUrl: null, weather: null, socials: [] }, { selfPath, featuredImageUrl, forecastUrl: NWS_FORECAST_PAGE });
  return html.trim() ? html : null;
}

async function upsertIssue(p: BeehiivPost, f: Fields & { webUrl: string | null }, c: SyncCounts) {
  const designHtml = await designerWebHtml(p, null, f.thumbnailUrl);
  if (designHtml) f = { ...f, html: designHtml, source: "web" };
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

/** An article URL is taken when another article has that slug OR an imported legacy path equal to /articles/<slug>/ (any status, deleted too). */
export async function articleSlugTaken(slug: string) {
  return !!(await db.article.findFirst({ where: { OR: [{ slug }, { legacyPath: `/articles/${slug}/` }] }, select: { id: true } }));
}

export type ArticleUpsert = { outcome: "created" | "updated" | "unchanged" | "preserved"; articleId: string };
/** Thrown when an exact-slug import (Article link tool) finds the slug taken: never fall back to a -2 URL there. */
export class SlugTakenError extends Error {}

async function upsertArticle(p: BeehiivPost, f: Fields, c: SyncCounts, opts: { exactSlug?: string } = {}): Promise<ArticleUpsert> {
  // Dedupe strictly by beehiiv post id: a held URL (placeholder) or an earlier import is updated in place — never duplicated.
  const existing = await db.article.findUnique({ where: { beehiivPostId: p.id } });
  // Local edits win (same rule as the WordPress importer); deleted articles stay deleted.
  if (existing && (existing.localEditedAt || existing.deletedAt)) { c.preservedLocalEdits++; return { outcome: "preserved", articleId: existing.id }; }
  if (existing) {
    const designHtml = await designerWebHtml(p, `/articles/${existing.slug}/`, f.thumbnailUrl);
    if (designHtml) f = { ...f, html: designHtml, source: "web" };
  }
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
    if (!changed) { await db.article.update({ where: { id: existing.id }, data: { beehiivSyncedAt: f.syncedAt } }); c.articlesUnchanged++; return { outcome: "unchanged", articleId: existing.id }; }
    // Guarded: if someone saved the article while this ran, their edit wins.
    const n = await db.article.updateMany({ where: { id: existing.id, localEditedAt: null }, data: { ...data, beehiivSyncedAt: f.syncedAt } });
    if (n.count) c.articlesUpdated++;
    else c.preservedLocalEdits++;
    return { outcome: n.count ? "updated" : "preserved", articleId: existing.id };
  }
  let slug: string;
  if (opts.exactSlug) {
    if (await articleSlugTaken(opts.exactSlug)) throw new SlugTakenError(opts.exactSlug);
    slug = opts.exactSlug;
  } else {
    slug = await uniqueSlug(p.slug || f.title, articleSlugTaken);
  }
  const designHtml = await designerWebHtml(p, `/articles/${slug}/`, f.thumbnailUrl);
  if (designHtml) { data.content = designHtml; data.beehiivContentSource = "web"; }
  // New imports are filed under Newsletter. Later syncs never change categories, so a manual change sticks.
  const categoryId = await ensureNewsletterCategory();
  const a = await db.article.create({ data: { ...data, slug, kind: "GENERAL", beehiivPostId: p.id, beehiivSyncedAt: f.syncedAt, categories: { connect: { id: categoryId } } } });
  await audit(null, "beehiiv.article_imported", "Article", a.id, { title: a.title, beehiivPostId: p.id });
  c.articlesCreated++;
  return { outcome: "created", articleId: a.id };
}

/** Cron entry: runs the sync at most once per CRON_INTERVAL_MS; silent no-op without env. Never throws. */
/** Article fields for one post — the same preparation the sync loop uses. Null when there's no usable content. */
export function articleFieldsFor(p: BeehiivPost, syncedAt = new Date()): Fields | null {
  const content = prepareBeehiivContent(p.content?.free?.web, p.content?.free?.email);
  if (!content) return null;
  // Auto-imported articles use the public web version only; the email fallback is kept just for legacy-tagged posts.
  if (content.source !== "web" && !hasTag(p, ARTICLE_TAG)) return null;
  return {
    title: sanitizePlain(p.title, 300) || "(untitled)", subtitle: sanitizePlain(p.subtitle, 500) || null,
    publishedAt: new Date((p.publish_date as number) * 1000), thumbnailUrl: httpsUrl(p.thumbnail_url),
    html: content.html, source: content.source, syncedAt,
  };
}

/**
 * Import ONE confirmed (live or scheduled) beehiiv post as an article now — the same upsert the sync runs.
 * `exactSlug`: create only at that slug (refuse with SlugTakenError instead of a -2 URL).
 */
export async function importPostAsArticle(p: BeehiivPost, opts: { exactSlug?: string; now?: Date } = {}): Promise<ArticleUpsert> {
  const now = (opts.now ?? new Date()).getTime();
  if (!isLive(p, now) && !isScheduled(p, now)) throw new Error("This post isn't scheduled or published in beehiiv yet.");
  if (postRoute(p) !== "article") throw new Error("This post isn't a public web post, so it doesn't become an article.");
  const f = articleFieldsFor(p);
  if (!f) throw new Error("This post has no web content in beehiiv yet.");
  const c = zero();
  try {
    return await upsertArticle(p, f, c, { exactSlug: opts.exactSlug });
  } catch (e) {
    // A sync created the same post's article at the same moment (beehiivPostId is unique): update that one instead.
    if ((e as { code?: string }).code === "P2002" && !(e instanceof SlugTakenError)) {
      if (await db.article.findUnique({ where: { beehiivPostId: p.id }, select: { id: true } })) return upsertArticle(p, f, c);
      if (opts.exactSlug) throw new SlugTakenError(opts.exactSlug);
    }
    throw e;
  }
}

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

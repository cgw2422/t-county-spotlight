import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { articleHref } from "@/lib/links";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl } from "@/lib/utils";
import { BeehiivError, beehiivEnv, findPostsBySlug, getPost, type BeehiivPost } from "./client";
import { articleSlugTaken, ensureNewsletterCategory, importPostAsArticle, importSlugRoot, isLive, isScheduled, postRoute, SlugTakenError } from "./sync";

/**
 * Admin → Newsletter → Article link: given a beehiiv post slug, the T County Connect article URL that the
 * newsletter's "Custom Read Online URL" can use — but only once that URL is actually held by an article linked to
 * the post (so the link is never a guess). Uses exactly the importer's rules (route, slug root, dedupe by post id).
 */

export type PostSummary = {
  id: string; title: string; slug: string; status: string; route: ReturnType<typeof postRoute>;
  /** draft | scheduled | published | archived */
  timing: "draft" | "scheduled" | "published" | "archived";
  publishAt: string | null; hasWebContent: boolean;
};

export type ArticleSummary = {
  id: string; title: string; slug: string; status: string; publishedAt: string | null; deleted: boolean; locallyEdited: boolean;
  beehiivPostId: string | null; adminHref: string; url: string;
};

export type LinkState =
  /** Article exists, is published, and its publish time has passed. */
  | "live"
  /** Article imported with beehiiv's send time: hidden until then, goes live automatically when the email sends. */
  | "ready"
  /** URL held by a placeholder for a beehiiv draft; content arrives once the post is scheduled (sync or "Bring in now"). */
  | "held"
  /** Linked article exists but needs attention (post scheduled but not imported yet, times differ, locally edited draft…). */
  | "needs_import"
  | "attention";

export type LinkCheck =
  | { kind: "not_configured" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string }
  | { kind: "not_found"; slug: string }
  | { kind: "not_article"; post: PostSummary; message: string }
  | { kind: "conflict"; post: PostSummary; slug: string; url: string; conflict: ArticleSummary; message: string }
  | { kind: "blocked"; post: PostSummary; article: ArticleSummary; message: string }
  | { kind: "available"; post: PostSummary; slug: string; url: string; slugNote: string | null }
  | { kind: "linked"; post: PostSummary; article: ArticleSummary; state: LinkState; message: string; slugNote: string | null };

/** Accepts a bare slug or a beehiiv post URL (…/p/<slug>). */
export function parseSlugInput(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      const parts = u.pathname.split("/").filter(Boolean);
      v = parts[parts.length - 1] ?? "";
    } catch {
      return null;
    }
  }
  v = v.replace(/^\/+|\/+$/g, "");
  try { v = decodeURIComponent(v); } catch { /* keep as typed */ }
  return /^[a-z0-9][a-z0-9-]{0,199}$/i.test(v) ? v.toLowerCase() : null;
}

function summarizePost(p: BeehiivPost, now: number): PostSummary {
  const timing = p.status === "draft" ? "draft" : p.status === "archived" ? "archived" : isScheduled(p, now) ? "scheduled" : isLive(p, now) ? "published" : "draft";
  return {
    id: p.id, title: sanitizePlain(p.title, 300) || "(untitled)", slug: String(p.slug ?? ""), status: String(p.status ?? ""),
    route: postRoute(p), timing,
    publishAt: typeof p.publish_date === "number" && p.publish_date > 0 ? new Date(p.publish_date * 1000).toISOString() : null,
    hasWebContent: !!(p.content?.free?.web && p.content.free.web.trim()),
  };
}

const articleSelect = { id: true, title: true, slug: true, legacyPath: true, status: true, publishedAt: true, deletedAt: true, localEditedAt: true, beehiivPostId: true } as const;
type ArticleRow = { id: string; title: string; slug: string; legacyPath: string | null; status: string; publishedAt: Date | null; deletedAt: Date | null; localEditedAt: Date | null; beehiivPostId: string | null };

function summarizeArticle(a: ArticleRow): ArticleSummary {
  return {
    id: a.id, title: a.title, slug: a.slug, status: a.status, publishedAt: a.publishedAt?.toISOString() ?? null,
    deleted: !!a.deletedAt, locallyEdited: !!a.localEditedAt, beehiivPostId: a.beehiivPostId,
    adminHref: `/admin/articles/${a.id}/`, url: absoluteUrl(articleHref(a)),
  };
}

const ROUTE_MESSAGE: Record<string, string> = {
  issue: "This post is tagged newsletter-archive, so it goes to the newsletter archive (/newsletter/…), not to Articles. Remove the tag in beehiiv if it should be an article.",
  email_only: "This post is email-only in beehiiv, so it won't appear on T County Connect. Set it to Email and web (or Web) in beehiiv to get an article URL.",
  premium: "This post is for premium subscribers only, so it won't appear on T County Connect.",
};

/** Same-second precision is enough: beehiiv publish dates are whole seconds. */
const sameTime = (a: Date | string | null, b: string | null) => !!a && !!b && Math.floor(new Date(a).getTime() / 1000) === Math.floor(new Date(b).getTime() / 1000);

function linkedState(post: PostSummary, a: ArticleRow, now: number): { state: LinkState; message: string } {
  const at = a.publishedAt?.getTime() ?? null;
  if (a.localEditedAt) {
    const live = a.status === "PUBLISHED" && at !== null && at <= now;
    return {
      state: live ? "live" : "attention",
      message: live
        ? "This article is live. It was edited on T County Connect, so syncs no longer change it."
        : "This article was edited on T County Connect, so syncs no longer change it — it will NOT go live automatically. Publish it yourself in Admin → Articles before the newsletter sends.",
    };
  }
  if (a.status === "PUBLISHED" && at !== null && at <= now) return { state: "live", message: "This article is live now." };
  if (a.status === "PUBLISHED" && at !== null && at > now) {
    if (post.timing === "draft" || post.timing === "archived") {
      return { state: "attention", message: "This post is no longer scheduled in beehiiv, so the next sync hides the article again. The URL stays held for this post — schedule it again in beehiiv, then click Bring in now." };
    }
    if (post.timing === "scheduled" && sameTime(a.publishedAt, post.publishAt)) {
      return { state: "ready", message: "Ready. The article is imported and hidden until beehiiv's send time, then goes live automatically — no sync needed at send time." };
    }
    return { state: "needs_import", message: "The article's go-live time doesn't match beehiiv's current send time. Use Bring in now to update it." };
  }
  // Not published (held placeholder, or unpublished).
  if (post.timing === "draft") {
    return { state: "held", message: "URL held. The post is still a draft in beehiiv, so the article stays hidden. Schedule the post in beehiiv, then click Bring in now (or wait for the hourly sync) — it will then go live exactly when the email sends." };
  }
  if (post.timing === "archived") return { state: "attention", message: "This post is archived in beehiiv, so the article stays hidden." };
  return { state: "needs_import", message: "The post is scheduled or published in beehiiv but its content isn't on T County Connect yet. Click Bring in now." };
}

/** Looks up a beehiiv slug and reports the article URL it has (or would get), with any conflict. Read-only. */
export async function checkArticleLink(input: string, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<LinkCheck> {
  const env = beehiivEnv();
  if (!env) return { kind: "not_configured" };
  const slug = parseSlugInput(input);
  if (!slug) return { kind: "invalid", message: "Enter a beehiiv post slug (letters, numbers and hyphens), or paste the post's beehiiv URL." };
  const now = (opts.now ?? new Date()).getTime();

  let posts: BeehiivPost[];
  try {
    posts = await findPostsBySlug(env, slug, opts.fetchImpl);
  } catch (e) {
    return { kind: "error", message: e instanceof BeehiivError ? e.message : "Couldn't reach beehiiv." };
  }
  if (!posts.length) return { kind: "not_found", slug };
  const p = posts[0];
  const post = summarizePost(p, now);
  const slugNote = post.slug && post.slug !== slug ? `“${slug}” is an earlier slug of this post. Its current beehiiv slug is “${post.slug}”.` : null;

  // 1) Already linked to an article (held, scheduled, live…): that article's URL is the answer, whatever beehiiv's slug is now.
  const linked = await db.article.findUnique({ where: { beehiivPostId: p.id }, select: articleSelect });
  if (linked) {
    const article = summarizeArticle(linked);
    if (linked.deletedAt) return { kind: "blocked", post, article, message: "The article for this post was deleted on T County Connect, and syncs never restore deleted articles. Restore it in Admin → Articles first." };
    const renamed = post.slug && importSlugRoot(post.slug) !== linked.slug
      ? `The site keeps ${articleHref(linked)} even though the beehiiv slug is now “${post.slug}”. Use the URL below.` : null;
    return { kind: "linked", post, article, ...linkedState(post, linked, now), slugNote: renamed ?? slugNote };
  }

  // 2) Not linked yet: the post must route to Articles at all.
  if (post.route !== "article") return { kind: "not_article", post, message: ROUTE_MESSAGE[post.route] };
  if (post.timing === "archived") return { kind: "not_article", post, message: "This post is archived in beehiiv, so it won't be imported." };

  // 3) The URL the importer would use — free, or held by something else (any status, including drafts and deleted articles).
  const target = importSlugRoot(post.slug || p.title || "");
  const path = `/articles/${target}/`;
  const taken = await db.article.findFirst({ where: { OR: [{ slug: target }, { legacyPath: path }] }, select: articleSelect });
  if (taken) {
    const conflict = summarizeArticle(taken);
    const what = taken.deletedAt ? "a deleted article" : taken.status === "PUBLISHED" ? "a published article" : `an article with status ${taken.status.toLowerCase()}`;
    return {
      kind: "conflict", post, slug: target, url: absoluteUrl(path), conflict,
      message: `${absoluteUrl(path)} is already used by ${what} (“${taken.title}”). If imported now, this post would get a different URL ending in -2. Change the slug in beehiiv, or rename or remove the other article, then check again.`,
    };
  }
  return { kind: "available", post, slug: target, url: absoluteUrl(path), slugNote };
}

export type HoldResult = { ok: true; articleId: string; created: boolean } | { ok: false; message: string };

/**
 * Holds the URL for a beehiiv post by linking an article to it at the importer's exact slug (never a -2 fallback).
 * Scheduled or published posts are imported right away (hidden until beehiiv's send time); drafts get a hidden
 * placeholder that later syncs fill in. Idempotent: an already-linked post just returns its article.
 */
export async function holdArticleUrl(postId: string, actorId: string | null, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<HoldResult> {
  const env = beehiivEnv();
  if (!env) return { ok: false, message: "beehiiv isn't connected." };
  let p: BeehiivPost | null;
  try {
    p = await getPost(env, postId, opts.fetchImpl);
  } catch (e) {
    return { ok: false, message: e instanceof BeehiivError ? e.message : "Couldn't reach beehiiv." };
  }
  if (!p) return { ok: false, message: "That beehiiv post no longer exists." };
  const existing = await db.article.findUnique({ where: { beehiivPostId: p.id }, select: { id: true } });
  if (existing) return { ok: true, articleId: existing.id, created: false };
  const now = opts.now ?? new Date();
  if (postRoute(p) !== "article") return { ok: false, message: ROUTE_MESSAGE[postRoute(p)] };
  if (p.status === "archived") return { ok: false, message: "This post is archived in beehiiv." };
  const slug = importSlugRoot(p.slug || p.title || "");

  try {
    if (isLive(p, now.getTime()) || isScheduled(p, now.getTime())) {
      const r = await importPostAsArticle(p, { exactSlug: slug, now });
      await audit(actorId, "beehiiv.article_url_held", "Article", r.articleId, { beehiivPostId: p.id, slug, imported: true });
      return { ok: true, articleId: r.articleId, created: r.outcome === "created" };
    }
    // Draft: a hidden placeholder at the exact slug, linked to the post. Syncs update it in place (dedupe by post id).
    if (await articleSlugTaken(slug)) throw new SlugTakenError(slug);
    const categoryId = await ensureNewsletterCategory();
    const title = sanitizePlain(p.title, 300) || "(untitled)";
    const a = await db.article.create({
      data: { slug, title, content: "", status: "DRAFT", kind: "GENERAL", beehiivPostId: p.id, categories: { connect: { id: categoryId } } },
    });
    await audit(actorId, "beehiiv.article_url_held", "Article", a.id, { beehiivPostId: p.id, slug, imported: false });
    return { ok: true, articleId: a.id, created: true };
  } catch (e) {
    if (e instanceof SlugTakenError || (e as { code?: string }).code === "P2002") {
      const again = await db.article.findUnique({ where: { beehiivPostId: p.id }, select: { id: true } });
      if (again) return { ok: true, articleId: again.id, created: false };
      return { ok: false, message: `/articles/${slug}/ was taken by another article just now. Check the slug again.` };
    }
    return { ok: false, message: (e as Error).message.slice(0, 300) };
  }
}

/** "Bring in now": imports (or refreshes) the linked article from a scheduled or published post without waiting for the sync. */
export async function bringInPostNow(postId: string, actorId: string | null, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<HoldResult> {
  const env = beehiivEnv();
  if (!env) return { ok: false, message: "beehiiv isn't connected." };
  let p: BeehiivPost | null;
  try {
    p = await getPost(env, postId, opts.fetchImpl);
  } catch (e) {
    return { ok: false, message: e instanceof BeehiivError ? e.message : "Couldn't reach beehiiv." };
  }
  if (!p) return { ok: false, message: "That beehiiv post no longer exists." };
  const linked = await db.article.findUnique({ where: { beehiivPostId: p.id }, select: { id: true, slug: true } });
  try {
    const r = await importPostAsArticle(p, { exactSlug: linked ? undefined : importSlugRoot(p.slug || p.title || ""), now: opts.now });
    await audit(actorId, "beehiiv.article_brought_in", "Article", r.articleId, { beehiivPostId: p.id, outcome: r.outcome });
    return { ok: true, articleId: r.articleId, created: r.outcome === "created" };
  } catch (e) {
    if (e instanceof SlugTakenError) return { ok: false, message: `/articles/${e.message}/ is already used by another article.` };
    return { ok: false, message: (e as Error).message.slice(0, 300) };
  }
}

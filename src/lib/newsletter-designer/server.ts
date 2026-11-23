import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl, stripHtml, truncate } from "@/lib/utils";
import { articleHref, businessHref } from "@/lib/links";
import { publishedArticleWhere, publicBusinessWhere } from "@/lib/queries";
import { brandAssetUrl, effectiveBrandLogoUrl } from "@/lib/brand-assets";
import { beehiivEnv, type BeehiivEnv } from "@/lib/beehiiv/client";
import { ARCHIVE_TAG } from "@/lib/beehiiv/sync";
import { beehiivEditUrl, buildDraftPostBody, createDraftPost, getPostState, listRecentDrafts, type DraftBlock } from "@/lib/beehiiv/posts-api";
import { getTemplateId } from "@/lib/newsletter-events";
import { getCurrentForecast } from "@/lib/weather/forecast";
import { dayLine, forecastImagePath, forecastTitle, NWS_FORECAST_PAGE, WEATHER_FEED_PATH } from "@/lib/weather/shared";
import { isRich, renderSegments, sanitizeIntroHtml, type DesignMeta, type RenderContext } from "./render";
import { defaultContent, type DesignContent } from "./types";

// ───────────── render context ─────────────

const SOCIAL_LABEL: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn" };

/** Logo, social links and the current forecast card for rendering (preview, Copy HTML, beehiiv draft). */
export async function designRenderContext(opts: { preview?: boolean } = {}): Promise<RenderContext> {
  const s = await getSettings();
  const logo = brandAssetUrl("logo-sm.png", effectiveBrandLogoUrl(s), s.brandIconUrl);
  const forecast = await getCurrentForecast().catch(() => null);
  const socials = Object.entries(s.socials ?? {})
    .filter(([k, v]) => SOCIAL_LABEL[k] && typeof v === "string" && /^https?:\/\//i.test(v))
    .map(([k, v]) => ({ label: SOCIAL_LABEL[k], url: v as string }));
  return {
    siteUrl: absoluteUrl("/").replace(/\/$/, ""),
    logoUrl: logo ? absoluteUrl(logo) : null,
    weather: forecast && forecast.days.length
      ? { imageUrl: absoluteUrl(forecastImagePath(forecast.id)), alt: `${forecastTitle(forecast.days)}. ${forecast.days.map(dayLine).join(" ")}`, linkUrl: NWS_FORECAST_PAGE }
      : null,
    socials,
    preview: opts.preview,
  };
}

// ───────────── validation (everything saved is plain text, sanitized rich text or http(s) URLs) ─────────────
// No editorial limits on length or number of items: the ceilings below only stop runaway/abusive payloads
// (a single issue would be far past Gmail's ~102 KB clipping point long before reaching them).

const LINE = 2_000;      // headings, titles, names, labels
const TEXT = 100_000;    // any text body
const ITEMS = 500;       // stories / events per section
const str = (max = LINE) => z.string().max(max * 4).transform((v) => sanitizePlain(v, max));
/** Rich (editor HTML → allowlist-sanitized) or plain text (newlines kept). */
const rich = (max = TEXT) => z.string().max(max * 2).transform((v) => (isRich(v) ? sanitizeIntroHtml(v).slice(0, max) : v.replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n").slice(0, max).trim()));
const url = z.string().max(2000).transform((v) => {
  const t = v.trim();
  if (!t) return "";
  if (t.startsWith("/") && !t.startsWith("//")) return t;
  try { const u = new URL(t); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : ""; } catch { return ""; }
});
const id = z.string().max(40).regex(/^[a-z0-9]+$/i);
const story = z.object({ id, articleId: z.string().max(40).nullish(), title: str(), description: rich(), imageUrl: url, url });
const event = z.object({ id, title: str(), date: z.string().max(10).regex(/^(\d{4}-\d{2}-\d{2})?$/), time: str(), location: str(), description: rich(), imageUrl: url, url });
const business = z.object({ businessId: z.string().max(40).nullish(), name: str(), imageUrl: url, text: rich(), url });
const base = { id, enabled: z.boolean() };
const section = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("intro"), heading: str(), html: z.string().max(TEXT * 2), signature: str() }),
  z.object({ ...base, type: z.literal("featured"), heading: str(), story: story.nullable(), ctaLabel: str() }),
  z.object({ ...base, type: z.literal("sponsor") }),
  z.object({ ...base, type: z.literal("weather"), heading: str() }),
  z.object({ ...base, type: z.literal("events"), heading: str(), items: z.array(event).max(ITEMS) }),
  z.object({ ...base, type: z.literal("articles"), heading: str(), items: z.array(story).max(ITEMS) }),
  z.object({ ...base, type: z.literal("spotlight"), heading: str(), business: business.nullable() }),
  z.object({ ...base, type: z.literal("promo"), heading: str(), text: rich(), ctaLabel: str(), ctaUrl: url }),
  z.object({ ...base, type: z.literal("custom"), heading: str(), title: str(), html: rich(), imageUrl: url, imageLink: url, ctaLabel: str(), ctaUrl: url }),
]);
const contentSchema = z.object({ version: z.literal(1), sections: z.array(section).max(200) });

export const designInput = z.object({
  title: str(),
  previewText: z.string().max(LINE * 4).nullish().transform((v) => sanitizePlain(v ?? "", LINE)),
  issueNumber: z.union([z.number().int().min(1).max(99999), z.null()]),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: contentSchema,
});
export type DesignInput = z.infer<typeof designInput>;

/** Validated, cleaned content (intro HTML sanitized to the allowlist). */
export function cleanContent(c: z.infer<typeof contentSchema>): DesignContent {
  return {
    version: 1,
    sections: c.sections.map((s) => (s.type === "intro" ? { ...s, html: sanitizeIntroHtml(s.html) } : s)) as DesignContent["sections"],
  };
}

export function readContent(json: unknown): DesignContent {
  const r = contentSchema.safeParse(json);
  return r.success ? cleanContent(r.data) : defaultContent();
}

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);
export const toMeta = (r: { title: string; previewText: string | null; issueNumber: number | null; issueDate: Date; content: unknown }): DesignMeta =>
  ({ title: r.title, previewText: r.previewText, issueNumber: r.issueNumber, issueDate: dateKey(r.issueDate), content: readContent(r.content) });

export async function nextIssueNumber() {
  const max = await db.newsletterDesign.aggregate({ _max: { issueNumber: true } });
  return (max._max.issueNumber ?? 0) + 1;
}

// ───────────── pickers ─────────────

export type PickedStory = { articleId: string; title: string; description: string; imageUrl: string; url: string; publishedAt: string | null };

export async function searchArticles(q: string): Promise<PickedStory[]> {
  const t = q.trim().slice(0, 100);
  const rows = await db.article.findMany({
    where: publishedArticleWhere(t ? { OR: [{ title: { contains: t, mode: "insensitive" } }, { excerpt: { contains: t, mode: "insensitive" } }] } : {}),
    orderBy: { publishedAt: "desc" }, take: 12,
    select: { id: true, title: true, slug: true, legacyPath: true, excerpt: true, content: true, featuredImageUrl: true, publishedAt: true },
  });
  return rows.map((a) => ({
    articleId: a.id, title: sanitizePlain(a.title, 200),
    // The full excerpt (no cut-off); articles without one start with the opening of the story — "Use full
    // article text" in the editor brings in the whole thing.
    description: sanitizePlain(a.excerpt, TEXT) || truncate(stripHtml(a.content ?? ""), 600),
    imageUrl: a.featuredImageUrl ? absoluteUrl(a.featuredImageUrl) : "",
    url: absoluteUrl(articleHref(a)), publishedAt: a.publishedAt?.toISOString() ?? null,
  }));
}

/** The whole article body as editor-ready rich text (paragraphs, bold, links, lists; headings become bold lines). */
export async function articleFullText(articleId: string): Promise<string | null> {
  const a = await db.article.findFirst({ where: publishedArticleWhere({ id: articleId.slice(0, 40) }), select: { content: true } });
  return a ? sanitizeIntroHtml(a.content ?? "", absoluteUrl("/").replace(/\/$/, "")) : null;
}

export type PickedBusiness = { businessId: string; name: string; imageUrl: string; text: string; url: string; city: string | null };

export async function searchBusinesses(q: string): Promise<PickedBusiness[]> {
  const t = q.trim().slice(0, 100);
  const rows = await db.business.findMany({
    where: publicBusinessWhere(t ? { name: { contains: t, mode: "insensitive" } } : {}),
    orderBy: { name: "asc" }, take: 12,
    select: { id: true, name: true, slug: true, city: true, tagline: true, description: true, coverUrl: true, logoUrl: true },
  });
  return rows.map((b) => ({
    businessId: b.id, name: sanitizePlain(b.name, 160), city: b.city,
    imageUrl: b.coverUrl ? absoluteUrl(b.coverUrl) : b.logoUrl ? absoluteUrl(b.logoUrl) : "",
    text: sanitizePlain(b.tagline, TEXT) || stripHtml(b.description ?? "").slice(0, TEXT),
    url: absoluteUrl(businessHref(b)),
  }));
}

// ───────────── beehiiv ─────────────

export type WeatherMode = "rss" | "snapshot";
type DesignerBlock = DraftBlock | Record<string, unknown>;

/**
 * beehiiv blocks for an issue: html blocks for the design, a paragraph marking the sponsor slot (you add the Ad
 * Network ad there in beehiiv), and the weather either as an RSS block on the weather feed (refresh it in beehiiv
 * before sending) or as a snapshot image of the current forecast.
 */
export function beehiivBlocks(meta: DesignMeta, ctx: RenderContext, weatherMode: WeatherMode): DesignerBlock[] {
  const blocks: DesignerBlock[] = [];
  for (const seg of renderSegments(meta, { ...ctx, preview: false })) {
    if (seg.kind === "html") blocks.push({ type: "html", html: seg.html });
    else if (seg.kind === "sponsor") {
      blocks.push({ type: "paragraph", textAlignment: "center", formattedText: [{ text: "▶ SPONSOR: add your beehiiv Ad Network ad here, then delete this line.", styling: ["bold"], text_color: "#FF8508" }] });
    } else {
      if (seg.headingHtml) blocks.push({ type: "html", html: seg.headingHtml });
      if (weatherMode === "snapshot") {
        if (seg.snapshotHtml) blocks.push({ type: "html", html: seg.snapshotHtml });
      } else {
        blocks.push({
          type: "rss", rssFeedUrl: absoluteUrl(WEATHER_FEED_PATH), articlesToShow: 1, articleLayout: "1-col", selectionMode: "count", refreshOnSend: true,
          showArticleThumbnail: true, showArticleTitle: false, showDescription: false, showContent: false, showPublishedDate: false, showAuthor: false,
          showCategories: false, showCta: false, ctaStyle: "Thumbnail as link", thumbnailPosition: "Above Title",
        });
      }
    }
  }
  return blocks;
}

export type SendResult = { ok: boolean; message: string; editUrl?: string };

/**
 * Sends the saved issue to beehiiv as a DRAFT (never published, scheduled or sent — same safe client as the
 * Newsletter Events tool). One attempt at a time per issue; an unclear outcome is never retried automatically.
 */
export async function sendDesignToBeehiiv(designId: string, opts: { userId: string | null; weatherMode: WeatherMode; archiveTag: boolean; sendAgain: boolean; fetchImpl?: typeof fetch }): Promise<SendResult> {
  const env = beehiivEnv();
  if (!env) return { ok: false, message: "beehiiv isn't connected (BEEHIIV_API_KEY and BEEHIIV_PUBLICATION_ID)." };
  const row = await db.newsletterDesign.findUnique({ where: { id: designId } });
  if (!row) return { ok: false, message: "Newsletter not found." };
  if (!row.title.trim()) return { ok: false, message: "Add an email subject first." };
  if (row.beehiivStatus === "unknown") return { ok: false, message: "The last send's outcome is unknown. Use “Check beehiiv” first so a duplicate draft isn't created." };
  if (row.beehiivStatus === "created" && !opts.sendAgain) return { ok: false, message: "This issue is already in beehiiv. Tick “Send a new draft anyway” to create another draft." };

  // Claim: only one send at a time for this issue.
  const claimed = await db.newsletterDesign.updateMany({ where: { id: row.id, beehiivStatus: { not: "pending" } }, data: { beehiivStatus: "pending", beehiivMessage: null } });
  if (!claimed.count) return { ok: false, message: "This issue is already being sent to beehiiv. Wait a moment and reload." };

  const ctx = await designRenderContext();
  const meta = toMeta(row);
  let body;
  try {
    body = buildDraftPostBody({
      title: row.title, subtitle: row.previewText, blocks: beehiivBlocks(meta, ctx, opts.weatherMode) as DraftBlock[],
      contentTags: opts.archiveTag ? [ARCHIVE_TAG] : [], templateId: await getTemplateId(),
    });
  } catch (e) {
    await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivStatus: row.beehiivStatus === "created" ? "created" : "failed", beehiivMessage: (e as Error).message.slice(0, 300) } });
    return { ok: false, message: (e as Error).message };
  }
  const outcome = await createDraftPost(env as BeehiivEnv, body, opts.fetchImpl).catch((e) => ({ kind: "not_sent" as const, message: (e as Error).message.slice(0, 200) }));
  const auditBase = { title: row.title, weatherMode: opts.weatherMode, archiveTag: opts.archiveTag, status: "draft" };
  if (outcome.kind === "created") {
    await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivStatus: "created", beehiivPostId: outcome.postId, beehiivSentAt: new Date(), beehiivMessage: null } });
    await audit(opts.userId, "newsletter.design_draft_created", "NewsletterDesign", row.id, { ...auditBase, postId: outcome.postId });
    await new Promise((r) => setTimeout(r, 800));
    const state = await getPostState(env as BeehiivEnv, outcome.postId, opts.fetchImpl).catch(() => null);
    if (state?.state === "failed") {
      await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivMessage: `beehiiv accepted the draft but reported: ${state.message}` } });
      return { ok: false, message: `beehiiv accepted the draft but then reported it couldn't finish it (${state.message}). If the weather RSS block is the problem, send again with “Forecast image” instead.`, editUrl: beehiivEditUrl(outcome.postId) };
    }
    return { ok: true, message: "Draft created in beehiiv. Add your sponsor ad, review it, and send from beehiiv.", editUrl: beehiivEditUrl(outcome.postId) };
  }
  if (outcome.kind === "ambiguous") {
    await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivStatus: "unknown", beehiivMessage: outcome.message } });
    await audit(opts.userId, "newsletter.design_draft_unknown", "NewsletterDesign", row.id, { ...auditBase, reason: outcome.message });
    return { ok: false, message: `${outcome.message} It wasn't retried, so no duplicate is created. Use “Check beehiiv”.` };
  }
  const hint = opts.weatherMode === "rss" ? " If beehiiv rejected the weather RSS block, choose “Forecast image” and send again." : "";
  await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivStatus: row.beehiivStatus === "created" ? "created" : "failed", beehiivMessage: outcome.message } });
  await audit(opts.userId, "newsletter.design_draft_failed", "NewsletterDesign", row.id, { ...auditBase, reason: outcome.message });
  return { ok: false, message: `${outcome.message}${hint}` };
}

/** After an unclear send: look for exactly one recent beehiiv draft with this issue's title. */
export async function checkDesignInBeehiiv(designId: string, userId: string | null, fetchImpl?: typeof fetch): Promise<SendResult> {
  const env = beehiivEnv();
  if (!env) return { ok: false, message: "beehiiv isn't connected." };
  const row = await db.newsletterDesign.findUnique({ where: { id: designId } });
  if (!row || row.beehiivStatus !== "unknown") return { ok: false, message: "Nothing to check for this issue." };
  const list = await listRecentDrafts(env as BeehiivEnv, fetchImpl);
  if (!list.ok) return { ok: false, message: list.message };
  const matches = list.drafts.filter((d) => d.title === row.title);
  if (matches.length === 1) {
    await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivStatus: "created", beehiivPostId: matches[0].id, beehiivSentAt: new Date(), beehiivMessage: null } });
    await audit(userId, "newsletter.design_draft_recovered", "NewsletterDesign", row.id, { postId: matches[0].id });
    return { ok: true, message: "Found the draft in beehiiv.", editUrl: beehiivEditUrl(matches[0].id) };
  }
  if (matches.length === 0) {
    await db.newsletterDesign.update({ where: { id: row.id }, data: { beehiivStatus: "failed", beehiivMessage: "No matching draft found in beehiiv." } });
    return { ok: true, message: "No draft with this title was found in beehiiv, so it wasn't created. You can send it again." };
  }
  return { ok: false, message: `Found ${matches.length} drafts with this title in beehiiv. Check beehiiv's Drafts and delete any duplicates.` };
}

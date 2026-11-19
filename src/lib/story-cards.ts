import "server-only";
import { db } from "./db";
import { stripHtml, truncate } from "./utils";

export type StoryImageFit = "cover" | "contain";

/** Pathname of a stored image URL ("/media/…" or "https://host/media/…"), lower-cased, without query/hash. */
function imagePath(url: string) {
  try { return new URL(url, "http://local").pathname.toLowerCase(); } catch { return url.toLowerCase(); }
}

const LOGO_MIME = new Set(["image/png", "image/svg+xml"]);

/**
 * Photo vs logo/graphic for a story's featured image — no new fields, decided from data we already store:
 *  1. the featured image is the logo (`Business.logoUrl`) of a business linked to the story (ArticleBusiness) → logo;
 *  2. it is an SVG (by extension or its Media record) → logo;
 *  3. its Media record (matched by URL) is a PNG with a near-square shape (0.8 ≤ width/height ≤ 1.25) → logo;
 *  4. anything else → photo.
 * Logos are shown whole (object-contain on a light panel); photos fill the frame (object-cover).
 */
export function decideImageFit(url: string, linkedLogoUrls: (string | null | undefined)[], media?: { mimeType: string; width: number | null; height: number | null } | null): StoryImageFit {
  const path = imagePath(url);
  if (linkedLogoUrls.some((l) => l && imagePath(l) === path)) return "contain";
  if (path.endsWith(".svg") || media?.mimeType === "image/svg+xml") return "contain";
  if (media && LOGO_MIME.has(media.mimeType) && media.width && media.height) {
    const r = media.width / media.height;
    if (r >= 0.8 && r <= 1.25) return "contain";
  }
  return "cover";
}

/** Media rows for the given image URLs, keyed by lower-cased pathname. */
async function mediaByPath(urls: string[]) {
  if (!urls.length) return new Map<string, { mimeType: string; width: number | null; height: number | null }>();
  const paths = urls.map(imagePath);
  const rows = await db.media.findMany({
    where: { deletedAt: null, OR: [{ url: { in: urls } }, ...paths.map((p) => ({ url: { endsWith: p, mode: "insensitive" as const } }))] },
    select: { url: true, mimeType: true, width: true, height: true },
  });
  return new Map(rows.map((m) => [imagePath(m.url), m]));
}

/** Image fit for one article's featured image (article page). */
export async function storyImageFit(url: string, linkedLogoUrls: (string | null | undefined)[]): Promise<StoryImageFit> {
  const media = await mediaByPath([url]);
  return decideImageFit(url, linkedLogoUrls, media.get(imagePath(url)));
}

/**
 * Extras for homepage story cards: the featured-image fit (see `decideImageFit`) and an excerpt
 * (Article.excerpt, else the stripped body text). Three small queries for the whole section.
 */
export async function getStoryCardExtras(articles: { id: string; excerpt?: string | null; featuredImageUrl?: string | null }[]) {
  const ids = articles.map((a) => a.id);
  const urls = articles.map((a) => a.featuredImageUrl).filter((u): u is string => !!u);
  const needBody = articles.filter((a) => !a.excerpt || !stripHtml(a.excerpt)).map((a) => a.id);
  const [links, media, bodies] = await Promise.all([
    urls.length ? db.articleBusiness.findMany({ where: { articleId: { in: ids } }, select: { articleId: true, business: { select: { logoUrl: true } } } }) : [],
    mediaByPath(urls),
    needBody.length ? db.article.findMany({ where: { id: { in: needBody } }, select: { id: true, content: true } }) : [],
  ]);
  const body = new Map(bodies.map((b) => [b.id, b.content]));
  const out: Record<string, { fit: StoryImageFit; excerpt: string | null }> = {};
  for (const a of articles) {
    const logos = links.filter((l) => l.articleId === a.id).map((l) => l.business.logoUrl);
    const text = stripHtml(a.excerpt || "") || stripHtml(body.get(a.id) || "");
    out[a.id] = {
      fit: a.featuredImageUrl ? decideImageFit(a.featuredImageUrl, logos, media.get(imagePath(a.featuredImageUrl))) : "cover",
      excerpt: text ? truncate(text, 220) : null,
    };
  }
  return out;
}

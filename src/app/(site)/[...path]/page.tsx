import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { businessHref, pageHref } from "@/lib/links";
import { stripHtml } from "@/lib/utils";
import { publicBusinessWhere } from "@/lib/queries";
import { ArticleView } from "@/components/public/article-view";
import { PageView } from "@/components/public/page-view";
import { articleMetadata, findPublishedArticle, getRelatedArticles } from "@/components/public/article-data";
import { followRedirectIfAny, isSaved, pathCandidates } from "@/components/public/server";
import { buildMetadata } from "@/components/public/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path: string[] }> };

function rawPath(segments: string[]) {
  return "/" + segments.map((s) => { try { return decodeURIComponent(s); } catch { return s; } }).join("/") + "/";
}

/**
 * Resolves a legacy WordPress URL: published article → published page → business.
 * Everything else falls through to the Redirect table, then 404.
 */
async function resolve(segments: string[]) {
  const raw = rawPath(segments);
  const candidates = pathCandidates(raw);
  const article = await findPublishedArticle({ legacyPath: { in: candidates } });
  if (article) return { kind: "article" as const, article, raw };

  const slug = segments.length === 1 ? segments[0].toLowerCase() : null;
  const page = await db.page.findFirst({
    where: {
      status: "PUBLISHED",
      deletedAt: null,
      OR: [{ legacyPath: { in: candidates } }, ...(slug ? [{ slug }] : [])],
    },
  });
  if (page) return { kind: "page" as const, page, raw };

  const business = await db.business.findFirst({ where: publicBusinessWhere({ legacyPath: { in: candidates } }), select: { slug: true } });
  if (business) return { kind: "business" as const, business, raw };
  return { kind: "none" as const, raw };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolve((await params).path);
  if (r.kind === "article") return articleMetadata(r.article);
  if (r.kind === "page") {
    return buildMetadata({
      title: stripHtml(r.page.seoTitle || r.page.title),
      description: r.page.seoDescription || stripHtml(r.page.content).slice(0, 300),
      path: pageHref(r.page),
      image: r.page.featuredImageUrl,
      absoluteTitle: !!r.page.seoTitle,
    });
  }
  return {};
}

export default async function LegacyPathPage({ params }: Props) {
  const { path } = await params;
  const r = await resolve(path);

  if (r.kind === "article") {
    const [related, saved] = await Promise.all([getRelatedArticles(r.article), isSaved("ARTICLE", r.article.id)]);
    return <ArticleView article={r.article} related={related} saved={saved} />;
  }
  if (r.kind === "page") {
    // Page found by slug while it has a different canonical legacy path → send to the canonical URL.
    const canonical = pageHref(r.page);
    if (!pathCandidates(r.raw).includes(canonical) && r.page.legacyPath) permanentRedirect(canonical);
    return <PageView page={r.page} />;
  }
  if (r.kind === "business") permanentRedirect(businessHref(r.business));

  await followRedirectIfAny(r.raw);

  // WordPress taxonomy archives → filtered article listings.
  const [first, second] = path.map((s) => s.toLowerCase());
  if (path.length === 2 && (first === "category" || first === "tag")) {
    const exists = first === "category"
      ? await db.category.findUnique({ where: { slug: second }, select: { id: true } })
      : await db.tag.findUnique({ where: { slug: second }, select: { id: true } });
    if (exists) permanentRedirect(`/articles/?${first}=${encodeURIComponent(second)}`);
  }
  notFound();
}

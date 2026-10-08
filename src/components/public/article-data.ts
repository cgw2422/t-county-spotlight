import "server-only";
import { db } from "@/lib/db";
import { articleCardSelect, businessCardSelect, publishedArticleWhere } from "@/lib/queries";
import type { Prisma } from "@/generated/prisma/client";
import { buildMetadata } from "./seo";
import { articleHref } from "@/lib/links";
import { stripHtml } from "@/lib/utils";

export const articleViewInclude = {
  categories: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
  author: { select: { name: true } },
  businesses: { include: { business: { select: { ...businessCardSelect, status: true, deletedAt: true, phone: true, address: true } } } },
} satisfies Prisma.ArticleInclude;

export type ArticleForView = Prisma.ArticleGetPayload<{ include: typeof articleViewInclude }>;

export async function findPublishedArticle(where: Prisma.ArticleWhereInput) {
  return db.article.findFirst({ where: publishedArticleWhere(where), include: articleViewInclude });
}

/** Related reading: same featured business first, then same category, then same kind. */
export async function getRelatedArticles(a: ArticleForView, limit = 3) {
  const businessIds = a.businesses.map((b) => b.businessId);
  const categoryIds = a.categories.map((c) => c.id);
  const or: Prisma.ArticleWhereInput[] = [];
  if (businessIds.length) or.push({ businesses: { some: { businessId: { in: businessIds } } } });
  if (categoryIds.length) or.push({ categories: { some: { id: { in: categoryIds } } } });
  const primary = or.length
    ? await db.article.findMany({ where: publishedArticleWhere({ id: { not: a.id }, OR: or }), orderBy: { publishedAt: "desc" }, take: limit, select: articleCardSelect })
    : [];
  if (primary.length >= limit) return primary;
  const more = await db.article.findMany({
    where: publishedArticleWhere({ id: { notIn: [a.id, ...primary.map((p) => p.id)] }, kind: a.kind }),
    orderBy: { publishedAt: "desc" }, take: limit - primary.length, select: articleCardSelect,
  });
  return [...primary, ...more];
}

export const KIND_SECTIONS: Record<string, { label: string; href: string }> = {
  SPOTLIGHT: { label: "Spotlights", href: "/spotlights/" },
  ANNOUNCEMENT: { label: "Announcements", href: "/announcements/" },
  THINGS_TO_DO: { label: "Things to Do", href: "/things-to-do/" },
  NEWS: { label: "Articles", href: "/articles/" },
  GENERAL: { label: "Articles", href: "/articles/" },
};


export function articleMetadata(a: ArticleForView) {
  return buildMetadata({
    title: stripHtml(a.seoTitle || a.title),
    description: a.seoDescription || a.excerpt || stripHtml(a.content).slice(0, 300),
    path: articleHref(a),
    image: a.ogImageUrl || a.featuredImageUrl,
    type: "article",
    publishedTime: a.publishedAt,
    modifiedTime: a.localEditedAt ?? a.wpModifiedAt ?? a.updatedAt,
    absoluteTitle: !!a.seoTitle,
  });
}

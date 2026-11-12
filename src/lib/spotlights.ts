import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
import { publishedArticleWhere } from "./queries";

/**
 * A business is "in the spotlight" only while it is linked (ArticleBusiness) to a
 * published Business Spotlight article. Derived at query time — unpublishing,
 * deleting or re-typing the story removes the badge. The legacy
 * `Business.isSpotlighted` column is no longer read or written by the app.
 */
export const publishedSpotlightArticleWhere = (extra: Prisma.ArticleWhereInput = {}): Prisma.ArticleWhereInput =>
  publishedArticleWhere({ kind: "SPOTLIGHT", ...extra });

/** Business `where` fragment: has at least one published spotlight story. */
export const hasPublishedSpotlightWhere = (): Prisma.BusinessWhereInput => ({
  articles: { some: { article: publishedSpotlightArticleWhere() } },
});

/** Include on business selects; feed the result to `spotlightFrom()`. Most recent story first. */
export const spotlightArticlesSelect = () =>
  ({
    where: { article: publishedSpotlightArticleWhere() },
    orderBy: [{ article: { publishedAt: "desc" } }, { articleId: "asc" }],
    take: 1,
    select: { article: { select: { id: true, title: true, slug: true, legacyPath: true, publishedAt: true } } },
  }) satisfies Prisma.Business$articlesArgs;

export { spotlightFrom, type SpotlightLink } from "./spotlights-shared";

export type BusinessSpotlightArticle = { id: string; title: string; status: string; publishedAt: Date | null; live: boolean };

/** Admin: every (non-deleted) Spotlight article linked to a business, newest first, with whether it currently drives the badge. */
export async function getBusinessSpotlightArticles(businessId: string): Promise<BusinessSpotlightArticle[]> {
  const [all, live] = await Promise.all([
    db.article.findMany({
      where: { kind: "SPOTLIGHT", deletedAt: null, businesses: { some: { businessId } } },
      orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      select: { id: true, title: true, status: true, publishedAt: true },
    }),
    db.article.findMany({ where: publishedSpotlightArticleWhere({ businesses: { some: { businessId } } }), select: { id: true } }),
  ]);
  const liveIds = new Set(live.map((a) => a.id));
  return all.map((a) => ({ ...a, live: liveIds.has(a.id) }));
}

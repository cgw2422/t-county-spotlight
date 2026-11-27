import "server-only";
import { db } from "@/lib/db";
import { articleHref } from "@/lib/links";
import { absoluteUrl } from "@/lib/utils";
import type { PickedStory } from "@/lib/newsletter-designer/server";
import { publicGovWatchEnabled } from "./settings";

/**
 * Approved Government Watch stories (marked Reviewed or Published) for the newsletter designer. The link goes to
 * the published article when there is one, else the public Government Watch page (when live), else the original
 * record on the government website.
 */
export async function searchGovStories(q: string): Promise<PickedStory[]> {
  const t = q.trim().slice(0, 100);
  const rows = await db.govFinding.findMany({
    where: {
      reviewStatus: { in: ["reviewed", "published"] },
      ...(t ? { OR: [{ headline: { contains: t, mode: "insensitive" } }, { detail: { contains: t, mode: "insensitive" } }] } : {}),
    },
    orderBy: { updatedAt: "desc" }, take: 15,
    select: { id: true, headline: true, detail: true, articleId: true, document: { select: { id: true, sourceUrl: true, storageUrl: true, reviewStatus: true, meetingDate: true, source: { select: { name: true } } } } },
  });
  const articleIds = [...new Set(rows.map((r) => r.articleId).filter((x): x is string => !!x))];
  const articles = new Map((articleIds.length ? await db.article.findMany({ where: { id: { in: articleIds }, status: "PUBLISHED", deletedAt: null }, select: { id: true, slug: true, legacyPath: true, featuredImageUrl: true } }) : []).map((a) => [a.id, a]));
  const live = await publicGovWatchEnabled();
  return rows.map((r) => {
    const a = r.articleId ? articles.get(r.articleId) : undefined;
    const url = a ? absoluteUrl(articleHref(a))
      : live && r.document.reviewStatus === "reviewed" ? absoluteUrl(`/government-watch/documents/${r.document.id}/`)
      : r.document.sourceUrl ?? absoluteUrl(r.document.storageUrl);
    return {
      articleId: a?.id ?? "", title: r.headline, description: `${r.detail}${r.document.source ? ` (${r.document.source.name}${r.document.meetingDate ? `, ${r.document.meetingDate.toISOString().slice(0, 10)}` : ""})` : ""}`,
      imageUrl: a?.featuredImageUrl ? absoluteUrl(a.featuredImageUrl) : "", url, publishedAt: null,
    };
  });
}

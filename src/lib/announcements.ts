import "server-only";
import { db } from "./db";
import { articleCardSelect, notExpiredAnnouncementWhere, publishedArticleWhere } from "./queries";
import { prioritizeByCommunity } from "./my-t-county-shared";

export { notExpiredAnnouncementWhere };

const select = { ...articleCardSelect, city: true, expiresAt: true } as const;

/**
 * Homepage "Community Updates": pinned items first, then current (not expired)
 * announcements, community-first when a community is chosen.
 */
export async function getHomepageAnnouncements(featuredIds: string[], limit: number, communities: (string | null)[]) {
  const current = notExpiredAnnouncementWhere();
  const [featured, rest] = await Promise.all([
    featuredIds.length ? db.article.findMany({ where: publishedArticleWhere({ AND: [{ id: { in: featuredIds } }, current] }), select }) : [],
    db.article.findMany({ where: publishedArticleWhere({ AND: [{ kind: "ANNOUNCEMENT" }, current] }), orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }], take: 40, select }),
  ]);
  const order = new Map(featuredIds.map((id, i) => [id, i]));
  const pinned = [...featured].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const seen = new Set(pinned.map((x) => x.id));
  const ordered = prioritizeByCommunity(rest.filter((x) => !seen.has(x.id)), (a) => a.city, communities);
  return [...pinned, ...ordered].slice(0, limit);
}

export function isExpiredAnnouncement(a: { expiresAt: Date | null }, now = new Date()) {
  return !!a.expiresAt && a.expiresAt.getTime() <= now.getTime();
}

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { attributeWhere } from "./events";
import { getArticlesForSection, getUpcomingOccurrences } from "./queries";
import { getPublicCollections } from "./explore-collections";
import { SEASON_EVENT_ATTRIBUTES, SEASON_KEYWORDS, SEASON_LINKS, type Season, type SeasonPicks } from "./seasons";

/**
 * "Around T County This Season": real, currently public records only —
 * admin-pinned collections/articles/events first, then upcoming events that
 * match the season's attribute filters or keywords, published Explore
 * collections and Things to Do articles whose title mentions the season.
 * Nothing is invented; an empty result hides the section.
 */
export async function getSeasonalPicks(season: Season, picks: SeasonPicks, limits = { events: 4, collections: 3, articles: 3 }, now = new Date()) {
  const kw = SEASON_KEYWORDS[season];
  const titleMatch = (field: "title") => kw.map((k) => ({ [field]: { contains: k, mode: "insensitive" as const } }));
  const attrWheres = SEASON_EVENT_ATTRIBUTES[season].map((k) => attributeWhere(k)).filter((w): w is Prisma.EventWhereInput => !!w);
  const to = new Date(now.getTime() + 90 * 86400_000);

  const [pinnedEvents, autoEvents, collections, articles] = await Promise.all([
    picks.eventIds.length ? getUpcomingOccurrences({ from: now, to: new Date(now.getTime() + 400 * 86400_000), where: { id: { in: picks.eventIds } } }) : Promise.resolve([]),
    getUpcomingOccurrences({ from: now, to, limit: limits.events + picks.eventIds.length, where: { OR: [...attrWheres, ...titleMatch("title")] } }),
    getPublicCollections(now),
    getArticlesForSection({ kind: "THINGS_TO_DO", OR: titleMatch("title") }, picks.articleIds, limits.articles),
  ]);

  const order = new Map(picks.eventIds.map((id, i) => [id, i]));
  const seen = new Set<string>();
  const events = [...pinnedEvents.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)), ...autoEvents]
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .slice(0, limits.events);

  const corder = new Map(picks.collectionIds.map((id, i) => [id, i]));
  const re = new RegExp(`\\b(${kw.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const pinnedCols = collections.filter((c) => corder.has(c.id)).sort((a, b) => corder.get(a.id)! - corder.get(b.id)!);
  const autoCols = collections.filter((c) => !corder.has(c.id) && re.test(`${c.title} ${c.description ?? ""}`));
  const cols = [...pinnedCols, ...autoCols].slice(0, limits.collections);

  return { events, collections: cols, articles, links: SEASON_LINKS[season], isEmpty: !events.length && !cols.length && !articles.length };
}

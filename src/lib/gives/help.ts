import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { HELP_TYPES, helpType, needCityWhere, opportunityCityWhere, type HelpTypeKey } from "@/lib/gives";
import { activeSignupCounts, needCardSelect, openNeedWhere, openOpportunityWhere, opportunityCardSelect, pledgedTotals, spotsLeft } from "./queries";

export type HelpSort = "urgency" | "deadline";

type NeedRow = Prisma.CommunityNeedGetPayload<{ select: typeof needCardSelect }>;
type OppRow = Prisma.VolunteerOpportunityGetPayload<{ select: typeof opportunityCardSelect }>;

export type HelpItem =
  | { kind: "need"; id: string; endsAt: Date | null; rank: number; need: NeedRow; pledged?: number }
  | { kind: "opportunity"; id: string; endsAt: Date | null; rank: number; opp: OppRow; left: number | null };

const URGENCY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
/** Opportunities carry no urgency; they sort with medium-urgency needs. */
const OPPORTUNITY_RANK = 2;

function byEnd(a: HelpItem, b: HelpItem) {
  if (a.endsAt && b.endsAt) return a.endsAt.getTime() - b.endsAt.getTime();
  return a.endsAt ? -1 : b.endsAt ? 1 : 0;
}

/**
 * Current ways to help — open needs and upcoming/ongoing volunteer
 * opportunities from public organizations, merged into one list. Expired
 * needs (deadline before today, New York time) and ended, non-ongoing
 * opportunities are excluded by `openNeedWhere` / `openOpportunityWhere`.
 */
export async function getWaysToHelp(opts: { city?: string | null; type?: HelpTypeKey | null; sort?: HelpSort; take?: number } = {}) {
  const { city = null, sort = "urgency", take = 24 } = opts;
  const t = helpType(opts.type ?? null);
  const needAnd: Prisma.CommunityNeedWhereInput[] = [];
  if (city) needAnd.push(needCityWhere(city));
  const needCityOnly = openNeedWhere(needAnd.length ? { AND: needAnd } : {});
  if (t) needAnd.push({ category: { in: [...t.categories] } });
  const needWhere = openNeedWhere(needAnd.length ? { AND: needAnd } : {});
  const oppWhere = openOpportunityWhere(city ? opportunityCityWhere(city) : {});
  const wantOpps = !t || t.key === "volunteer";

  const [needs, opps, catGroups, oppCount] = await Promise.all([
    db.communityNeed.findMany({
      where: needWhere, select: needCardSelect, take: Math.min(take * 2, 120),
      orderBy: sort === "deadline" ? [{ deadline: { sort: "asc", nulls: "last" } }, { urgency: "desc" }] : [{ urgency: "desc" }, { deadline: { sort: "asc", nulls: "last" } }],
    }),
    wantOpps
      ? db.volunteerOpportunity.findMany({ where: oppWhere, select: opportunityCardSelect, take: Math.min(take * 2, 120), orderBy: [{ isOngoing: "asc" }, { endAt: { sort: "asc", nulls: "last" } }, { startAt: { sort: "asc", nulls: "last" } }] })
      : Promise.resolve([] as OppRow[]),
    db.communityNeed.groupBy({ by: ["category"], where: needCityOnly, _count: { _all: true } }),
    db.volunteerOpportunity.count({ where: oppWhere }),
  ]);

  const items: HelpItem[] = [
    ...needs.map((n) => ({ kind: "need" as const, id: n.id, endsAt: n.deadline, rank: URGENCY_RANK[n.urgency] ?? 2, need: n })),
    ...opps.map((o) => ({ kind: "opportunity" as const, id: o.id, endsAt: o.isOngoing ? null : o.endAt ?? o.startAt, rank: OPPORTUNITY_RANK, opp: o, left: null })),
  ];
  items.sort(sort === "deadline" ? (a, b) => byEnd(a, b) || b.rank - a.rank : (a, b) => b.rank - a.rank || byEnd(a, b));
  const shown = items.slice(0, take);

  const [pledged, signups] = await Promise.all([
    pledgedTotals(shown.filter((i) => i.kind === "need").map((i) => i.id)),
    activeSignupCounts(shown.filter((i) => i.kind === "opportunity").map((i) => i.id)),
  ]);
  for (const i of shown) {
    if (i.kind === "need") i.pledged = pledged.get(i.id);
    else i.left = spotsLeft(i.opp.spots, signups.get(i.id) ?? 0);
  }

  const cat = new Map(catGroups.map((g) => [g.category as string, g._count._all]));
  const needTotal = catGroups.reduce((n, g) => n + g._count._all, 0);
  const counts = Object.fromEntries(
    HELP_TYPES.map((ht) => [ht.key, ht.categories.reduce((n, c) => n + (cat.get(c) ?? 0), 0) + (ht.key === "volunteer" ? oppCount : 0)]),
  ) as Record<HelpTypeKey, number>;
  const total = needTotal + oppCount;
  const matching = t ? counts[t.key] : total;
  return { items: shown, counts, total, matching };
}

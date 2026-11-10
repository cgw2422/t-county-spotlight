import "server-only";
import { db } from "@/lib/db";
import { communityName, ALL_COUNTY_LABEL, ALL_COUNTY } from "@/lib/my-t-county-shared";
import { addDaysKey, nyDateKey, startOfNyDay } from "@/components/public/dates";

/**
 * Community analytics: aggregate counts of EngagementEvent rows only.
 * Nothing here reads or returns visitorHash values; "daily visitors" is a
 * COUNT(DISTINCT visitorHash) per day, and the hash already changes every day.
 */

export const ANALYTICS_RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function analyticsRange(key: string | null | undefined): AnalyticsRange {
  return ANALYTICS_RANGES.find((r) => r.key === key) ?? ANALYTICS_RANGES[1];
}

export type CountRow = { label: string; count: number; note?: string };
export type NamedRow = { id: string; name: string; count: number };
export type BusinessRow = { id: string; name: string; views: number; website: number; phone: number; directions: number };
export type SavedRow = { kind: string; id: string; name: string; count: number };
export type DailyRow = { day: string; events: number; visitors: number };

export const EVENTS_VIEW_LABELS: Record<string, string> = {
  today: "Today", tonight: "Tonight", tomorrow: "Tomorrow", weekend: "This weekend", week: "Next 7 days",
  month: "This month", all: "All upcoming", calendar: "Calendar", range: "Custom dates",
};

export const SAVE_KIND_LABELS: Record<string, string> = {
  EVENT: "Events", BUSINESS: "Businesses", PROMOTION: "Specials", GARAGE_SALE: "Garage sales",
  ARTICLE: "Articles", PULSE: "Community Pulse", ORGANIZATION: "Nonprofits & churches",
};

/** Feature usage rows, in the order shown on the dashboard. */
const FEATURES: { type: string; label: string }[] = [
  { type: "view_events_list", label: "Events list views (all quick dates)" },
  { type: "view_event", label: "Event page views" },
  { type: "view_food_trucks", label: "Food Trucks page views" },
  { type: "click_food_truck_directions", label: "Food truck directions clicks" },
  { type: "view_garage_sales", label: "Garage Sales list views" },
  { type: "view_garage_sale", label: "Garage sale page views" },
  { type: "view_my_t_county", label: "My T County views" },
  { type: "view_saved", label: "Saved page views" },
  { type: "save", label: "Saves" },
  { type: "search", label: "Searches" },
  { type: "view_community", label: "Community page views" },
  { type: "view_collection", label: "Explore collection views" },
  { type: "view_gives", label: "T County Gives views" },
  { type: "view_openings", label: "New & Coming Soon views" },
  { type: "view_submit", label: "“Share something” page views" },
  { type: "view_business", label: "Business profile views" },
  { type: "view_promotion", label: "Special views" },
  { type: "view_article", label: "Article views" },
  { type: "view_pulse", label: "Community Pulse views" },
  { type: "view_job", label: "Job views" },
];

const TOP = 10;

type Grouped = { targetId: string | null; _count: { _all: number } };
const toMap = (rows: Grouped[]) => new Map(rows.filter((r) => r.targetId).map((r) => [r.targetId!, r._count._all]));

async function names(kind: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const where = { id: { in: ids } };
  let rows: { id: string; name: string }[] = [];
  switch (kind) {
    case "EVENT": rows = (await db.event.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, name: r.title })); break;
    case "BUSINESS": rows = await db.business.findMany({ where, select: { id: true, name: true } }); break;
    case "GARAGE_SALE": rows = (await db.garageSale.findMany({ where, select: { id: true, title: true, city: true } })).map((r) => ({ id: r.id, name: r.city ? `${r.title} (${r.city})` : r.title })); break;
    case "PROMOTION": rows = (await db.promotion.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, name: r.title })); break;
    case "ARTICLE": rows = (await db.article.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, name: r.title })); break;
    case "PULSE": rows = (await db.communityPulse.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, name: r.title })); break;
    case "ORGANIZATION": rows = await db.organization.findMany({ where, select: { id: true, name: true } }); break;
    case "COLLECTION": rows = (await db.exploreCollection.findMany({ where, select: { id: true, title: true } })).map((r) => ({ id: r.id, name: r.title })); break;
  }
  return new Map(rows.map((r) => [r.id, r.name]));
}

const named = (m: Map<string, number>, n: Map<string, string>, fallback = "(removed)"): NamedRow[] =>
  [...m].map(([id, count]) => ({ id, name: n.get(id) ?? fallback, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export async function getCommunityAnalytics(range: AnalyticsRange, now = new Date()) {
  const todayKey = nyDateKey(now);
  const firstKey = addDaysKey(todayKey, -(range.days - 1));
  const since = startOfNyDay(firstKey); // the range is whole New York calendar days, today included
  const inRange = { createdAt: { gte: since } };
  const BIZ_CLICKS = ["click_website", "click_phone", "click_directions"];

  const [byType, small, savesByKind, topEvents, topBizViews, topBizClicks, topSales, topTrucks, topSaved, daily] = await Promise.all([
    db.engagementEvent.groupBy({ by: ["type"], where: inRange, _count: { _all: true } }),
    // Bounded vocabularies (quick dates, communities, visit kind, PWA prompt kind, collections, search result-type counts).
    db.engagementEvent.groupBy({
      by: ["type", "targetId"],
      where: { ...inRange, type: { in: ["view_events_list", "view_community", "set_community", "visit", "install_prompt_shown", "install_prompt_accepted", "view_collection", "search"] } },
      _count: { _all: true },
    }),
    db.engagementEvent.groupBy({ by: ["targetType"], where: { ...inRange, type: "save" }, _count: { _all: true } }),
    db.engagementEvent.groupBy({ by: ["targetId"], where: { ...inRange, type: "view_event", targetType: "EVENT" }, _count: { _all: true }, orderBy: { _count: { targetId: "desc" } }, take: TOP }),
    db.engagementEvent.groupBy({ by: ["targetId"], where: { ...inRange, type: "view_business", targetType: "BUSINESS" }, _count: { _all: true }, orderBy: { _count: { targetId: "desc" } }, take: TOP }),
    db.engagementEvent.groupBy({ by: ["targetId"], where: { ...inRange, type: { in: BIZ_CLICKS }, targetType: "BUSINESS" }, _count: { _all: true }, orderBy: { _count: { targetId: "desc" } }, take: TOP }),
    db.engagementEvent.groupBy({ by: ["targetId"], where: { ...inRange, type: "view_garage_sale", targetType: "GARAGE_SALE" }, _count: { _all: true }, orderBy: { _count: { targetId: "desc" } }, take: TOP }),
    db.engagementEvent.groupBy({ by: ["targetId"], where: { ...inRange, type: "click_food_truck_directions", targetType: "BUSINESS" }, _count: { _all: true }, orderBy: { _count: { targetId: "desc" } }, take: TOP }),
    db.engagementEvent.groupBy({ by: ["targetType", "targetId"], where: { ...inRange, type: "save" }, _count: { _all: true }, orderBy: { _count: { targetId: "desc" } }, take: TOP }),
    db.$queryRaw<{ day: string; events: bigint; visitors: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York', 'YYYY-MM-DD') AS day,
             COUNT(*) AS events, COUNT(DISTINCT "visitorHash") AS visitors
      FROM "EngagementEvent" WHERE "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1`,
  ]);

  const typeCount = (t: string) => byType.find((r) => r.type === t)?._count._all ?? 0;
  const total = byType.reduce((n, r) => n + r._count._all, 0);
  const sm = (t: string) => small.filter((r) => r.type === t);

  // Feature usage
  const features: CountRow[] = FEATURES.map((f) => ({ label: f.label, count: typeCount(f.type) }));
  const eventsViews: CountRow[] = Object.entries(EVENTS_VIEW_LABELS)
    .map(([k, label]) => ({ label, count: sm("view_events_list").find((r) => r.targetId === k)?._count._all ?? 0 }));

  // Communities: page views + "my community" choices, by town
  const communityRows = new Map<string, { name: string; views: number; choices: number }>();
  const comm = (slug: string) => {
    const name = slug === ALL_COUNTY ? ALL_COUNTY_LABEL : communityName(slug) ?? slug;
    const row = communityRows.get(slug) ?? { name, views: 0, choices: 0 };
    communityRows.set(slug, row);
    return row;
  };
  for (const r of sm("view_community")) if (r.targetId) comm(r.targetId).views += r._count._all;
  for (const r of sm("set_community")) if (r.targetId) comm(r.targetId).choices += r._count._all;
  const communities = [...communityRows.values()].sort((a, b) => b.views + b.choices - (a.views + a.choices) || a.name.localeCompare(b.name));

  // Visits (device-based estimate)
  const visitsNew = sm("visit").find((r) => r.targetId === "new")?._count._all ?? 0;
  const visitsReturning = sm("visit").find((r) => r.targetId === "returning")?._count._all ?? 0;

  // Searches (no query text is ever stored; targetId = number of result types with results)
  const searches = typeCount("search");
  const searchesNoResults = sm("search").find((r) => r.targetId === "0")?._count._all ?? 0;

  // PWA
  const prompt = (t: string, k: string) => sm(t).find((r) => r.targetId === k)?._count._all ?? 0;
  const pwa: CountRow[] = [
    { label: "Launched as installed app", count: typeCount("pwa_launch"), note: "once per device per day" },
    { label: "App installed (browser confirmed)", count: typeCount("pwa_installed"), note: "Chrome/Edge/Android only" },
    { label: "Install prompt shown (Android/desktop)", count: prompt("install_prompt_shown", "native") },
    { label: "Install instructions shown (iPhone/iPad)", count: prompt("install_prompt_shown", "ios") },
    { label: "Install prompt accepted", count: prompt("install_prompt_accepted", "native") },
  ];

  // Saves by content type
  const savesByType: CountRow[] = savesByKind
    .map((r) => ({ label: SAVE_KIND_LABELS[r.targetType ?? ""] ?? r.targetType ?? "Other", count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  // Businesses: union of top viewed and top clicked, then a per-type breakdown for just those ids.
  const bizIds = [...new Set([...topBizViews, ...topBizClicks].map((r) => r.targetId).filter((x): x is string => !!x))];
  const collectionMap = new Map(sm("view_collection").filter((r) => r.targetId).map((r) => [r.targetId!, r._count._all]));
  const savedByKind = new Map<string, string[]>();
  for (const r of topSaved) if (r.targetType && r.targetId) savedByKind.set(r.targetType, [...(savedByKind.get(r.targetType) ?? []), r.targetId]);

  const [bizBreakdown, eventNames, bizNames, saleNames, truckNames, collectionNames, ...savedNames] = await Promise.all([
    bizIds.length
      ? db.engagementEvent.groupBy({ by: ["type", "targetId"], where: { ...inRange, targetType: "BUSINESS", targetId: { in: bizIds }, type: { in: ["view_business", ...BIZ_CLICKS] } }, _count: { _all: true } })
      : Promise.resolve([]),
    names("EVENT", topEvents.map((r) => r.targetId!).filter(Boolean)),
    names("BUSINESS", bizIds),
    names("GARAGE_SALE", topSales.map((r) => r.targetId!).filter(Boolean)),
    names("BUSINESS", topTrucks.map((r) => r.targetId!).filter(Boolean)),
    names("COLLECTION", [...collectionMap.keys()]),
    ...[...savedByKind].map(([kind, ids]) => names(kind, ids)),
  ]);

  const businesses: BusinessRow[] = bizIds.map((id) => {
    const c = (t: string) => bizBreakdown.find((r) => r.targetId === id && r.type === t)?._count._all ?? 0;
    return { id, name: bizNames.get(id) ?? "(removed)", views: c("view_business"), website: c("click_website"), phone: c("click_phone"), directions: c("click_directions") };
  }).sort((a, b) => b.views - a.views || (b.website + b.phone + b.directions) - (a.website + a.phone + a.directions) || a.name.localeCompare(b.name));

  const savedNameByKind = new Map([...savedByKind.keys()].map((k, i) => [k, savedNames[i]]));
  const mostSaved: SavedRow[] = topSaved
    .filter((r) => r.targetType && r.targetId)
    .map((r) => ({ kind: SAVE_KIND_LABELS[r.targetType!] ?? r.targetType!, id: r.targetId!, name: savedNameByKind.get(r.targetType!)?.get(r.targetId!) ?? "(removed)", count: r._count._all }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  // Daily trend with zero-filled days
  const dailyMap = new Map(daily.map((d) => [d.day, d]));
  const days: DailyRow[] = [];
  for (let i = 0; i < range.days; i++) {
    const key = addDaysKey(firstKey, i);
    const d = dailyMap.get(key);
    days.push({ day: key, events: d ? Number(d.events) : 0, visitors: d ? Number(d.visitors) : 0 });
  }

  return {
    range, since, total,
    features, eventsViews, communities,
    visits: { new: visitsNew, returning: visitsReturning },
    searches: { total: searches, noResults: searchesNoResults },
    pwa, savesByType, businesses, mostSaved, daily: days,
    topEvents: named(toMap(topEvents), eventNames),
    topSales: named(toMap(topSales), saleNames),
    topTrucks: named(toMap(topTrucks), truckNames),
    collections: named(collectionMap, collectionNames),
  };
}
export type CommunityAnalytics = Awaited<ReturnType<typeof getCommunityAnalytics>>;

function csvCell(v: string | number) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection guard
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Long-format CSV of every aggregate table (section, item, metric, count). No personal data. */
export function analyticsCsv(a: CommunityAnalytics) {
  const rows: (string | number)[][] = [["section", "item", "metric", "count"]];
  for (const r of a.features) rows.push(["Feature usage", r.label, "events", r.count]);
  for (const r of a.eventsViews) rows.push(["Events list by quick date", r.label, "views", r.count]);
  rows.push(["Visits (device-based estimate)", "New devices", "visits", a.visits.new]);
  rows.push(["Visits (device-based estimate)", "Returning devices", "visits", a.visits.returning]);
  rows.push(["Searches", "All searches", "searches", a.searches.total]);
  rows.push(["Searches", "Searches with no results", "searches", a.searches.noResults]);
  for (const r of a.pwa) rows.push(["PWA (supporting browsers only)", r.label, "events", r.count]);
  for (const r of a.savesByType) rows.push(["Saves by content type", r.label, "saves", r.count]);
  for (const r of a.mostSaved) rows.push(["Most saved", `${r.kind}: ${r.name}`, "saves", r.count]);
  for (const r of a.communities) { rows.push(["Communities", r.name, "page views", r.views]); rows.push(["Communities", r.name, "chosen as my community", r.choices]); }
  for (const r of a.collections) rows.push(["Explore collections", r.name, "views", r.count]);
  for (const r of a.topEvents) rows.push(["Top events", r.name, "views", r.count]);
  for (const r of a.businesses) {
    rows.push(["Top businesses", r.name, "profile views", r.views]);
    rows.push(["Top businesses", r.name, "website clicks", r.website]);
    rows.push(["Top businesses", r.name, "phone taps", r.phone]);
    rows.push(["Top businesses", r.name, "directions clicks", r.directions]);
  }
  for (const r of a.topSales) rows.push(["Top garage sales", r.name, "views", r.count]);
  for (const r of a.topTrucks) rows.push(["Top food trucks", r.name, "directions clicks", r.count]);
  for (const r of a.daily) { rows.push(["Daily", r.day, "events", r.events]); rows.push(["Daily", r.day, "visitors (per-day estimate)", r.visitors]); }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

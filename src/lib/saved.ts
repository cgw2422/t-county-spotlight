import "server-only";
import { db } from "./db";
import { expandOccurrences } from "./events";
import { promotionBusinessWhere, promotionStatus, publicPromotionWhere } from "./promotions";
import { publicBusinessWhere, publishedArticleWhere } from "./queries";
import { articleHref, businessHref, eventHref, specialHref } from "./links";
import { garageSaleCardSelect, garageSaleHref, isSaleEnded, todayKey, toPublicSale } from "./garage-sales";
import { formatSaleDates, formatHours } from "./garage-sales-shared";
import { publicPulseWhere, pulseHref } from "./pulse";
import { publicOrgWhere } from "./gives/queries";
import { KIND_LABEL, orgHref } from "./gives/constants";
import { publicStopWhere, stopLabel } from "./food-trucks";
import { formatDate, formatTime } from "./utils";
import { startOfNyDay } from "@/components/public/dates";
import { SAVED_KINDS, SAVED_MAX, isSavedKind, type ResolvedSaved, type SavedKind } from "./saved-shared";

export * from "./saved-shared";

export type SavedRef = { type: SavedKind; targetId: string; savedAt?: string | Date | null; savedId?: string | null };

const HORIZON_MS = 730 * 86400_000;
const UNAVAILABLE = "No longer available";

/**
 * Whether a target may be saved right now (public and, for sales and specials,
 * not over). Returns the related business id for engagement stats.
 * `null` = not saveable. `allowEnded` (used when merging device saves) keeps
 * sales and specials that ended after the visitor saved them.
 */
export async function findSaveableTarget(type: SavedKind | "BUSINESS_FOLLOW", targetId: string, now = new Date(), opts: { allowEnded?: boolean } = {}): Promise<{ businessId: string | null } | null> {
  switch (type) {
    case "BUSINESS":
    case "BUSINESS_FOLLOW": {
      const b = await db.business.findFirst({ where: publicBusinessWhere({ id: targetId }), select: { id: true } });
      return b ? { businessId: b.id } : null;
    }
    case "EVENT": {
      const e = await db.event.findFirst({ where: { id: targetId, status: "PUBLISHED", deletedAt: null }, select: { id: true, businessId: true } });
      return e ? { businessId: e.businessId ?? null } : null;
    }
    case "PROMOTION": {
      const where = opts.allowEnded
        ? { id: targetId, status: "APPROVED" as const, deletedAt: null, business: await promotionBusinessWhere(now) }
        : { ...(await publicPromotionWhere(now)), id: targetId };
      const p = await db.promotion.findFirst({ where, select: { businessId: true } });
      return p ? { businessId: p.businessId } : null;
    }
    case "ARTICLE": {
      const a = await db.article.findFirst({ where: publishedArticleWhere({ id: targetId }), select: { id: true } });
      return a ? { businessId: null } : null;
    }
    case "GARAGE_SALE": {
      const s = await db.garageSale.findFirst({ where: { id: targetId, status: "PUBLISHED" }, select: { endDate: true } });
      return s && (opts.allowEnded || !isSaleEnded(s, now)) ? { businessId: null } : null;
    }
    case "ORGANIZATION": {
      const o = await db.organization.findFirst({ where: publicOrgWhere({ id: targetId }), select: { id: true } });
      return o ? { businessId: null } : null;
    }
    case "PULSE": {
      const p = await db.communityPulse.findFirst({ where: publicPulseWhere({ id: targetId }, { includeArchived: true }), select: { id: true } });
      return p ? { businessId: null } : null;
    }
  }
  return null;
}

/** Validates and de-duplicates untrusted refs (e.g. from localStorage). Returns null when the input is malformed or too large. */
export function parseSavedRefs(input: unknown, max = SAVED_MAX): SavedRef[] | null {
  if (!Array.isArray(input) || input.length > max) return null;
  const seen = new Set<string>();
  const out: SavedRef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const { type, targetId, savedAt } = raw as Record<string, unknown>;
    if (!isSavedKind(type) || typeof targetId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(targetId)) return null;
    const key = `${type}:${targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = typeof savedAt === "string" && savedAt.length <= 40 && !Number.isNaN(Date.parse(savedAt)) ? savedAt : null;
    out.push({ type, targetId, savedAt: at });
  }
  return out;
}

function shortDate(d: Date) {
  return formatDate(d, { weekday: "short", month: "short", day: "numeric" });
}

function gone(ref: SavedRef, savedAt: number): ResolvedSaved {
  return {
    type: ref.type, targetId: ref.targetId, savedId: ref.savedId ?? null, savedAt: ref.savedAt ? new Date(ref.savedAt).toISOString() : null,
    available: false, ended: true, statusLabel: UNAVAILABLE, title: "Saved item", href: null, image: null,
    dateLabel: null, location: null, badge: null, detail: null, sortAt: savedAt,
  };
}

/**
 * Resolves saved refs to public, display-ready fields. Only public data is
 * selected or returned: unpublished/deleted targets come back as "No longer
 * available" with no title, and garage sales go through `toPublicSale` so the
 * private street address is never exposed.
 */
export async function resolveSavedItems(refs: SavedRef[], now = new Date()): Promise<ResolvedSaved[]> {
  const ids = (t: SavedKind) => [...new Set(refs.filter((r) => r.type === t).map((r) => r.targetId))];
  const has = (t: SavedKind) => refs.some((r) => r.type === t);
  const todayStart = startOfNyDay(todayKey(now));

  const [businesses, events, promos, articles, sales, orgs, pulses] = await Promise.all([
    has("BUSINESS") ? db.business.findMany({ where: publicBusinessWhere({ id: { in: ids("BUSINESS") } }), select: { id: true, slug: true, name: true, city: true, logoUrl: true, coverUrl: true, isFoodTruck: true, cuisine: true, tagline: true } }) : [],
    has("EVENT") ? db.event.findMany({ where: { id: { in: ids("EVENT") }, status: "PUBLISHED", deletedAt: null }, select: { id: true, slug: true, title: true, startAt: true, endAt: true, allDay: true, recurrence: true, imageUrl: true, locationName: true, city: true } }) : [],
    has("PROMOTION") ? promotionBusinessWhere(now).then((business) => db.promotion.findMany({ where: { id: { in: ids("PROMOTION") }, deletedAt: null, business }, select: { id: true, slug: true, title: true, imageUrl: true, status: true, startsAt: true, endsAt: true, business: { select: { name: true, city: true, logoUrl: true } } } })) : [],
    has("ARTICLE") ? db.article.findMany({ where: publishedArticleWhere({ id: { in: ids("ARTICLE") } }), select: { id: true, slug: true, legacyPath: true, title: true, featuredImageUrl: true, publishedAt: true } }) : [],
    has("GARAGE_SALE") ? db.garageSale.findMany({ where: { id: { in: ids("GARAGE_SALE") }, status: "PUBLISHED" }, select: garageSaleCardSelect }) : [],
    has("ORGANIZATION") ? db.organization.findMany({ where: publicOrgWhere({ id: { in: ids("ORGANIZATION") } }), select: { id: true, slug: true, name: true, kind: true, city: true, logoUrl: true, coverUrl: true, tagline: true } }) : [],
    has("PULSE") ? db.communityPulse.findMany({ where: publicPulseWhere({ id: { in: ids("PULSE") } }, { includeArchived: true }), select: { id: true, slug: true, title: true, featuredImageUrl: true, publishedAt: true, category: { select: { name: true } } } }) : [],
  ]);

  // Next scheduled stop for saved food trucks.
  const truckIds = businesses.filter((b) => b.isFoodTruck).map((b) => b.id);
  const stops = truckIds.length
    ? await db.foodTruckStop.findMany({ where: { ...publicStopWhere({ start: now }), businessId: { in: truckIds } }, orderBy: { startAt: "asc" }, take: 300, select: { businessId: true, startAt: true, endAt: true, locationName: true, city: true } })
    : [];
  const nextStop = new Map<string, (typeof stops)[number]>();
  for (const s of stops) if (!nextStop.has(s.businessId)) nextStop.set(s.businessId, s);

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const maps = {
    BUSINESS: byId(businesses), EVENT: byId(events), PROMOTION: byId(promos), ARTICLE: byId(articles),
    GARAGE_SALE: byId(sales), ORGANIZATION: byId(orgs), PULSE: byId(pulses),
  };

  return refs.map((ref): ResolvedSaved => {
    const savedAtMs = ref.savedAt ? new Date(ref.savedAt).getTime() || 0 : 0;
    const base = { type: ref.type, targetId: ref.targetId, savedId: ref.savedId ?? null, savedAt: ref.savedAt ? new Date(ref.savedAt).toISOString() : null, available: true, ended: false, statusLabel: null, badge: null, detail: null, sortAt: savedAtMs };
    switch (ref.type) {
      case "BUSINESS": {
        const b = maps.BUSINESS.get(ref.targetId);
        if (!b) return gone(ref, savedAtMs);
        const stop = nextStop.get(b.id);
        return {
          ...base, title: b.name, href: businessHref(b), image: b.logoUrl || b.coverUrl, dateLabel: null,
          location: b.city || "Tuscarawas County", badge: b.isFoodTruck ? "Food truck" : null,
          detail: b.isFoodTruck ? (stop ? `Next stop: ${shortDate(stop.startAt)} · ${stopLabel(stop, now).replace(/^Scheduled /, "")} · ${stop.locationName}${stop.city ? `, ${stop.city}` : ""}` : "No upcoming stops posted") : b.cuisine || b.tagline || null,
        };
      }
      case "EVENT": {
        const e = maps.EVENT.get(ref.targetId);
        if (!e) return gone(ref, savedAtMs);
        // All-day events stay current for the whole day.
        const from = e.allDay ? todayStart : now;
        const next = expandOccurrences([e], from, new Date(now.getTime() + HORIZON_MS), 1)[0];
        const recurring = !!(e.recurrence as { freq?: string } | null)?.freq;
        const when = next?.occurrenceStart ?? e.startAt;
        const ended = !next;
        return {
          ...base, ended, statusLabel: ended ? "Ended" : null, title: e.title, href: eventHref(e), image: e.imageUrl,
          dateLabel: (recurring && !ended ? "Next: " : "") + shortDate(when) + (e.allDay ? " · All day" : ` · ${formatTime(when)}`),
          location: [e.locationName, e.city].filter(Boolean).join(", ") || null,
          badge: recurring ? "Recurring" : null, sortAt: ended ? -(e.endAt ?? e.startAt).getTime() : when.getTime(),
        };
      }
      case "PROMOTION": {
        const p = maps.PROMOTION.get(ref.targetId);
        if (!p) return gone(ref, savedAtMs);
        const status = promotionStatus(p, now);
        if (status !== "Active" && status !== "Scheduled" && status !== "Expired") return gone(ref, savedAtMs);
        const ended = status === "Expired";
        return {
          ...base, ended, statusLabel: ended ? "Expired" : null, title: p.title, href: specialHref(p), image: p.imageUrl || p.business.logoUrl,
          dateLabel: status === "Scheduled" ? `Starts ${shortDate(p.startsAt)}` : p.endsAt ? `${ended ? "Ended" : "Ends"} ${shortDate(p.endsAt)}` : null,
          location: [p.business.name, p.business.city].filter(Boolean).join(" · "),
          sortAt: ended ? -(p.endsAt?.getTime() ?? 0) : p.endsAt?.getTime() ?? Number.MAX_SAFE_INTEGER,
        };
      }
      case "ARTICLE": {
        const a = maps.ARTICLE.get(ref.targetId);
        if (!a) return gone(ref, savedAtMs);
        return { ...base, title: a.title, href: articleHref(a), image: a.featuredImageUrl, dateLabel: a.publishedAt ? formatDate(a.publishedAt) : null, location: null };
      }
      case "GARAGE_SALE": {
        const row = maps.GARAGE_SALE.get(ref.targetId);
        if (!row) return gone(ref, savedAtMs);
        const s = toPublicSale(row); // public projection only
        const ended = isSaleEnded(s, now);
        return {
          ...base, ended, statusLabel: ended ? "Ended" : null, title: s.title, href: garageSaleHref(s), image: s.photos[0] ?? null,
          dateLabel: `${formatSaleDates(s.startDate, s.endDate)} · ${formatHours(s.dailyStart, s.dailyEnd)}`,
          location: [s.locationLine, s.city].filter(Boolean).join(", ") || null,
          sortAt: ended ? -s.endDate.getTime() : s.startDate.getTime(),
        };
      }
      case "ORGANIZATION": {
        const o = maps.ORGANIZATION.get(ref.targetId);
        if (!o) return gone(ref, savedAtMs);
        return { ...base, title: o.name, href: orgHref(o), image: o.logoUrl || o.coverUrl, dateLabel: null, location: o.city || "Tuscarawas County", badge: KIND_LABEL[o.kind] ?? null, detail: o.tagline };
      }
      case "PULSE": {
        const p = maps.PULSE.get(ref.targetId);
        if (!p) return gone(ref, savedAtMs);
        return { ...base, title: p.title, href: pulseHref(p), image: p.featuredImageUrl, dateLabel: p.publishedAt ? formatDate(p.publishedAt) : null, location: null, badge: p.category?.name ?? null };
      }
    }
    return gone(ref, savedAtMs);
  });
}

/** Sorts within a section: current items first (soonest / newest), then ended, then unavailable. */
export function sortSaved(items: ResolvedSaved[]) {
  const rank = (i: ResolvedSaved) => (!i.available ? 2 : i.ended ? 1 : 0);
  const dated = (t: SavedKind) => t === "EVENT" || t === "GARAGE_SALE" || t === "PROMOTION";
  return [...items].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (rank(a) === 0 && dated(a.type)) return a.sortAt - b.sortAt; // soonest first
    if (rank(a) === 1 && dated(a.type)) return a.sortAt - b.sortAt; // most recently ended first (negated)
    return (b.savedAt ? Date.parse(b.savedAt) : 0) - (a.savedAt ? Date.parse(a.savedAt) : 0); // newest save first
  });
}

/** A member's saved items, resolved (newest saves first before sectioning). */
export async function getSavedItemsForUser(userId: string, now = new Date()) {
  const rows = await db.savedItem.findMany({
    where: { userId, type: { in: [...SAVED_KINDS] } },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { id: true, type: true, targetId: true, createdAt: true },
  });
  return resolveSavedItems(rows.map((r) => ({ type: r.type as SavedKind, targetId: r.targetId, savedAt: r.createdAt, savedId: r.id })), now);
}

export type SavedSummaryItem = Pick<ResolvedSaved, "type" | "targetId" | "title" | "href" | "image" | "dateLabel" | "ended" | "badge"> & { location: string | null };

/**
 * Small list for widgets (My T County, account): current items first —
 * upcoming events and sales soonest, then the newest other saves — followed by
 * ended ones (flagged `ended`). Items that are no longer public are left out.
 */
export async function getSavedSummary(userId: string, limit: number): Promise<SavedSummaryItem[]> {
  const all = (await getSavedItemsForUser(userId)).filter((i) => i.available);
  const isDated = (i: ResolvedSaved) => i.type === "EVENT" || i.type === "GARAGE_SALE";
  const current = all.filter((i) => !i.ended);
  const ordered = [
    ...sortSaved(current.filter(isDated)),
    ...current.filter((i) => !isDated(i)), // already newest-saved first
    ...sortSaved(all.filter((i) => i.ended)),
  ];
  return ordered.slice(0, Math.max(0, limit)).map(({ type, targetId, title, href, image, dateLabel, ended, badge, location }) => ({ type, targetId, title, href, image, dateLabel, ended, badge, location }));
}

/** Number of saved rows a member has (all types). */
export function countSaved(userId: string) {
  return db.savedItem.count({ where: { userId, type: { in: [...SAVED_KINDS] } } });
}

/** Saved state for many targets at once (member only), for list pages. */
export async function savedTargetIds(userId: string | null | undefined, type: SavedKind, targetIds: string[]) {
  if (!userId || !targetIds.length) return new Set<string>();
  const rows = await db.savedItem.findMany({ where: { userId, type, targetId: { in: targetIds } }, select: { targetId: true } });
  return new Set(rows.map((r) => r.targetId));
}

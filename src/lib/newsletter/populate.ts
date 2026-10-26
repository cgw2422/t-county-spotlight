import "server-only";
import { db } from "@/lib/db";
import { getUpcomingOccurrences, publishedArticleWhere, articleCardSelect } from "@/lib/queries";
import { activePromotionWhere } from "@/lib/promotions";
import { articleHref, eventHref, specialHref } from "@/lib/links";
import { orgHref, needHref } from "@/lib/gives/constants";
import { formatDate, formatTime, stripHtml, truncate } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { SECTION_DEFAULTS, type NLItem, type NLSectionKey, type NewsletterContent } from "./content";

const URGENCY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const short = (s: string | null | undefined, n = 180) => (s ? truncate(stripHtml(s), n) : undefined);

type EventRow = Awaited<ReturnType<typeof getUpcomingOccurrences>>[number];
function eventItem(e: EventRow): NLItem {
  const when = `${formatDate(e.occurrenceStart, { weekday: "short", month: "short", day: "numeric" })}${e.allDay ? "" : ` · ${formatTime(e.occurrenceStart)}`}`;
  return {
    id: `event-${e.id}`, refType: "event", refId: e.id, title: e.title, url: eventHref(e), imageUrl: e.imageUrl ?? undefined, imageAlt: e.title,
    meta: [when, e.city].filter(Boolean).join(" · "), text: [e.locationName, e.isFree ? "Free" : null].filter(Boolean).join(" · ") || undefined,
    sponsored: e.isSponsored,
  };
}

const promoSelect = { id: true, slug: true, title: true, description: true, imageUrl: true, endsAt: true, isSponsored: true, business: { select: { name: true, logoUrl: true, coverUrl: true } } } satisfies Prisma.PromotionSelect;
type PromoRow = Prisma.PromotionGetPayload<{ select: typeof promoSelect }>;
function promoItem(p: PromoRow): NLItem {
  return {
    id: `promotion-${p.id}`, refType: "promotion", refId: p.id, title: p.title, url: specialHref(p), imageUrl: p.imageUrl || p.business.coverUrl || p.business.logoUrl || undefined,
    imageAlt: p.title, meta: p.business.name, text: short(p.description) || (p.endsAt ? `Ends ${formatDate(p.endsAt, { month: "short", day: "numeric" })}` : undefined), sponsored: p.isSponsored,
  };
}

type ArticleRow = Prisma.ArticleGetPayload<{ select: typeof articleCardSelect }>;
function articleItem(a: ArticleRow): NLItem {
  return { id: `article-${a.id}`, refType: "article", refId: a.id, title: stripHtml(a.title), url: articleHref(a), imageUrl: a.featuredImageUrl ?? undefined, imageAlt: a.featuredImageAlt || stripHtml(a.title), text: short(a.excerpt), meta: a.kind === "SPOTLIGHT" ? "Business Spotlight" : a.categories[0]?.name };
}

const needSelect = { id: true, slug: true, title: true, description: true, urgency: true, deadline: true, organization: { select: { name: true, logoUrl: true, coverUrl: true } } } satisfies Prisma.CommunityNeedSelect;
type NeedRow = Prisma.CommunityNeedGetPayload<{ select: typeof needSelect }>;
function needItem(n: NeedRow): NLItem {
  const urgent = n.urgency === "CRITICAL" || n.urgency === "HIGH";
  return {
    id: `need-${n.id}`, refType: "need", refId: n.id, title: n.title, url: needHref(n), imageUrl: n.organization.coverUrl || n.organization.logoUrl || undefined, imageAlt: n.organization.name,
    meta: [n.organization.name, urgent ? "Urgent" : null].filter(Boolean).join(" · "), text: short(n.description) || (n.deadline ? `Needed by ${formatDate(n.deadline, { month: "short", day: "numeric" })}` : undefined),
  };
}

const orgSelect = { id: true, slug: true, name: true, kind: true, tagline: true, mission: true, logoUrl: true, coverUrl: true, city: true, orgType: true } satisfies Prisma.OrganizationSelect;
type OrgRow = Prisma.OrganizationGetPayload<{ select: typeof orgSelect }>;
function orgItem(o: OrgRow): NLItem {
  return { id: `organization-${o.id}`, refType: "organization", refId: o.id, title: o.name, url: orgHref(o), imageUrl: o.coverUrl || o.logoUrl || undefined, imageAlt: o.name, meta: [o.orgType, o.city].filter(Boolean).join(" · ") || undefined, text: o.tagline || short(o.mission) };
}

const openNeedWhere = (): Prisma.CommunityNeedWhereInput => ({ status: { in: ["OPEN", "PARTIALLY_FULFILLED"] }, deletedAt: null, organization: { status: "APPROVED", deletedAt: null }, OR: [{ deadline: null }, { deadline: { gte: new Date() } }] });
const approvedOrgWhere = (): Prisma.OrganizationWhereInput => ({ status: "APPROVED", deletedAt: null });

/** Fills each section with current site content. Everything stays editable afterwards. */
export async function autoPopulate(current: NewsletterContent): Promise<NewsletterContent> {
  const now = new Date();
  const [events, spotlights, specials, needs, orgs] = await Promise.all([
    getUpcomingOccurrences({ from: now, to: new Date(now.getTime() + 14 * 86400_000), limit: 6 }),
    db.article.findMany({ where: publishedArticleWhere({ kind: "SPOTLIGHT" }), orderBy: { publishedAt: "desc" }, take: 3, select: articleCardSelect }),
    db.promotion.findMany({ where: activePromotionWhere(now), orderBy: [{ isFeatured: "desc" }, { startsAt: "desc" }], take: 4, select: promoSelect }),
    db.communityNeed.findMany({ where: openNeedWhere(), take: 30, orderBy: [{ deadline: "asc" }, { createdAt: "desc" }], select: needSelect }),
    db.organization.findMany({ where: approvedOrgWhere(), orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }], take: 3, select: orgSelect }),
  ]);
  needs.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));
  const fill: Record<NLSectionKey, NLItem[]> = {
    events: events.map(eventItem),
    spotlights: spotlights.map(articleItem),
    specials: specials.map(promoItem),
    needs: needs.slice(0, 4).map(needItem),
    nonprofits: orgs.map(orgItem),
  };
  return { ...current, sections: current.sections.map((s) => ({ ...s, items: fill[s.key] })) };
}

/** Admin search to add a specific item to a section. */
export async function searchItems(section: NLSectionKey, q: string): Promise<NLItem[]> {
  const query = q.trim().slice(0, 100);
  const contains = { contains: query, mode: "insensitive" as const };
  switch (SECTION_DEFAULTS[section].ref) {
    case "event": {
      const now = new Date();
      const occ = await getUpcomingOccurrences({ from: now, to: new Date(now.getTime() + 120 * 86400_000), where: query ? { title: contains } : {}, limit: 12 });
      return occ.map(eventItem);
    }
    case "article": {
      const rows = await db.article.findMany({ where: publishedArticleWhere(query ? { title: contains } : {}), orderBy: { publishedAt: "desc" }, take: 12, select: articleCardSelect });
      return rows.map(articleItem);
    }
    case "promotion": {
      const rows = await db.promotion.findMany({ where: { ...activePromotionWhere(), ...(query ? { title: contains } : {}) }, orderBy: { startsAt: "desc" }, take: 12, select: promoSelect });
      return rows.map(promoItem);
    }
    case "need": {
      const rows = await db.communityNeed.findMany({ where: { AND: [openNeedWhere(), query ? { title: contains } : {}] }, orderBy: { createdAt: "desc" }, take: 12, select: needSelect });
      return rows.map(needItem);
    }
    case "organization": {
      const rows = await db.organization.findMany({ where: { ...approvedOrgWhere(), ...(query ? { name: contains } : {}) }, orderBy: [{ isFeatured: "desc" }, { name: "asc" }], take: 12, select: orgSelect });
      return rows.map(orgItem);
    }
    default:
      return [];
  }
}

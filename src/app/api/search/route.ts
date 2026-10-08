import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { articleHref, businessHref, eventHref, specialHref } from "@/lib/links";
import { publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { activePromotionWhere } from "@/lib/promotions";
import { upcomingEventWhere } from "@/lib/events";
import { stripHtml } from "@/lib/utils";

/** Lightweight typeahead: GET /api/search/?q=term → [{ type, title, subtitle, href }] */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`search:${ip}`, 60, 60_000).ok) return NextResponse.json({ results: [] }, { status: 429 });

  const c = { contains: q, mode: "insensitive" as const };
  const [businesses, articles, events, specials] = await Promise.all([
    db.business.findMany({ where: publicBusinessWhere({ OR: [{ name: c }, { city: c }] }), select: { slug: true, name: true, city: true }, take: 5, orderBy: { name: "asc" } }),
    db.article.findMany({ where: publishedArticleWhere({ title: c }), select: { slug: true, title: true, legacyPath: true, publishedAt: true }, take: 5, orderBy: { publishedAt: "desc" } }),
    db.event.findMany({ where: { AND: [upcomingEventWhere(), { title: c }] }, select: { slug: true, title: true, city: true }, take: 4, orderBy: { startAt: "asc" } }),
    db.promotion.findMany({ where: { ...activePromotionWhere(), title: c }, select: { slug: true, title: true, business: { select: { name: true } } }, take: 4 }),
  ]);
  const results = [
    ...businesses.map((b) => ({ type: "Business", title: b.name, subtitle: b.city, href: businessHref(b) })),
    ...events.map((e) => ({ type: "Event", title: e.title, subtitle: e.city, href: eventHref(e) })),
    ...specials.map((p) => ({ type: "Special", title: p.title, subtitle: p.business.name, href: specialHref(p) })),
    ...articles.map((a) => ({ type: "Article", title: stripHtml(a.title), subtitle: null, href: articleHref(a) })),
  ];
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=60" } });
}

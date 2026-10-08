import "server-only";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export type Usage = { type: string; id: string; title: string; href: string; field: string; live: boolean };

/** Finds every record that references a media URL (image fields and HTML bodies). */
export async function findMediaUsage(url: string): Promise<Usage[]> {
  const has = { contains: url };
  const [articles, businesses, photos, events, promos, pages, updates, placements, settings] = await Promise.all([
    db.article.findMany({ where: { OR: [{ featuredImageUrl: url }, { ogImageUrl: url }, { content: has }] }, select: { id: true, title: true, status: true, deletedAt: true, featuredImageUrl: true, ogImageUrl: true } }),
    db.business.findMany({ where: { OR: [{ logoUrl: url }, { coverUrl: url }, { description: has }, { story: has }] }, select: { id: true, name: true, status: true, deletedAt: true, logoUrl: true, coverUrl: true } }),
    db.businessPhoto.findMany({ where: { url }, select: { business: { select: { id: true, name: true, status: true, deletedAt: true } } } }),
    db.event.findMany({ where: { OR: [{ imageUrl: url }, { description: has }] }, select: { id: true, title: true, status: true, deletedAt: true, imageUrl: true } }),
    db.promotion.findMany({ where: { imageUrl: url }, select: { id: true, title: true, status: true, deletedAt: true } }),
    db.page.findMany({ where: { OR: [{ featuredImageUrl: url }, { content: has }] }, select: { id: true, title: true, status: true, deletedAt: true, featuredImageUrl: true } }),
    db.businessUpdate.findMany({ where: { imageUrl: url }, select: { id: true, title: true, status: true, businessId: true } }),
    db.placement.findMany({ where: { imageUrl: url }, select: { id: true, slot: true, isActive: true } }),
    getSettings(),
  ]);
  const out: Usage[] = [];
  for (const a of articles) out.push({ type: "Article", id: a.id, title: a.title, href: `/admin/articles/${a.id}/`, field: a.featuredImageUrl === url ? "Featured image" : a.ogImageUrl === url ? "Social image" : "Content", live: !a.deletedAt && (a.status === "PUBLISHED" || a.status === "SCHEDULED") });
  for (const b of businesses) out.push({ type: "Business", id: b.id, title: b.name, href: `/admin/businesses/${b.id}/`, field: b.logoUrl === url ? "Logo" : b.coverUrl === url ? "Cover" : "Description", live: !b.deletedAt && b.status === "PUBLISHED" });
  for (const p of photos) out.push({ type: "Business", id: p.business.id, title: p.business.name, href: `/admin/businesses/${p.business.id}/`, field: "Gallery photo", live: !p.business.deletedAt && p.business.status === "PUBLISHED" });
  for (const e of events) out.push({ type: "Event", id: e.id, title: e.title, href: `/admin/events/${e.id}/`, field: e.imageUrl === url ? "Image" : "Description", live: !e.deletedAt && e.status === "PUBLISHED" });
  for (const p of promos) out.push({ type: "Special", id: p.id, title: p.title, href: `/admin/specials/${p.id}/`, field: "Image", live: !p.deletedAt && p.status === "APPROVED" });
  for (const p of pages) out.push({ type: "Page", id: p.id, title: p.title, href: `/admin/pages/${p.id}/`, field: p.featuredImageUrl === url ? "Featured image" : "Content", live: !p.deletedAt && p.status === "PUBLISHED" });
  for (const u of updates) out.push({ type: "Business update", id: u.id, title: u.title, href: `/admin/updates/`, field: "Image", live: u.status === "PUBLISHED" });
  for (const p of placements) out.push({ type: "Placement", id: p.id, title: p.slot, href: `/admin/placements/`, field: "Image", live: p.isActive });
  const settingKeys = (["logoUrl", "logoDarkUrl", "faviconUrl", "heroImageUrl", "seoDefaultImage"] as const).filter((k) => settings[k] === url);
  for (const k of settingKeys) out.push({ type: "Site settings", id: k, title: k, href: k === "heroImageUrl" ? "/admin/homepage/" : "/admin/settings/", field: k, live: true });
  return out;
}

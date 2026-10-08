"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { destroySession, requireStaff } from "@/lib/auth";
import { sanitizeRichText } from "@/lib/sanitize";
import type { Prisma } from "@/generated/prisma/client";

export type LookupType = "business" | "article" | "event" | "promotion" | "user" | "page";
export type LookupItem = { id: string; label: string; sub?: string | null };

/** Typeahead search used by SearchSelect. Staff only. */
export async function lookupRecords(type: LookupType, q: string, opts: { publishedOnly?: boolean } = {}): Promise<LookupItem[]> {
  await requireStaff();
  const query = q.trim().slice(0, 100);
  const contains = { contains: query, mode: "insensitive" as const };
  const take = 15;
  switch (type) {
    case "business": {
      const where: Prisma.BusinessWhereInput = { deletedAt: null, ...(query ? { name: contains } : {}), ...(opts.publishedOnly ? { status: "PUBLISHED" } : {}) };
      const rows = await db.business.findMany({ where, take, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, status: true } });
      return rows.map((r) => ({ id: r.id, label: r.name, sub: [r.city, r.status !== "PUBLISHED" ? r.status.toLowerCase() : null].filter(Boolean).join(" · ") }));
    }
    case "article": {
      const where: Prisma.ArticleWhereInput = { deletedAt: null, ...(query ? { title: contains } : {}), ...(opts.publishedOnly ? { status: "PUBLISHED" } : {}) };
      const rows = await db.article.findMany({ where, take, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, kind: true, status: true } });
      return rows.map((r) => ({ id: r.id, label: r.title, sub: `${r.kind.replace(/_/g, " ").toLowerCase()} · ${r.status.toLowerCase()}` }));
    }
    case "event": {
      const where: Prisma.EventWhereInput = { deletedAt: null, ...(query ? { title: contains } : {}), ...(opts.publishedOnly ? { status: "PUBLISHED" } : {}) };
      const rows = await db.event.findMany({ where, take, orderBy: { startAt: "desc" }, select: { id: true, title: true, startAt: true, status: true } });
      return rows.map((r) => ({ id: r.id, label: r.title, sub: `${r.startAt.toLocaleDateString("en-US", { timeZone: "America/New_York" })} · ${r.status.toLowerCase()}` }));
    }
    case "promotion": {
      const where: Prisma.PromotionWhereInput = { deletedAt: null, ...(query ? { title: contains } : {}), ...(opts.publishedOnly ? { status: "APPROVED" } : {}) };
      const rows = await db.promotion.findMany({ where, take, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, business: { select: { name: true } } } });
      return rows.map((r) => ({ id: r.id, label: r.title, sub: r.business.name }));
    }
    case "user": {
      const where: Prisma.UserWhereInput = query ? { OR: [{ email: contains }, { name: contains }] } : {};
      const rows = await db.user.findMany({ where, take, orderBy: { createdAt: "desc" }, select: { id: true, email: true, name: true } });
      return rows.map((r) => ({ id: r.id, label: r.name || r.email, sub: r.email }));
    }
    case "page": {
      const where: Prisma.PageWhereInput = { deletedAt: null, ...(query ? { title: contains } : {}), ...(opts.publishedOnly ? { status: "PUBLISHED" } : {}) };
      const rows = await db.page.findMany({ where, take, orderBy: { title: "asc" }, select: { id: true, title: true, slug: true } });
      return rows.map((r) => ({ id: r.id, label: r.title, sub: `/${r.slug}/` }));
    }
  }
}

export type MediaListItem = { id: string; url: string; filename: string; alt: string | null; caption: string | null; width: number | null; height: number | null; mimeType: string };

/** Paged media library browse for the MediaPicker dialog. */
export async function listMedia(q: string, page = 1): Promise<{ items: MediaListItem[]; hasMore: boolean }> {
  await requireStaff();
  const query = q.trim().slice(0, 100);
  const take = 24;
  const where: Prisma.MediaWhereInput = {
    deletedAt: null,
    ...(query
      ? { OR: [{ filename: { contains: query, mode: "insensitive" } }, { alt: { contains: query, mode: "insensitive" } }, { title: { contains: query, mode: "insensitive" } }] }
      : {}),
  };
  const rows = await db.media.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (Math.max(1, page) - 1) * take,
    take: take + 1,
    select: { id: true, url: true, filename: true, alt: true, caption: true, width: true, height: true, mimeType: true },
  });
  return { items: rows.slice(0, take), hasMore: rows.length > take };
}

/** Sanitized preview of raw HTML (HTML-source editing mode). */
export async function previewHtml(html: string) {
  await requireStaff();
  return sanitizeRichText(html.slice(0, 2_000_000));
}

export async function signOutAction() {
  await destroySession();
  redirect("/login/");
}

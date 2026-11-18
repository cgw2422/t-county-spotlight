import "server-only";
import { db } from "@/lib/db";

export const ISSUES_PER_PAGE = 12;

export const issueHref = (i: { slug: string }) => `/newsletter/${i.slug}/`;

export const issueCardSelect = { id: true, slug: true, title: true, subtitle: true, thumbnailUrl: true, publishedAt: true } as const;

/** Visible beehiiv-synced issues, newest first. */
export async function getIssuePage(page: number) {
  try {
    const where = { hidden: false, publishedAt: { lte: new Date() } };
    const total = await db.newsletterIssue.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / ISSUES_PER_PAGE));
    const p = Math.min(Math.max(1, page), totalPages);
    const rows = total ? await db.newsletterIssue.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (p - 1) * ISSUES_PER_PAGE, take: ISSUES_PER_PAGE, select: issueCardSelect }) : [];
    return { rows, total, page: p, totalPages };
  } catch (e) {
    console.error("[newsletter] issue list failed", (e as Error).message);
    return { rows: [], total: 0, page: 1, totalPages: 1 };
  }
}

export async function findVisibleIssue(slug: string) {
  return db.newsletterIssue.findFirst({ where: { slug, hidden: false, publishedAt: { lte: new Date() } } });
}

/** Neighbors for "newer / older edition" links. */
export async function issueNeighbors(publishedAt: Date, id: string) {
  const where = { hidden: false, publishedAt: { lte: new Date() }, id: { not: id } };
  const [newer, older] = await Promise.all([
    db.newsletterIssue.findFirst({ where: { ...where, publishedAt: { gt: publishedAt, lte: new Date() } }, orderBy: { publishedAt: "asc" }, select: { slug: true, title: true } }),
    db.newsletterIssue.findFirst({ where: { ...where, publishedAt: { lt: publishedAt } }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true } }),
  ]);
  return { newer, older };
}

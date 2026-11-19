/**
 * The "Newsletter" article category for beehiiv imports. No server-only import so the
 * deploy-time seed can run the one-time backfill with its own Prisma client.
 */
import type { PrismaClient } from "../../generated/prisma/client";

export const NEWSLETTER_CATEGORY = { name: "Newsletter", slug: "newsletter" } as const;
const CATEGORY_BACKFILL_MARKER = "beehiivNewsletterCategoryBackfill";

/** Reuse an existing Newsletter category (by slug or name, case-insensitive), else create it once. */
export async function ensureNewsletterCategory(db: PrismaClient) {
  const found = await db.category.findFirst({
    where: { OR: [{ slug: NEWSLETTER_CATEGORY.slug }, { name: { equals: NEWSLETTER_CATEGORY.name, mode: "insensitive" } }] },
    orderBy: { slug: "asc" },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await db.category.upsert({ where: { slug: NEWSLETTER_CATEGORY.slug }, create: { ...NEWSLETTER_CATEGORY }, update: {}, select: { id: true } });
  return created.id;
}

/**
 * One-time: beehiiv-imported articles that still have no category ("General") move to
 * Newsletter. Articles with any category (someone set one) and articles created on
 * T County Connect (no beehiivPostId) are left alone. Guarded by a Setting marker so a
 * category an admin later removes is never re-added.
 */
export async function backfillNewsletterCategory(db: PrismaClient) {
  const done = await db.setting.findUnique({ where: { key: CATEGORY_BACKFILL_MARKER } });
  if (done) return { skipped: true as const, moved: 0 };
  const targets = await db.article.findMany({ where: { beehiivPostId: { not: null }, categories: { none: {} } }, select: { id: true } });
  if (targets.length) {
    const categoryId = await ensureNewsletterCategory(db);
    for (const a of targets) await db.article.update({ where: { id: a.id }, data: { categories: { connect: { id: categoryId } } } });
  }
  await db.setting.upsert({ where: { key: CATEGORY_BACKFILL_MARKER }, create: { key: CATEGORY_BACKFILL_MARKER, value: { at: new Date().toISOString(), moved: targets.length } }, update: {} });
  return { skipped: false as const, moved: targets.length };
}

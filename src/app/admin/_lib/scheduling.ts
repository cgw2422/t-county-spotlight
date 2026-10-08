import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Publishes scheduled articles whose publish time has passed.
 * Public queries only show status PUBLISHED, so this flips due SCHEDULED
 * articles to PUBLISHED. Called on admin dashboard/article list loads and is
 * safe to call from a cron route (idempotent; returns the number published).
 */
export async function publishDueScheduled(now = new Date()) {
  const due = await db.article.findMany({
    where: { status: "SCHEDULED", deletedAt: null, publishedAt: { lte: now } },
    select: { id: true },
  });
  if (!due.length) return 0;
  const ids = due.map((a) => a.id);
  const res = await db.article.updateMany({ where: { id: { in: ids }, status: "SCHEDULED" }, data: { status: "PUBLISHED" } });
  await audit(null, "article.publish_scheduled", "Article", ids.length === 1 ? ids[0] : undefined, { ids });
  return res.count;
}

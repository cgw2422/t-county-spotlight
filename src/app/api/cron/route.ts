import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { processDueNewsletters } from "@/lib/newsletter/send";
import { processEmailUpdates } from "@/lib/notifications/run";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/**
 * Housekeeping, run every ~10 minutes:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/
 * - publishes SCHEDULED articles whose publishedAt has passed
 * - removes expired sessions and expired/used verification tokens
 * - starts due scheduled newsletters and continues sending ones (batched)
 * - sends opt-in member email updates whose window is open (weekend summary,
 *   saved event reminders, new in my communities; at most 200 per run, each
 *   update at most once per member — run this at least hourly)
 */
async function run(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();

  const due = await db.article.findMany({
    where: { status: "SCHEDULED", publishedAt: { lte: now }, deletedAt: null },
    select: { id: true, title: true },
  });
  if (due.length) {
    await db.article.updateMany({ where: { id: { in: due.map((a) => a.id) }, status: "SCHEDULED" }, data: { status: "PUBLISHED" } });
    for (const a of due) await audit(null, "article.publish_scheduled", "Article", a.id, { title: a.title });
  }

  const sessions = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const tokens = await db.verificationToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: new Date(now.getTime() - 7 * 86400_000) } }] },
  });

  let newsletters: Awaited<ReturnType<typeof processDueNewsletters>> | { error: string };
  try {
    newsletters = await processDueNewsletters();
  } catch (e) {
    console.error("[cron] newsletter processing failed", e);
    newsletters = { error: (e as Error).message };
  }

  let emailUpdates: Awaited<ReturnType<typeof processEmailUpdates>> | { error: string };
  try {
    emailUpdates = await processEmailUpdates({ now });
  } catch (e) {
    console.error("[cron] email updates failed", e);
    emailUpdates = { error: (e as Error).message };
  }

  return NextResponse.json({
    ok: true,
    time: now.toISOString(),
    publishedArticles: due.length,
    deletedSessions: sessions.count,
    deletedTokens: tokens.count,
    newsletters,
    emailUpdates,
  });
}

export const GET = run;
export const POST = run;

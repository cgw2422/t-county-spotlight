import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendBroadcastBatch, sendMessage, type OutgoingEmail } from "@/lib/email";
import { broadcastProvider, ProviderError, RESEND_BATCH_MAX } from "./provider";
import { newsletterSender } from "./settings";
import { normalizeContent, type NewsletterContent } from "./content";
import { listUnsubscribeHeaders, personalize, recipientLinks, renderNewsletter } from "./render";
import { readPreferences, type TopicKey } from "./copy";

export type Readiness = { ok: boolean; problems: string[]; provider: "resend" | "smtp" | null };

/** A broadcast needs a real provider, a sending address and a postal address (CAN-SPAM). */
export async function broadcastReadiness(): Promise<Readiness> {
  const provider = broadcastProvider();
  const s = await newsletterSender();
  const problems: string[] = [];
  if (!provider) problems.push("No email provider is configured. Set RESEND_API_KEY (recommended) or SMTP settings on the server.");
  if (!s.address) problems.push("Add a sending (From) address in Newsletter → Settings.");
  if (!s.settings.postalAddress.trim()) problems.push("Add your physical postal mailing address in Newsletter → Settings (required by CAN-SPAM).");
  return { ok: problems.length === 0, problems, provider };
}

export async function renderCampaign(nl: { subject: string; preheader: string | null; content: unknown }) {
  const s = await newsletterSender();
  return renderNewsletter(
    { subject: nl.subject, preheader: nl.preheader, content: normalizeContent(nl.content) },
    { siteName: s.site.siteName, logoUrl: s.site.logoUrl, postalAddress: s.settings.postalAddress || "Postal address not set", sponsoredLabel: s.site.sponsoredLabel },
  );
}

/** Test send to admin-entered addresses. Marked [TEST]; uses sample unsubscribe links. Works without a provider (logged). */
export async function sendTest(newsletterId: string, emails: string[]) {
  const nl = await db.newsletter.findUnique({ where: { id: newsletterId } });
  if (!nl) throw new Error("Campaign not found");
  const { html, text } = await renderCampaign(nl);
  const s = await newsletterSender();
  const links = recipientLinks("test-preview-token-not-valid");
  const results = [];
  for (const to of emails) {
    results.push(await sendMessage({
      to, from: s.from || undefined, replyTo: s.replyTo, subject: `[TEST] ${nl.subject}`,
      html: personalize(html, links), text: personalize(text, links), tags: [{ name: "category", value: "newsletter_test" }],
    }));
  }
  return results;
}

async function suppressedSet(emails: string[]) {
  const out = new Set<string>();
  for (let i = 0; i < emails.length; i += 1000) {
    const rows = await db.emailSuppression.findMany({ where: { email: { in: emails.slice(i, i + 1000) } }, select: { email: true } });
    rows.forEach((r) => out.add(r.email));
  }
  return out;
}

/**
 * APPROVED/SCHEDULED → SENDING (atomic, so it can only start once), then
 * snapshots recipients into NewsletterSend rows. Safe to call repeatedly.
 */
export async function startCampaign(newsletterId: string, actorId?: string | null): Promise<{ ok: true; recipients: number } | { ok: false; error: string }> {
  const nl = await db.newsletter.findUnique({ where: { id: newsletterId } });
  if (!nl) return { ok: false, error: "Campaign not found." };
  if (!nl.approvedAt) return { ok: false, error: "This campaign must be approved before it can be sent." };
  const ready = await broadcastReadiness();
  if (!ready.ok) return { ok: false, error: ready.problems.join(" ") };
  const started = await db.newsletter.updateMany({
    where: { id: nl.id, status: { in: ["APPROVED", "SCHEDULED"] }, approvedAt: { not: null } },
    data: { status: "SENDING", sendStartedAt: new Date() },
  });
  if (!started.count) return { ok: false, error: "This campaign has already started sending or is not approved." };

  const content = normalizeContent(nl.content) as NewsletterContent & { topic?: TopicKey };
  const topic = (nl.content as { topic?: TopicKey } | null)?.topic;
  const subs = await db.newsletterSubscriber.findMany({ where: { status: "ACTIVE", confirmedAt: { not: null } }, select: { id: true, email: true, preferences: true } });
  const suppressed = await suppressedSet(subs.map((s) => s.email));
  const recipients = subs.filter((s) => !suppressed.has(s.email) && (!topic || readPreferences(s.preferences)[topic]));
  for (let i = 0; i < recipients.length; i += 1000) {
    await db.newsletterSend.createMany({ data: recipients.slice(i, i + 1000).map((r) => ({ newsletterId: nl.id, subscriberId: r.id })), skipDuplicates: true });
  }
  const total = await db.newsletterSend.count({ where: { newsletterId: nl.id } });
  await db.newsletter.update({ where: { id: nl.id }, data: { recipientCount: total } });
  await audit(actorId ?? null, "newsletter.send_start", "Newsletter", nl.id, { subject: nl.subject, recipients: total, provider: ready.provider, sections: content.sections.length });
  return { ok: true, recipients: total };
}

// ── Lease so only one worker processes a campaign at a time (works across instances). ──
const LEASE_MS = 5 * 60_000;
async function acquireLease(id: string) {
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const n = await db.$executeRaw`
    UPDATE "Newsletter" SET "stats" = COALESCE("stats", '{}'::jsonb) || jsonb_build_object('lockUntil', ${until}::text)
    WHERE "id" = ${id} AND "status" = 'SENDING'
      AND (("stats"->>'lockUntil') IS NULL OR ("stats"->>'lockUntil')::timestamptz < now())`;
  return n > 0;
}
async function renewLease(id: string) {
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  await db.$executeRaw`UPDATE "Newsletter" SET "stats" = COALESCE("stats", '{}'::jsonb) || jsonb_build_object('lockUntil', ${until}::text) WHERE "id" = ${id}`;
}
async function releaseLease(id: string, extra: Record<string, unknown> = {}) {
  const patch = JSON.stringify({ ...extra, lockUntil: null });
  await db.$executeRaw`UPDATE "Newsletter" SET "stats" = (COALESCE("stats", '{}'::jsonb) || ${patch}::jsonb) - 'lockUntil' WHERE "id" = ${id}`;
}

export type ProcessResult = { processed: number; sent: number; failed: number; skipped: number; done: boolean; stoppedReason?: string };

/**
 * Sends QUEUED rows in batches (≤100 per provider request, `maxPerRun` per
 * invocation). Re-checks suppression before each batch. Resumable: anything
 * left QUEUED is picked up by the next call (cron or "Send now").
 */
export async function processCampaign(newsletterId: string, opts: { maxPerRun?: number; batchSize?: number; delayMs?: number } = {}): Promise<ProcessResult> {
  const maxPerRun = opts.maxPerRun ?? 1000;
  const batchSize = Math.min(opts.batchSize ?? RESEND_BATCH_MAX, RESEND_BATCH_MAX);
  const delayMs = opts.delayMs ?? 600; // Resend default limit: 2 requests/second
  const res: ProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0, done: false };
  const nl = await db.newsletter.findUnique({ where: { id: newsletterId } });
  if (!nl || nl.status !== "SENDING") return { ...res, stoppedReason: "not sending" };
  if (!broadcastProvider()) return { ...res, stoppedReason: "no provider" };
  if (!(await acquireLease(nl.id))) return { ...res, stoppedReason: "locked" };
  let stopError: string | undefined;
  try {
    const { html, text } = await renderCampaign(nl);
    const sender = await newsletterSender();
    if (!sender.from) throw new Error("No sending address configured");
    while (res.processed < maxPerRun) {
      const current = await db.newsletter.findUnique({ where: { id: nl.id }, select: { status: true } });
      if (current?.status !== "SENDING") { res.stoppedReason = "status changed"; break; }
      const batch = await db.newsletterSend.findMany({
        where: { newsletterId: nl.id, status: "QUEUED" }, orderBy: { id: "asc" }, take: Math.min(batchSize, maxPerRun - res.processed),
        include: { subscriber: { select: { id: true, email: true, status: true, unsubscribeToken: true } } },
      });
      if (!batch.length) break;
      // Re-check suppression / status right before sending.
      const suppressed = await suppressedSet(batch.map((b) => b.subscriber.email));
      const skip = batch.filter((b) => suppressed.has(b.subscriber.email) || b.subscriber.status !== "ACTIVE");
      if (skip.length) {
        await db.newsletterSend.updateMany({ where: { id: { in: skip.map((b) => b.id) }, status: "QUEUED" }, data: { status: "SKIPPED", error: "Suppressed or no longer subscribed" } });
        res.skipped += skip.length;
        res.processed += skip.length;
      }
      const go = batch.filter((b) => !skip.includes(b));
      if (!go.length) continue;
      const msgs: OutgoingEmail[] = go.map((b) => {
        const links = recipientLinks(b.subscriber.unsubscribeToken);
        return {
          from: sender.from, to: b.subscriber.email, replyTo: sender.replyTo, subject: nl.subject,
          html: personalize(html, links), text: personalize(text, links),
          headers: listUnsubscribeHeaders(b.subscriber.unsubscribeToken),
          tags: [{ name: "category", value: "newsletter" }, { name: "newsletter_id", value: nl.id }],
        };
      });
      const idemKey = `nl-${nl.id}-${crypto.createHash("sha256").update(go.map((b) => b.id).join(",")).digest("hex").slice(0, 40)}`;
      let results;
      try {
        results = await sendBroadcastBatch(msgs, idemKey);
      } catch (e) {
        const err = e as ProviderError;
        if (err instanceof ProviderError && err.retryable) { res.stoppedReason = `retry later: ${err.message}`; break; }
        stopError = err.message || "Provider error";
        break;
      }
      const now = new Date();
      await Promise.all(go.map((b, i) => {
        const r = results[i];
        return r?.ok
          ? db.newsletterSend.updateMany({ where: { id: b.id, status: "QUEUED" }, data: { status: "SENT", providerMessageId: r.id, sentAt: now, error: null } })
          : db.newsletterSend.updateMany({ where: { id: b.id, status: "QUEUED" }, data: { status: "FAILED", error: (r && !r.ok ? r.error : "No result").slice(0, 500) } });
      }));
      const sentIds = go.filter((_, i) => results[i]?.ok);
      res.sent += sentIds.length;
      res.failed += go.length - sentIds.length;
      res.processed += go.length;
      if (sentIds.length) await db.subscriberEvent.createMany({ data: sentIds.map((b) => ({ subscriberId: b.subscriberId, type: "sent", data: { newsletterId: nl.id } })) });
      await renewLease(nl.id);
      if (delayMs && res.processed < maxPerRun) await new Promise((r) => setTimeout(r, delayMs));
    }
    const remaining = await db.newsletterSend.count({ where: { newsletterId: nl.id, status: "QUEUED" } });
    if (stopError) {
      await db.newsletter.updateMany({ where: { id: nl.id, status: "SENDING" }, data: { status: "FAILED" } });
      await audit(null, "newsletter.send_failed", "Newsletter", nl.id, { error: stopError, remaining });
    } else if (remaining === 0) {
      const done = await db.newsletter.updateMany({ where: { id: nl.id, status: "SENDING" }, data: { status: "SENT", sentAt: new Date() } });
      res.done = done.count > 0;
      if (res.done) await audit(null, "newsletter.sent", "Newsletter", nl.id, { subject: nl.subject });
    }
  } finally {
    const stats = await computeStats(nl.id);
    await releaseLease(nl.id, { ...stats, ...(stopError ? { lastError: stopError } : {}), lastRunAt: new Date().toISOString() });
  }
  return res;
}

/** Fire-and-forget processing after "Send now" (cron continues anything left). */
export function kickOffProcessing(newsletterId: string) {
  void processCampaign(newsletterId).catch((e) => console.error(`[newsletter ${newsletterId}]`, e));
}

/** Called by /api/cron/: starts due scheduled campaigns and continues sending ones. */
export async function processDueNewsletters() {
  const out = { started: 0, processed: 0, errors: [] as string[] };
  const due = await db.newsletter.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } }, select: { id: true, scheduledFor: true } });
  for (const d of due) {
    // Never send a stale issue: if setup blocked it for >12h past its time, un-schedule it instead.
    if (d.scheduledFor && Date.now() - d.scheduledFor.getTime() > 12 * 3600_000 && !(await broadcastReadiness()).ok) {
      await db.newsletter.updateMany({ where: { id: d.id, status: "SCHEDULED" }, data: { status: "APPROVED", scheduledFor: null } });
      const patch = JSON.stringify({ lastError: "Missed its scheduled time because email sending wasn't set up. Reschedule it once setup is complete." });
      await db.$executeRaw`UPDATE "Newsletter" SET "stats" = COALESCE("stats", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${d.id}`;
      out.errors.push(`${d.id}: missed schedule`);
      continue;
    }
    const r = await startCampaign(d.id);
    if (r.ok) out.started++;
    else {
      out.errors.push(`${d.id}: ${r.error}`);
      const patch = JSON.stringify({ lastError: r.error, lastRunAt: new Date().toISOString() });
      await db.$executeRaw`UPDATE "Newsletter" SET "stats" = COALESCE("stats", '{}'::jsonb) || ${patch}::jsonb WHERE "id" = ${d.id}`;
    }
  }
  const sending = await db.newsletter.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const s of sending) out.processed += (await processCampaign(s.id)).processed;
  return out;
}

export type CampaignStats = { queued: number; sent: number; delivered: number; bounced: number; complained: number; failed: number; skipped: number; opened: number; clicked: number; reported: boolean };

/** Real numbers only, from NewsletterSend rows. `reported` = the provider has sent at least one webhook. */
export async function computeStats(newsletterId: string): Promise<CampaignStats> {
  const [groups, opened, clicked] = await Promise.all([
    db.newsletterSend.groupBy({ by: ["status"], where: { newsletterId }, _count: { _all: true } }),
    db.newsletterSend.count({ where: { newsletterId, openedAt: { not: null } } }),
    db.newsletterSend.count({ where: { newsletterId, clickedAt: { not: null } } }),
  ]);
  const c = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  const delivered = c("DELIVERED"), bounced = c("BOUNCED"), complained = c("COMPLAINED");
  return {
    queued: c("QUEUED"), sent: c("SENT") + delivered + bounced + complained, delivered: delivered + complained, bounced, complained,
    failed: c("FAILED"), skipped: c("SKIPPED"), opened, clicked, reported: delivered + bounced + complained + opened + clicked > 0,
  };
}

import "server-only";
import { db } from "@/lib/db";
import { extractInto } from "./collect";
import { sniffFileType } from "./extract";
import { dateFromText, guessDocType } from "./links";
import { ingestDocument } from "./store";
import type { FileType } from "./shared";

/**
 * Records inbox: a dedicated email address (e.g. records@tcountyconnect.com) that clerks send minutes and
 * agendas to. Checked by IMAP every 30 minutes from the cron; each attachment (PDF, Word, scans) becomes a
 * document, and an email with no attachment is kept as a text document. Read emails are marked as read and left
 * in the mailbox. The sender is matched to a source by the clerk email saved on the source.
 *
 * Settings (environment): GOVWATCH_IMAP_HOST, GOVWATCH_IMAP_USER, GOVWATCH_IMAP_PASSWORD, optional
 * GOVWATCH_IMAP_PORT (993) and GOVWATCH_IMAP_MAILBOX (INBOX). GOVWATCH_RECORDS_EMAIL is the address shown in admin.
 */
export const inboxConfigured = () => !!(process.env.GOVWATCH_IMAP_HOST && process.env.GOVWATCH_IMAP_USER && process.env.GOVWATCH_IMAP_PASSWORD);
export const recordsAddress = () => process.env.GOVWATCH_RECORDS_EMAIL?.trim() || process.env.GOVWATCH_IMAP_USER?.trim() || null;

export type MailDoc = { buf: Buffer; fileType: FileType; title: string };
export type ParsedMail = { from: string | null; subject: string | null; date: Date | null; docs: MailDoc[] };

/** Turns one raw email into documents (pure apart from parsing). */
export async function mailToDocuments(raw: Buffer): Promise<ParsedMail> {
  const { simpleParser } = await import("mailparser");
  const m = await simpleParser(raw);
  const from = m.from?.value?.[0]?.address?.toLowerCase() ?? null;
  const subject = m.subject?.trim() || null;
  const docs: MailDoc[] = [];
  for (const a of m.attachments ?? []) {
    if (a.related || a.contentDisposition === "inline" && /^image\//.test(a.contentType) && (a.size ?? 0) < 30_000) continue; // signatures / logos
    const ft = sniffFileType(a.content, { mime: a.contentType, filename: a.filename });
    if (!ft || ft === "html") continue;
    docs.push({ buf: a.content, fileType: ft, title: a.filename?.replace(/\.[a-z0-9]+$/i, "") || subject || "Emailed document" });
  }
  if (!docs.length) {
    const text = (m.text ?? "").trim();
    if (text.length > 80) docs.push({ buf: Buffer.from(`${subject ? `Subject: ${subject}\n` : ""}${from ? `From: ${from}\n` : ""}\n${text}`, "utf8"), fileType: "text", title: subject || "Emailed message" });
  }
  return { from, subject, date: m.date ?? null, docs };
}

/** Stores the documents from one email (matched to a source by the sender's address). */
export async function ingestMail(mail: ParsedMail) {
  const source = mail.from
    ? await db.govSource.findFirst({ where: { clerkEmail: { equals: mail.from, mode: "insensitive" } }, select: { id: true } })
    : null;
  let created = 0, duplicates = 0;
  for (const d of mail.docs) {
    const r = await ingestDocument({
      buf: d.buf, fileType: d.fileType, title: d.title, origin: "email", sourceId: source?.id ?? null, docType: guessDocType(`${d.title} ${mail.subject ?? ""}`),
      meetingDate: dateFromText(`${d.title} ${mail.subject ?? ""}`), emailFrom: mail.from, emailSubject: mail.subject,
    });
    if (r.outcome === "duplicate") { duplicates++; continue; }
    created++;
    await extractInto(r.id, d.buf, d.fileType);
  }
  return { created, duplicates, sourceId: source?.id ?? null };
}

/** Reads unread emails from the records inbox (at most 25 per run). */
export async function pollRecordsInbox() {
  if (!inboxConfigured()) return { skipped: "not configured" };
  const run = await db.govCheckRun.create({ data: { trigger: "email" } });
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: process.env.GOVWATCH_IMAP_HOST!, port: Number(process.env.GOVWATCH_IMAP_PORT || 993), secure: (process.env.GOVWATCH_IMAP_SECURE ?? "true") !== "false",
    auth: { user: process.env.GOVWATCH_IMAP_USER!, pass: process.env.GOVWATCH_IMAP_PASSWORD! }, logger: false,
  });
  let emails = 0, created = 0, duplicates = 0;
  const errors: string[] = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock(process.env.GOVWATCH_IMAP_MAILBOX || "INBOX");
    try {
      const uids = ((await client.search({ seen: false }, { uid: true })) || []).slice(0, 25);
      const done: number[] = [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        try {
          const r = await ingestMail(await mailToDocuments(msg.source));
          emails++; created += r.created; duplicates += r.duplicates;
          done.push(uid);
        } catch (e) {
          errors.push((e as Error).message.slice(0, 200));
        }
      }
      if (done.length) await client.messageFlagsAdd(done.map(String).join(","), ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    errors.push(`Couldn't read the records inbox: ${(e as Error).message.slice(0, 300)}`);
  }
  const ok = !errors.length || emails > 0;
  await db.govCheckRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status: ok ? "ok" : "error", newDocs: created, duplicates, message: `${emails} email${emails === 1 ? "" : "s"} read, ${created} new document${created === 1 ? "" : "s"}${errors.length ? `; ${errors.join("; ")}` : ""}`.slice(0, 2000) } });
  return { emails, created, duplicates, errors: errors.length };
}

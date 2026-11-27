import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { MIME, imageMime } from "./extract";
import type { DocType, FileType } from "./shared";

export const MAX_DOC_BYTES = 30 * 1024 * 1024;

export type IngestInput = {
  buf: Buffer;
  fileType: FileType;
  title: string;
  origin: "crawl" | "email" | "upload";
  sourceId?: string | null;
  sourceUrl?: string | null;
  docType?: DocType;
  meetingDate?: Date | null;
  httpEtag?: string | null;
  httpLastModified?: string | null;
  emailFrom?: string | null;
  emailSubject?: string | null;
  uploadedById?: string | null;
};
export type IngestResult = { outcome: "new" | "revision" | "duplicate"; id: string };

export const sha256 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex");

const EXT: Record<FileType, string> = { pdf: "pdf", docx: "docx", doc: "doc", html: "html", image: "jpg", text: "txt" };

/**
 * Stores one document, unchanged, and records it — unless the exact same file is already stored (duplicate).
 * The same address with different content is a revision: the new file is kept as its own document, linked to
 * the earlier one (which is marked superseded). Revisions under a different address (e.g. "amended minutes")
 * are linked after analysis, once the meeting date is known (see linkRevisionByMeeting).
 */
export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  if (input.buf.length > MAX_DOC_BYTES) throw new Error(`File is larger than ${MAX_DOC_BYTES / 1024 / 1024} MB.`);
  const hash = sha256(input.buf);
  const dup = await db.govDocument.findUnique({ where: { sha256: hash }, select: { id: true } });
  if (dup) return { outcome: "duplicate", id: dup.id };

  const prev = input.sourceUrl
    ? await db.govDocument.findFirst({ where: { sourceUrl: input.sourceUrl, supersededAt: null }, orderBy: { discoveredAt: "desc" }, select: { id: true } })
    : null;

  const mimeType = input.fileType === "image" ? imageMime(input.buf) : MIME[input.fileType];
  // HTML pages are kept byte-for-byte but stored as plain text, so a saved page can never run as a web page on our domain.
  const storedMime = input.fileType === "html" ? "text/plain; charset=utf-8" : mimeType;
  const ext = input.fileType === "image" ? (mimeType === "image/png" ? "png" : mimeType === "image/tiff" ? "tif" : "jpg") : EXT[input.fileType];
  const { key, url } = await putObject(input.buf, storedMime, `gov-${input.title}`, ext);

  try {
    const doc = await db.govDocument.create({
      data: {
        sourceId: input.sourceId ?? null, title: input.title.slice(0, 500) || "Untitled document", docType: input.docType ?? "other",
        fileType: input.fileType, origin: input.origin, sourceUrl: input.sourceUrl ?? null, storageKey: key, storageUrl: url,
        mimeType, sizeBytes: input.buf.length, sha256: hash, httpEtag: input.httpEtag ?? null, httpLastModified: input.httpLastModified ?? null,
        meetingDate: input.meetingDate ?? null, revisionOfId: prev?.id ?? null, emailFrom: input.emailFrom ?? null,
        emailSubject: input.emailSubject ?? null, uploadedById: input.uploadedById ?? null,
      },
      select: { id: true },
    });
    if (prev) await db.govDocument.update({ where: { id: prev.id }, data: { supersededAt: new Date() } });
    return { outcome: prev ? "revision" : "new", id: doc.id };
  } catch (e) {
    // Same file stored by a parallel run a moment ago.
    if ((e as { code?: string }).code === "P2002") {
      const again = await db.govDocument.findUnique({ where: { sha256: hash }, select: { id: true } });
      if (again) return { outcome: "duplicate", id: again.id };
    }
    throw e;
  }
}

/**
 * Revised minutes posted under a new address: once a document's meeting date is known, an earlier document from
 * the same source with the same type and meeting date becomes its previous version.
 */
export async function linkRevisionByMeeting(docId: string) {
  const d = await db.govDocument.findUnique({ where: { id: docId }, select: { id: true, sourceId: true, docType: true, meetingDate: true, revisionOfId: true, discoveredAt: true } });
  if (!d || !d.sourceId || !d.meetingDate || d.revisionOfId || !["minutes", "agenda"].includes(d.docType)) return null;
  const prev = await db.govDocument.findFirst({
    where: { id: { not: d.id }, sourceId: d.sourceId, docType: d.docType, meetingDate: d.meetingDate, supersededAt: null, discoveredAt: { lt: d.discoveredAt } },
    orderBy: { discoveredAt: "desc" }, select: { id: true },
  });
  if (!prev) return null;
  await db.$transaction([
    db.govDocument.update({ where: { id: d.id }, data: { revisionOfId: prev.id } }),
    db.govDocument.update({ where: { id: prev.id }, data: { supersededAt: new Date() } }),
  ]);
  return prev.id;
}

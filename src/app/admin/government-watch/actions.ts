"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import type { ActionState } from "@/components/ui/form-message";
import { analyzeDocument } from "@/lib/gov-watch/analyze";
import { draftArticle } from "@/lib/gov-watch/articles";
import { auditCheck, checkSource, extractInto } from "@/lib/gov-watch/collect";
import { sniffFileType } from "@/lib/gov-watch/extract";
import { PAUSED_KEY, PUBLIC_KEY, setSetting } from "@/lib/gov-watch/settings";
import { COLLECTION_METHODS, DOC_REVIEW, DOC_TYPES, FINDING_REVIEW, GOV_TYPES, VERIFICATION } from "@/lib/gov-watch/shared";
import { loadStarterSources } from "@/lib/gov-watch/sources";
import { ingestDocument, MAX_DOC_BYTES } from "@/lib/gov-watch/store";

const BASE = "/admin/government-watch";
const refresh = () => revalidatePath(BASE, "layout");
const idList = (v: FormDataEntryValue | null) => String(v ?? "").split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9]{6,40}$/i.test(s)).slice(0, 200);
const httpUrl = z.string().max(2000).transform((v) => {
  const t = v.trim();
  if (!t) return null;
  try { const u = new URL(t); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
});

export async function loadStarterSourcesAction(): Promise<ActionState> {
  const user = await requireAdmin();
  const r = await loadStarterSources();
  await audit(user.id, "govwatch.sources_loaded", "GovSource", undefined, r);
  refresh();
  return { ok: true, message: r.added ? `Added ${r.added} sources. Each one is marked “Needs review”.` : "All starter sources are already in the list." };
}

export async function checkNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (!(await db.govSource.findUnique({ where: { id }, select: { id: true } }))) return { error: "Source not found." };
  const r = await checkSource(id, "manual");
  await auditCheck(user.id, id, r);
  refresh();
  return r.ok ? { ok: true, message: `Checked: ${r.message}` } : { error: `Check failed: ${r.message}` };
}

const sourceSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2, "Enter a name.").max(200),
  community: z.string().trim().min(2, "Enter the community.").max(100),
  govType: z.enum(GOV_TYPES),
  website: httpUrl, minutesUrl: httpUrl, agendasUrl: httpUrl,
  extraUrls: z.string().max(5000).transform((v) => v.split(/\s+/).map((x) => { try { const u = new URL(x); return /^https?:$/.test(u.protocol) ? u.toString() : null; } catch { return null; } }).filter((x): x is string => !!x).slice(0, 10)),
  clerkName: z.string().max(200), clerkTitle: z.string().max(200), clerkEmail: z.string().max(200), clerkPhone: z.string().max(60),
  collectionMethod: z.enum(COLLECTION_METHODS),
  verification: z.enum(VERIFICATION),
  notes: z.string().max(5000),
  active: z.boolean(),
});

export async function saveSourceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = sourceSchema.safeParse({
    id: fd.get("id") || undefined, name: fd.get("name") ?? "", community: fd.get("community") ?? "", govType: fd.get("govType"),
    website: fd.get("website") ?? "", minutesUrl: fd.get("minutesUrl") ?? "", agendasUrl: fd.get("agendasUrl") ?? "", extraUrls: fd.get("extraUrls") ?? "",
    clerkName: fd.get("clerkName") ?? "", clerkTitle: fd.get("clerkTitle") ?? "", clerkEmail: fd.get("clerkEmail") ?? "", clerkPhone: fd.get("clerkPhone") ?? "",
    collectionMethod: fd.get("collectionMethod"), verification: fd.get("verification"), notes: fd.get("notes") ?? "", active: fd.get("active") === "on",
  });
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const v = p.data;
  const email = v.clerkEmail.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "The clerk email doesn't look right." };
  const data = {
    name: sanitizePlain(v.name, 200), community: sanitizePlain(v.community, 100), govType: v.govType, website: v.website, minutesUrl: v.minutesUrl,
    agendasUrl: v.agendasUrl, extraUrls: v.extraUrls, clerkName: sanitizePlain(v.clerkName, 200) || null, clerkTitle: sanitizePlain(v.clerkTitle, 200) || null,
    clerkEmail: email || null, clerkPhone: sanitizePlain(v.clerkPhone, 60) || null, collectionMethod: v.collectionMethod, verification: v.verification,
    notes: sanitizePlain(v.notes, 5000) || null, active: v.active,
  };
  try {
    if (v.id) {
      const prev = await db.govSource.findUnique({ where: { id: v.id }, select: { verification: true } });
      if (!prev) return { error: "Source not found." };
      await db.govSource.update({ where: { id: v.id }, data: { ...data, ...(v.verification === "verified" && prev.verification !== "verified" ? { verifiedAt: new Date() } : {}) } });
      await audit(user.id, "govwatch.source_updated", "GovSource", v.id, { name: data.name, verification: data.verification, active: data.active });
      refresh();
      return { ok: true, message: "Source saved." };
    }
    const s = await db.govSource.create({ data: { ...data, ...(v.verification === "verified" ? { verifiedAt: new Date() } : {}) } });
    await audit(user.id, "govwatch.source_created", "GovSource", s.id, { name: data.name });
    refresh();
    redirect(`${BASE}/sources/${s.id}/`);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "A source with this name already exists." };
    throw e;
  }
}

/** Mark potential stories reviewed / ignored / published (or back to new). */
export async function setFindingStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const ids = idList(fd.get("ids"));
  const status = String(fd.get("status") ?? "");
  if (!ids.length || !(FINDING_REVIEW as readonly string[]).includes(status)) return { error: "Choose at least one story." };
  const r = await db.govFinding.updateMany({ where: { id: { in: ids } }, data: { reviewStatus: status, reviewedAt: status === "new" ? null : new Date(), reviewedById: status === "new" ? null : user.id } });
  await audit(user.id, "govwatch.findings_status", "GovFinding", ids[0], { count: r.count, status });
  refresh();
  return { ok: true, message: `${r.count} stor${r.count === 1 ? "y" : "ies"} marked ${status}.` };
}

export async function setDocumentReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const ids = idList(fd.get("ids"));
  const status = String(fd.get("status") ?? "");
  if (!ids.length || !(DOC_REVIEW as readonly string[]).includes(status)) return { error: "Choose a document." };
  const r = await db.govDocument.updateMany({ where: { id: { in: ids } }, data: { reviewStatus: status } });
  await audit(user.id, "govwatch.documents_review", "GovDocument", ids[0], { count: r.count, status });
  refresh();
  return { ok: true, message: `${r.count} document${r.count === 1 ? "" : "s"} marked ${status.replace("_", " ")}.` };
}

/** Assign a source, fix the type/date/title of a document (e.g. one that arrived by email). */
export async function updateDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const sourceId = String(fd.get("sourceId") ?? "") || null;
  const docType = String(fd.get("docType") ?? "");
  const date = String(fd.get("meetingDate") ?? "");
  const title = sanitizePlain(String(fd.get("title") ?? ""), 500);
  if (!(DOC_TYPES as readonly string[]).includes(docType)) return { error: "Choose a document type." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Enter a valid meeting date." };
  if (sourceId && !(await db.govSource.findUnique({ where: { id: sourceId }, select: { id: true } }))) return { error: "Source not found." };
  await db.govDocument.update({ where: { id }, data: { sourceId, docType, title: title || undefined, meetingDate: date ? new Date(`${date}T12:00:00Z`) : null } });
  await audit(user.id, "govwatch.document_updated", "GovDocument", id, { sourceId, docType });
  refresh();
  return { ok: true, message: "Document saved." };
}

/** Analyze now (or again, after a change). Replaces findings that were never reviewed. */
export async function analyzeNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  await db.govDocument.updateMany({ where: { id, status: "analyzed" }, data: { status: "new" } });
  const r = await analyzeDocument(id);
  await audit(user.id, "govwatch.analyze_now", "GovDocument", id, { ok: r.ok });
  refresh();
  return r.ok ? { ok: true, message: r.message } : { error: r.message };
}

export async function uploadDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a file to upload." };
  if (file.size > MAX_DOC_BYTES) return { error: "That file is larger than 30 MB." };
  const buf = Buffer.from(await file.arrayBuffer());
  const fileType = sniffFileType(buf, { mime: file.type, filename: file.name });
  if (!fileType) return { error: "Upload a PDF, Word document (.docx or .doc), web page (.html), text file or scanned image (JPG, PNG, TIFF)." };
  const sourceId = String(fd.get("sourceId") ?? "") || null;
  const docType = String(fd.get("docType") ?? "other");
  const date = String(fd.get("meetingDate") ?? "");
  const sourceUrl = httpUrl.safeParse(String(fd.get("sourceUrl") ?? "")).data ?? null;
  const r = await ingestDocument({
    buf, fileType, title: sanitizePlain(String(fd.get("title") ?? ""), 300) || file.name.replace(/\.[a-z0-9]+$/i, ""), origin: "upload",
    sourceId, sourceUrl, docType: (DOC_TYPES as readonly string[]).includes(docType) ? (docType as (typeof DOC_TYPES)[number]) : "other",
    meetingDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null, uploadedById: user.id,
  });
  if (r.outcome === "duplicate") return { error: "This exact file is already in Government Watch.", message: r.id };
  await extractInto(r.id, buf, fileType);
  await audit(user.id, "govwatch.document_uploaded", "GovDocument", r.id, { fileType, outcome: r.outcome });
  refresh();
  redirect(`${BASE}/documents/${r.id}/?uploaded=1`);
}

/** Draft a news article (DRAFT in Articles, never published automatically) from documents and/or stories. */
export async function draftArticleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const r = await draftArticle({ documentIds: idList(fd.get("documentIds")), findingIds: idList(fd.get("findingIds")), userId: user.id });
  if (!r.ok) return { error: r.message };
  refresh();
  revalidatePath("/admin/articles/");
  redirect(`/admin/articles/${r.articleId}/?from=government-watch`);
}

export async function setGovWatchOptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const key = String(fd.get("key") ?? "");
  const on = fd.get("value") === "on";
  if (key !== PUBLIC_KEY && key !== PAUSED_KEY) return { error: "Unknown setting." };
  await setSetting(key, on);
  await audit(user.id, "govwatch.setting", "Setting", key, { value: on });
  refresh();
  revalidatePath("/government-watch", "layout");
  return { ok: true, message: key === PUBLIC_KEY ? (on ? "The public Government Watch section is now live." : "The public Government Watch section is turned off.") : on ? "Automatic collection paused." : "Automatic collection resumed." };
}

import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSetting, PAUSED_KEY, setSetting } from "./settings";
import { dateFromText, discoverDocumentLinks, fileTypeFromUrl, type DocLink } from "./links";
import { extractText, sniffFileType } from "./extract";
import { ingestDocument, MAX_DOC_BYTES } from "./store";

/**
 * Daily collection. Each source's minutes / agendas / extra pages are fetched, document links are found, and
 * only files not seen before are downloaded (known addresses are re-checked cheaply with ETag/Last-Modified, and
 * every file is deduplicated by content). New files are stored unchanged and their text extracted; analysis runs
 * separately (analyzePending). Work is spread over the 10-minute cron: a few sources per run.
 */
const UA = "TCountyConnect-GovernmentWatch/1.0 (+https://tcountyconnect.com; public records monitor)";
const PAGE_TIMEOUT = 25_000;
const FILE_TIMEOUT = 60_000;
/** New documents downloaded per source per check (older archive items are picked up on later days). */
export const MAX_NEW_PER_CHECK = 8;
/** Follow-up pages (e.g. a "2026 minutes" sub-page) opened per check. */
const MAX_SUBPAGES = 6;
const DAY = 24 * 3600_000;

/** A readable reason for a failed request ("fetch failed" alone doesn't say why). */
export function netError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  if (err.name === "AbortError") return "timed out";
  const code = err.cause?.code ?? "";
  const why: Record<string, string> = {
    ENOTFOUND: "address not found (check the web address)", ECONNREFUSED: "connection refused", ECONNRESET: "connection dropped",
    ETIMEDOUT: "timed out", CERT_HAS_EXPIRED: "the site's security certificate has expired", UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the site's security certificate couldn't be verified",
    ERR_TLS_CERT_ALTNAME_INVALID: "the site's security certificate doesn't match its address",
  };
  return why[code] ?? (code ? `${err.message} (${code})` : err.message);
}

async function get(url: string, timeout: number, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { ...init, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "*/*", ...(init.headers ?? {}) } });
  } finally {
    clearTimeout(t);
  }
}

async function readCapped(res: Response, cap: number): Promise<Buffer> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > cap) throw new Error(`File is larger than ${Math.round(cap / 1024 / 1024)} MB.`);
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw new Error(`File is larger than ${Math.round(cap / 1024 / 1024)} MB.`); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

const pagesFor = (s: { minutesUrl: string | null; agendasUrl: string | null; website: string | null; extraUrls: string[] }) => {
  const list = [s.minutesUrl, s.agendasUrl, ...s.extraUrls].filter((u): u is string => !!u && /^https?:\/\//.test(u));
  if (!list.length && s.website && /^https?:\/\//.test(s.website)) list.push(s.website);
  return [...new Set(list)];
};

export type CheckSummary = { ok: boolean; message: string; linksFound: number; newDocs: number; revisions: number; duplicates: number };

/** Checks one source now (daily run or the Check Now button). */
export async function checkSource(sourceId: string, trigger: "cron" | "manual" = "manual"): Promise<CheckSummary> {
  const s = await db.govSource.findUniqueOrThrow({ where: { id: sourceId } });
  const run = await db.govCheckRun.create({ data: { sourceId, trigger } });
  const pages = pagesFor(s);
  const result: CheckSummary = { ok: true, message: "", linksFound: 0, newDocs: 0, revisions: 0, duplicates: 0 };
  const errors: string[] = [];
  try {
    if (!pages.length) throw new Error("No website, minutes or agendas address to check. Add one on the source page, or collect this source by email or upload.");
    const links = new Map<string, DocLink>();
    const subpages: string[] = [];
    let pagesOk = 0;
    for (const page of pages) {
      try {
        const res = await get(page, PAGE_TIMEOUT, { headers: { Accept: "text/html,application/xhtml+xml,*/*" } });
        if (!res.ok) { errors.push(`${page} → HTTP ${res.status}`); continue; }
        const ctype = res.headers.get("content-type") ?? "";
        if (!/html|xml|text\/plain/.test(ctype) && fileTypeFromUrl(page)) { links.set(page, { url: page, text: page, fileType: fileTypeFromUrl(page), docType: "other", score: 9 }); pagesOk++; continue; }
        const html = (await readCapped(res, 5 * 1024 * 1024)).toString("utf8");
        pagesOk++;
        for (const l of discoverDocumentLinks(html, res.url || page)) {
          if (l.fileType && l.fileType !== "html") links.set(l.url, l);
          else if (!pages.includes(l.url)) subpages.push(l.url);
        }
      } catch (e) {
        errors.push(`${page} → ${netError(e)}`);
      }
    }
    // One level deeper: year / archive pages linked from the minutes page.
    for (const page of [...new Set(subpages)].slice(0, MAX_SUBPAGES)) {
      try {
        const res = await get(page, PAGE_TIMEOUT);
        if (!res.ok || !/html/.test(res.headers.get("content-type") ?? "")) continue;
        const html = (await readCapped(res, 5 * 1024 * 1024)).toString("utf8");
        for (const l of discoverDocumentLinks(html, res.url || page)) if (l.fileType && l.fileType !== "html" && !links.has(l.url)) links.set(l.url, l);
      } catch { /* a sub-page failing isn't a source failure */ }
    }
    if (!pagesOk) throw new Error(errors.join("; ") || "The pages couldn't be opened.");
    result.linksFound = links.size;

    // Newest-looking first (dates in the link text), then by page order/score.
    const ordered = [...links.values()].sort((a, b) => (dateFromText(b.text + " " + b.url)?.getTime() ?? 0) - (dateFromText(a.text + " " + a.url)?.getTime() ?? 0) || b.score - a.score);
    let downloads = 0;
    for (const l of ordered) {
      if (downloads >= MAX_NEW_PER_CHECK) break;
      const known = await db.govDocument.findFirst({ where: { sourceUrl: l.url }, orderBy: { discoveredAt: "desc" }, select: { id: true, httpEtag: true, httpLastModified: true, discoveredAt: true } });
      // Known address: only re-download when the server says it changed (or, without validators, weekly).
      const headers: Record<string, string> = {};
      if (known?.httpEtag) headers["If-None-Match"] = known.httpEtag;
      if (known?.httpLastModified) headers["If-Modified-Since"] = known.httpLastModified;
      if (known && !known.httpEtag && !known.httpLastModified && Date.now() - known.discoveredAt.getTime() < 7 * DAY) continue;
      try {
        const res = await get(l.url, FILE_TIMEOUT, { headers });
        if (res.status === 304) continue;
        if (!res.ok) { errors.push(`${l.url} → HTTP ${res.status}`); continue; }
        downloads++;
        const buf = await readCapped(res, MAX_DOC_BYTES);
        const fileType = sniffFileType(buf, { mime: res.headers.get("content-type"), url: l.url });
        if (!fileType || fileType === "html") continue; // not a document after all
        const r = await ingestDocument({
          buf, fileType, title: l.text || decodeURIComponent(new URL(l.url).pathname.split("/").pop() ?? "Document"), origin: "crawl", sourceId,
          sourceUrl: l.url, docType: l.docType, meetingDate: dateFromText(`${l.text} ${l.url}`),
          httpEtag: res.headers.get("etag"), httpLastModified: res.headers.get("last-modified"),
        });
        if (r.outcome === "duplicate") { result.duplicates++; continue; }
        if (r.outcome === "revision") result.revisions++;
        else result.newDocs++;
        await extractInto(r.id, buf, fileType);
      } catch (e) {
        errors.push(`${l.url} → ${netError(e)}`);
      }
    }
    result.message = `${result.linksFound} document link${result.linksFound === 1 ? "" : "s"} found; ${result.newDocs} new, ${result.revisions} revised${errors.length ? `; ${errors.length} problem${errors.length === 1 ? "" : "s"}: ${errors.slice(0, 3).join("; ")}` : ""}.`;
    await db.govSource.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date(), lastSuccessAt: new Date(), lastStatus: "ok", lastError: errors.length ? errors.slice(0, 5).join("\n").slice(0, 2000) : null, consecutiveFailures: 0 } });
  } catch (e) {
    result.ok = false;
    result.message = (e as Error).message.slice(0, 1000);
    await db.govSource.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date(), lastStatus: "error", lastError: result.message, consecutiveFailures: { increment: 1 } } });
  }
  await db.govCheckRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), status: result.ok ? "ok" : "error", linksFound: result.linksFound, newDocs: result.newDocs, revisions: result.revisions, duplicates: result.duplicates, message: result.message.slice(0, 2000) } });
  return result;
}

/** Extracts and stores text (failures leave the document for the AI to read from the original file). */
export async function extractInto(id: string, buf: Buffer, fileType: Parameters<typeof extractText>[1]) {
  try {
    const x = await extractText(buf, fileType);
    await db.govDocument.update({ where: { id }, data: { textContent: x.text, pageCount: x.pageCount, extractionMethod: x.scanned ? "ocr_ai" : x.method } });
  } catch (e) {
    await db.govDocument.update({ where: { id }, data: { extractionMethod: fileType === "pdf" || fileType === "image" ? "ocr_ai" : "none", analysisError: `Text extraction failed: ${(e as Error).message.slice(0, 200)}` } });
  }
}

/** Cron step: check up to `limit` active sources that haven't been checked in the last day (never-checked first). */
export async function checkDueSources(limit = 2) {
  const cutoff = new Date(Date.now() - DAY);
  const due = await db.govSource.findMany({
    where: { active: true, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }] },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }], take: limit, select: { id: true },
  });
  let ok = 0, failed = 0;
  for (const s of due) {
    if ((await checkSource(s.id, "cron")).ok) ok++;
    else failed++;
  }
  return { checked: due.length, ok, failed };
}

/** Everything Government Watch does on a cron tick. Never throws. */
export async function runGovWatchCron() {
  const out: Record<string, unknown> = {};
  try {
    const paused = await getSetting<boolean>(PAUSED_KEY);
    if (paused) return { skipped: "paused" };
    out.sources = await checkDueSources(2);
  } catch (e) { out.sourcesError = (e as Error).message; }
  try {
    const { pollRecordsInbox, inboxConfigured } = await import("./inbox");
    if (inboxConfigured()) {
      const last = (await getSetting<string>("govWatchInboxCheckedAt")) ?? "";
      if (!last || Date.now() - new Date(last).getTime() > 30 * 60_000) {
        await setSetting("govWatchInboxCheckedAt", new Date().toISOString());
        out.inbox = await pollRecordsInbox();
      }
    }
  } catch (e) { out.inboxError = (e as Error).message; }
  try {
    const { analyzePending } = await import("./analyze");
    out.analysis = await analyzePending(3);
  } catch (e) { out.analysisError = (e as Error).message; }
  return out;
}

export async function auditCheck(userId: string | null, sourceId: string, r: CheckSummary) {
  await audit(userId, "govwatch.check_now", "GovSource", sourceId, { ok: r.ok, newDocs: r.newDocs, revisions: r.revisions });
}

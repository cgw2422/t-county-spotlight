/**
 * Migration runs: create a MigrationRun row, fetch (REST) or parse (WXR),
 * import, and persist the log + report. Used by the CLI and the admin UI.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { fetchRestSnapshot } from "./rest-client";
import { parseWxr } from "./wxr";
import { importSnapshot } from "./importer";
import { emptyReport, reportToMarkdown, type ImportReport } from "./report";

export type MigrationOptions = {
  source: "rest" | "wxr";
  baseUrl?: string;
  /** WXR XML text (source=wxr). Never stored in the run options. */
  wxrXml?: string;
  wxrFilename?: string;
  dryRun?: boolean;
  force?: boolean;
  skipMedia?: boolean;
  importAllMedia?: boolean;
  limitPerType?: number;
  /** Defaults to WP_USERNAME / WP_APP_PASSWORD from the environment. */
  username?: string;
  appPassword?: string;
  startedBy?: string | null;
};

const LOG_LIMIT = 400_000; // chars kept in MigrationRun.log

export async function createRun(opts: MigrationOptions) {
  const options = {
    source: opts.source, baseUrl: opts.baseUrl ?? null, wxrFilename: opts.wxrFilename ?? null, dryRun: !!opts.dryRun,
    force: !!opts.force, skipMedia: !!opts.skipMedia, importAllMedia: !!opts.importAllMedia, limitPerType: opts.limitPerType ?? null,
    authenticated: !!((opts.username ?? process.env.WP_USERNAME) && (opts.appPassword ?? process.env.WP_APP_PASSWORD)),
    startedBy: opts.startedBy ?? null,
  };
  return db.migrationRun.create({ data: { source: opts.source, status: "running", options } });
}

/** A run that is still "running" after this long is assumed dead (server restart). */
export const STALE_RUN_MS = 6 * 60 * 60 * 1000;

/** Mark runs interrupted by a restart/redeploy as failed. */
export async function failStaleRuns() {
  return db.migrationRun.updateMany({ where: { status: "running", startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) } }, data: { status: "failed", finishedAt: new Date() } });
}

export async function activeRun() {
  return db.migrationRun.findFirst({ where: { status: "running", startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) } }, orderBy: { startedAt: "desc" } });
}

export async function executeRun(runId: string, opts: MigrationOptions, echo?: (line: string) => void): Promise<ImportReport> {
  let buffer = "";
  let dirty = false;
  let flushing: Promise<unknown> = Promise.resolve();
  const flush = () => {
    if (!dirty) return flushing;
    dirty = false;
    const log = buffer.length > LOG_LIMIT ? "…(earlier lines truncated)…\n" + buffer.slice(-LOG_LIMIT) : buffer;
    flushing = flushing.then(() => db.migrationRun.update({ where: { id: runId }, data: { log } }).catch(() => {}));
    return flushing;
  };
  const timer = setInterval(flush, 2000);
  const log = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    buffer += line + "\n";
    dirty = true;
    echo?.(line);
  };

  try {
    let snap;
    if (opts.source === "wxr") {
      if (!opts.wxrXml) throw new Error("No WXR file was provided.");
      log(`Parsing WXR export${opts.wxrFilename ? ` ${opts.wxrFilename}` : ""} (${Math.round(opts.wxrXml.length / 1024)} KB) …`);
      snap = parseWxr(opts.wxrXml);
      if (opts.baseUrl) snap.baseUrl = opts.baseUrl.replace(/\/+$/, "");
      log(`  ${snap.items.length} items, ${snap.media.length} attachments, ${snap.terms.length} terms, ${snap.authors.length} authors (site ${snap.baseUrl})`);
    } else {
      const baseUrl = (opts.baseUrl || process.env.WP_BASE_URL || "").replace(/\/+$/, "");
      if (!baseUrl) throw new Error("No WordPress URL given (set WP_BASE_URL or pass a base URL).");
      snap = await fetchRestSnapshot({
        baseUrl, log,
        username: opts.username ?? process.env.WP_USERNAME,
        appPassword: opts.appPassword ?? process.env.WP_APP_PASSWORD,
        limitPerType: opts.limitPerType,
      });
    }
    const report = await importSnapshot(snap, { dryRun: opts.dryRun, force: opts.force, skipMedia: opts.skipMedia, importAllMedia: opts.importAllMedia, runId, log });
    log(`Finished in ${report.durationSec}s.`);
    clearInterval(timer);
    await flush();
    await db.migrationRun.update({
      where: { id: runId },
      data: { status: "completed", finishedAt: new Date(), report: report as unknown as Prisma.InputJsonValue, log: buffer.slice(-LOG_LIMIT) },
    });
    return report;
  } catch (e) {
    const msg = (e as Error).stack ?? String(e);
    log(`FAILED: ${(e as Error).message}`);
    clearInterval(timer);
    await flush();
    const report = emptyReport(opts.source, opts.baseUrl ?? "", !!opts.dryRun, {});
    report.runId = runId;
    report.warnings.push(`Run failed: ${(e as Error).message}`);
    report.finishedAt = new Date().toISOString();
    await db.migrationRun.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), report: report as unknown as Prisma.InputJsonValue, log: (buffer + "\n" + msg).slice(-LOG_LIMIT) },
    }).catch(() => {});
    throw e;
  } finally {
    clearInterval(timer);
  }
}

/** Create a run and execute it in the background (fire-and-forget). Returns the run id. */
export async function startRunInBackground(opts: MigrationOptions) {
  const run = await createRun(opts);
  void executeRun(run.id, opts).catch((e) => console.error(`[migration ${run.id}] failed:`, e));
  return run.id;
}

export { reportToMarkdown };

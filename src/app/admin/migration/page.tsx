import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { STALE_RUN_MS } from "@/lib/wordpress/run";
import type { ImportReport } from "@/lib/wordpress/report";
import { RestImportForm, WxrImportForm, AutoRefresh } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "WordPress Import" };

const RUN_TONE: Record<string, string> = { running: "SCHEDULED", completed: "PUBLISHED", failed: "REJECTED" };

export default async function MigrationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  // runs still "running" long after start were interrupted (deploy / restart)
  await db.migrationRun.updateMany({ where: { status: "running", startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) } }, data: { status: "failed", finishedAt: new Date() } });
  const runs = await db.migrationRun.findMany({ orderBy: { startedAt: "desc" }, take: 30, select: { id: true, source: true, status: true, options: true, report: true, startedAt: true, finishedAt: true } });
  const running = runs.some((r) => r.status === "running");
  const hasCreds = !!(process.env.WP_USERNAME && process.env.WP_APP_PASSWORD);
  const [records, failedRecords] = await Promise.all([db.wpRecord.count(), db.wpRecord.count({ where: { status: "failed" } })]);

  return (
    <>
      <PageHeader
        title="WordPress Import"
        description="Copy every post, business listing, page, image, category and SEO field from the WordPress site. Re-running is safe: records are matched on their WordPress IDs and anything edited here is left alone."
        actions={<AutoRefresh active={running} />}
      />
      <div className="min-w-0 max-w-full space-y-6">
        {error && <Notice tone="danger">{error}</Notice>}
        {running && <Notice tone="info" title="An import is running">Open it below to follow progress. New imports can start when it finishes.</Notice>}
        <Notice tone={hasCreds ? "success" : "warn"} title={hasCreds ? "WordPress credentials configured" : "No WordPress credentials"}>
          {hasCreds
            ? "WP_USERNAME and WP_APP_PASSWORD are set, so drafts, scheduled, pending and private posts and menus are included."
            : "Only public content is visible over the REST API. Set WP_USERNAME and WP_APP_PASSWORD (a WordPress Application Password from Users → Profile) to include drafts, scheduled, pending and private posts — or upload a WXR export below."}
        </Notice>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Import from the live site (REST API)" description="Reads /wp-json/ and discovers every post type and taxonomy, including custom ones.">
            <RestImportForm defaultUrl={process.env.WP_BASE_URL ?? ""} disabled={running} />
          </Card>
          <Card title="Import a WXR export file" description="The most complete source: every status, custom field and custom post type, even ones hidden from REST.">
            <WxrImportForm disabled={running} />
          </Card>
        </div>

        <Card className="min-w-0 max-w-full overflow-hidden" title="Runs" description={`${records} WordPress records tracked${failedRecords ? ` · ${failedRecords} failed` : ""}.`} bodyClassName="p-0">
          {runs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500 sm:px-5">No imports yet. Start with a dry run to see what will be imported.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="table-base min-w-[720px]">
                <thead>
                  <tr><th>Started</th><th>Source</th><th>Status</th><th>Articles</th><th>Businesses</th><th>Pages</th><th>Images</th><th>Problems</th><th><span className="sr-only">Open</span></th></tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const rep = r.report as unknown as ImportReport | null;
                    const opts = (r.options ?? {}) as { baseUrl?: string; wxrFilename?: string; dryRun?: boolean; force?: boolean };
                    const problems = rep ? rep.failed.length + rep.missingFiles.length + rep.brokenLinks.length : null;
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{formatDateTime(r.startedAt)}</td>
                        <td>
                          <span className="font-medium uppercase">{r.source}</span>
                          <span className="block max-w-[220px] truncate text-xs text-slate-500">{opts.wxrFilename ?? opts.baseUrl ?? ""}</span>
                          {(opts.dryRun || opts.force) && <span className="text-xs text-slate-500">{[opts.dryRun && "dry run", opts.force && "force"].filter(Boolean).join(" · ")}</span>}
                        </td>
                        <td><StatusBadge status={RUN_TONE[r.status] ?? "DRAFT"} label={r.status} /></td>
                        <td>{rep?.imported.articles ?? "—"}</td>
                        <td>{rep?.imported.businesses ?? "—"}</td>
                        <td>{rep?.imported.pages ?? "—"}</td>
                        <td>{rep ? `${rep.media.downloaded + rep.media.reused}${rep.media.failed ? ` (${rep.media.failed} failed)` : ""}` : "—"}</td>
                        <td>{problems === null ? "—" : problems === 0 ? <span className="text-emerald-700">None</span> : <span className="text-amber-700">{problems}</span>}</td>
                        <td><Link href={`/admin/migration/${r.id}/`} className="btn-ghost btn-sm min-h-11">Open</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

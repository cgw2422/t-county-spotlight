import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { formatDateTime } from "@/lib/utils";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ImportReport } from "@/lib/wordpress/report";
import { AutoRefresh } from "../forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import run" };

const RECORD_STATUSES = ["imported", "failed", "skipped", "preserved_local_edits"] as const;
const PER_PAGE = 50;
const RUN_TONE: Record<string, string> = { running: "SCHEDULED", completed: "PUBLISHED", failed: "REJECTED" };
const RECORD_TONE: Record<string, string> = { imported: "PUBLISHED", failed: "REJECTED", skipped: "DRAFT", preserved_local_edits: "PENDING" };

function Table({ head, rows, empty = "None." }: { head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="table-base">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 300).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="max-w-[420px] break-words align-top">{c}</td>)}</tr>)}</tbody>
      </table>
      {rows.length > 300 && <p className="mt-2 text-xs text-slate-500">Showing 300 of {rows.length}. Download the report for the full list.</p>}
    </div>
  );
}

function Section({ title, count, children, open }: { title: string; count?: number; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="card group min-w-0 max-w-full overflow-hidden" open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="font-semibold text-slate-900">{title}</span>
        {count !== undefined && <span className={count ? "badge-amber" : "badge-gray"}>{count}</span>}
      </summary>
      <div className="border-t border-slate-100 p-4 sm:p-5">{children}</div>
    </details>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy-950">{value}</p>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default async function MigrationRunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; page?: string; q?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const run = await db.migrationRun.findUnique({ where: { id } });
  if (!run) notFound();
  const report = run.report as unknown as ImportReport | null;
  const opts = (run.options ?? {}) as Record<string, unknown>;

  const status = RECORD_STATUSES.includes(sp.status as (typeof RECORD_STATUSES)[number]) ? sp.status : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim().slice(0, 100);
  const where: Prisma.WpRecordWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { wpType: { contains: q, mode: "insensitive" } }, { sourceUrl: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [records, total, byStatus] = await Promise.all([
    db.wpRecord.findMany({ where, orderBy: [{ wpType: "asc" }, { wpId: "asc" }], skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.wpRecord.count({ where }),
    db.wpRecord.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
  const qs = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, q, ...p })) if (v !== undefined && v !== "") u.set(k, String(v));
    const s = u.toString();
    return `/admin/migration/${run.id}/${s ? `?${s}` : ""}#records`;
  };

  return (
    <>
      <PageHeader
        back={{ href: "/admin/migration/", label: "WordPress Import" }}
        title={`${run.source.toUpperCase()} import · ${formatDateTime(run.startedAt)}`}
        eyebrow={<StatusBadge status={RUN_TONE[run.status] ?? "DRAFT"} label={run.status} />}
        description={[opts.wxrFilename ?? opts.baseUrl, opts.dryRun && "dry run", opts.force && "force", opts.skipMedia && "images skipped", opts.startedBy && `by ${opts.startedBy}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <AutoRefresh active={run.status === "running"} />
            {report && (
              <>
                <a href={`/api/admin/migration/${run.id}/?format=md`} className="btn-secondary btn-sm min-h-11"><Download className="h-4 w-4" /> Report (.md)</a>
                <a href={`/api/admin/migration/${run.id}/?format=json`} className="btn-ghost btn-sm min-h-11"><Download className="h-4 w-4" /> JSON</a>
              </>
            )}
          </>
        }
      />

      <div className="space-y-4">
        {run.status === "failed" && <Notice tone="danger" title="This run failed">{report?.warnings.at(-1) ?? "See the log below."}</Notice>}
        {report?.dryRun && <Notice tone="info" title="Dry run">Nothing was written. The plan below shows what a real import would do.</Notice>}

        {report && run.status !== "failed" && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Articles" value={report.imported.articles} hint={Object.entries(report.imported.articlesByKind).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, " ")}`).join(", ") || undefined} />
              <Stat label="Businesses" value={report.imported.businesses} hint={`${report.imported.spotlightedBusinesses} spotlighted · ${report.imported.articleBusinessLinks} article links`} />
              <Stat label="Pages" value={report.imported.pages} hint={report.imported.otherTypesAsArticles ? `+${report.imported.otherTypesAsArticles} other post types as articles` : undefined} />
              <Stat label="Images" value={report.media.downloaded + report.media.reused} hint={`${report.media.downloaded} new · ${report.media.reused} reused · ${report.media.failed} failed`} />
              <Stat label="Categories / tags" value={`${report.imported.categories} / ${report.imported.tags}`} hint={`${report.imported.businessCategories} business categories`} />
              <Stat label="Redirects" value={report.redirects.created + report.redirects.updated} hint={`${report.redirects.unchanged} unchanged`} />
              <Stat label="Failed" value={report.failed.length} hint={`${report.skipped.length} skipped · ${report.preservedLocalEdits.length} local edits kept`} />
              <Stat label="Duration" value={`${report.durationSec ?? "—"}s`} hint={report.authenticated ? "authenticated" : "public data only"} />
            </div>

            <Section title="Records discovered" open>
              <Table head={["WordPress type", "Discovered", "Source total"]} rows={Object.keys({ ...report.discovered, ...report.sourceTotals }).sort().map((k) => [k, report.discovered[k] ?? "", report.sourceTotals[k] ?? ""])} />
            </Section>
            <Section title="Failed imports" count={report.failed.length} open={report.failed.length > 0}>
              <Table head={["Type", "WP ID", "Title", "Error"]} rows={report.failed.map((f) => [f.type, f.wpId, f.title, f.error])} />
            </Section>
            <Section title="Endpoints that required credentials" count={report.requiresCredentials.length}>
              {report.requiresCredentials.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">{report.requiresCredentials.map((e) => <li key={e}><code>{e}</code></li>)}</ul>
              ) : <p className="text-sm text-slate-500">None.</p>}
              {report.endpointErrors.length > 0 && <div className="mt-4"><Table head={["Endpoint", "Status", "Note"]} rows={report.endpointErrors.map((e) => [e.endpoint, String(e.status), e.note ?? ""])} /></div>}
            </Section>
            <Section title="Missing files" count={report.missingFiles.length}>
              <Table head={["URL", "Reason", "Referenced by"]} rows={report.missingFiles.map((m) => [m.url, m.reason, m.context ?? ""])} />
            </Section>
            <Section title="Broken internal links" count={report.brokenLinks.length}>
              <Table head={["On page", "Link"]} rows={report.brokenLinks.map((b) => [b.from, b.href])} />
            </Section>
            <Section title="Unmapped post types, taxonomies and fields" count={report.unmappedPostTypes.length + report.unmappedTaxonomies.length + report.unmappedFields.length}>
              <div className="space-y-4">
                <Table head={["Post type", "Count", "Imported as"]} rows={report.unmappedPostTypes.map((u) => [u.type, u.count, u.importedAs])} empty="No unmapped post types." />
                <Table head={["Taxonomy", "Terms", "Note"]} rows={report.unmappedTaxonomies.map((u) => [u.taxonomy, u.terms, u.note])} empty="No unmapped taxonomies." />
                <Table head={["Type", "Field (kept in wpMeta)", "Records"]} rows={report.unmappedFields.map((u) => [u.type, u.field, u.count])} empty="No unmapped fields." />
                <Table head={["Shortcode left as text", "Records"]} rows={report.unexpandedShortcodes.map((s) => [`[${s.shortcode}]`, s.count])} empty="No unexpanded shortcodes." />
              </div>
            </Section>
            <Section title="Duplicates detected" count={report.duplicates.length}>
              <Table head={["Type", "WP ID", "Title", "Detail"]} rows={report.duplicates.map((d) => [d.type, d.wpId, d.title, d.detail])} />
            </Section>
            <Section title="Preserved local edits / skipped" count={report.preservedLocalEdits.length + report.skipped.length}>
              <Table head={["Type", "WP ID", "Title", "Reason"]} rows={[...report.preservedLocalEdits.map((d) => [d.type, d.wpId, d.title, d.reason ?? "edited locally"]), ...report.skipped.map((d) => [d.type, d.wpId, d.title, d.reason])]} />
            </Section>
            <Section title="URL changes and redirects" count={report.redirects.list.length}>
              <div className="space-y-4">
                <Table head={["Type", "Title", "Old URL", "New URL"]} rows={report.urlChanges.map((u) => [u.type, u.title, u.from, u.to])} empty="No URL changed — imported records keep their WordPress paths." />
                <Table head={["From", "To (301)"]} rows={report.redirects.list.map((r) => [r.from, r.to])} />
              </div>
            </Section>
            <Section title="Branding, menus and warnings" count={report.warnings.length}>
              <ul className="space-y-1 text-sm">
                <li><span className="font-medium">Logo:</span> {report.branding.logo}</li>
                <li><span className="font-medium">Icon:</span> {report.branding.icon}</li>
                {report.menus.map((m) => <li key={m.name}><span className="font-medium">Menu “{m.name}”:</span> {m.items} items{m.locations?.length ? ` (${m.locations.join(", ")})` : ""}</li>)}
              </ul>
              {report.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
            </Section>
            {report.plan && (
              <Section title="Dry-run plan" count={report.plan.length} open>
                <Table head={["Type", "WP ID", "Title", "Becomes", "Kind", "Status", "Path"]} rows={report.plan.map((p) => [p.type, p.wpId, p.title, p.target, p.kind ?? "", p.status, p.path ?? ""])} />
              </Section>
            )}
          </>
        )}

        <Card title="Log" description={run.finishedAt ? `Finished ${formatDateTime(run.finishedAt)}` : "Updates every few seconds while running."} bodyClassName="p-0">
          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">{run.log || "Starting…"}</pre>
        </Card>

        <Card className="min-w-0 max-w-full overflow-hidden" id="records" title="WordPress records" description="Current state of every record the importer has seen (across all runs)." bodyClassName="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <Link href={qs({ status: undefined, page: undefined })} className={!status ? "badge-blue" : "badge-gray"}>All {Object.values(statusCounts).reduce((a, b) => a + b, 0)}</Link>
            {RECORD_STATUSES.map((s) => (
              <Link key={s} href={qs({ status: s, page: undefined })} className={status === s ? "badge-blue" : "badge-gray"}>{s.replace(/_/g, " ")} {statusCounts[s] ?? 0}</Link>
            ))}
            <form className="ml-auto flex gap-2" action={`/admin/migration/${run.id}/`}>
              {status && <input type="hidden" name="status" value={status} />}
              <label htmlFor="rq" className="sr-only">Search records</label>
              <input id="rq" name="q" defaultValue={q} placeholder="Search title, type, URL" className="input min-h-11 w-56" />
              <button className="btn-secondary btn-sm min-h-11">Search</button>
            </form>
          </div>
          {records.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No records{status ? ` with status “${status.replace(/_/g, " ")}”` : ""}.</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="table-base min-w-[760px]">
                <thead><tr><th>Type</th><th>WP ID</th><th>Title</th><th>Status</th><th>Old URL</th><th>New location</th><th>Error</th></tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{r.wpType}</td>
                      <td>{r.wpId}</td>
                      <td className="max-w-[260px] break-words">{r.title}{r.wpStatus && r.wpStatus !== "publish" && <span className="block text-xs text-slate-500">WP: {r.wpStatus}</span>}</td>
                      <td><StatusBadge status={RECORD_TONE[r.status] ?? "DRAFT"} label={r.status.replace(/_/g, " ")} /></td>
                      <td className="max-w-[220px] break-all text-xs">{r.sourceUrl}</td>
                      <td className="max-w-[220px] break-all text-xs">{r.newPath && (r.newPath.startsWith("/") && !r.newPath.startsWith("/media/") ? <Link className="text-brand-700 hover:underline" href={r.newPath}>{r.newPath}</Link> : r.newPath)}</td>
                      <td className="max-w-[240px] break-words text-xs text-red-700">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > PER_PAGE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm sm:px-5">
              <span className="text-slate-500">Page {page} of {Math.ceil(total / PER_PAGE)} · {total} records</span>
              <div className="flex gap-2">
                {page > 1 && <Link href={qs({ page: page - 1 })} className="btn-secondary btn-sm min-h-11">Previous</Link>}
                {page * PER_PAGE < total && <Link href={qs({ page: page + 1 })} className="btn-secondary btn-sm min-h-11">Next</Link>}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

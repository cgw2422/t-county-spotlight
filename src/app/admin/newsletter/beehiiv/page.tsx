import Link from "next/link";
import { ExternalLink, Eye, EyeOff, RefreshCw } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { articleHref } from "@/lib/links";
import { beehiivEnvStatus } from "@/lib/beehiiv/client";
import { ARCHIVE_TAG, ARTICLE_TAG, getLastSyncResult } from "@/lib/beehiiv/sync";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { syncBeehiivNowAction, toggleIssueHiddenAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "beehiiv sync" };

const code = "rounded bg-slate-100 px-1 text-xs";

export default async function BeehiivAdminPage() {
  await requireAdmin();
  const [last, issues, articles, issueCount] = await Promise.all([
    getLastSyncResult(),
    db.newsletterIssue.findMany({ orderBy: { publishedAt: "desc" }, take: 100, select: { id: true, slug: true, title: true, publishedAt: true, hidden: true, removedAt: true, contentSource: true, syncedAt: true } }),
    db.article.findMany({ where: { beehiivPostId: { not: null } }, orderBy: { publishedAt: "desc" }, take: 100, select: { id: true, slug: true, legacyPath: true, title: true, status: true, publishedAt: true, localEditedAt: true, deletedAt: true, beehiivContentSource: true } }),
    db.newsletterIssue.count(),
  ]);
  const env = beehiivEnvStatus();
  const configured = env.apiKey && env.publicationId;
  const c = last?.counts;
  return (
    <>
      <PageHeader title="beehiiv content sync" description={<>Imports live beehiiv posts: tag <code className={code}>{ARCHIVE_TAG}</code> → newsletter archive at /newsletter/, tag <code className={code}>{ARTICLE_TAG}</code> → site article. Runs hourly from the cron job and on demand.</>} />
      {!configured && (
        <div className="mb-6"><Notice tone="warn" title="Sync is not configured">Set <code className={code}>BEEHIIV_API_KEY</code> ({env.apiKey ? "present" : "missing"}) and <code className={code}>BEEHIIV_PUBLICATION_ID</code> ({env.publicationId ? "present" : "missing"}) on the server. Until then the sync does nothing.</Notice></div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Sync now" description="Safe to run any time: posts are matched by beehiiv post id, so nothing is duplicated. Articles edited here are never overwritten.">
          <ActionForm action={syncBeehiivNowAction} className="space-y-3">
            <Submit pendingText="Syncing…" data-testid="sync-now"><RefreshCw className="h-4 w-4" /> Sync now</Submit>
          </ActionForm>
        </Card>
        <Card title="Last sync" bodyClassName="p-5" >
          {last ? (
            <div className="space-y-3 text-sm" data-testid="last-sync" data-status={last.status}>
              <p><StatusBadge status={last.status === "ok" ? "ACTIVE" : "FAILED"} label={last.status === "ok" ? "OK" : last.status} /> <span className="ml-2 text-slate-600">{formatDateTime(new Date(last.finishedAt || last.startedAt))} · {last.trigger}</span></p>
              <p className="text-slate-700">{last.message}</p>
              {c && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-500">Issues new</dt><dd className="font-semibold">{c.issuesCreated}</dd></div>
                  <div><dt className="text-xs text-slate-500">Issues updated</dt><dd className="font-semibold">{c.issuesUpdated}</dd></div>
                  <div><dt className="text-xs text-slate-500">Issues hidden</dt><dd className="font-semibold">{c.issuesHidden}</dd></div>
                  <div><dt className="text-xs text-slate-500">Articles new</dt><dd className="font-semibold">{c.articlesCreated}</dd></div>
                  <div><dt className="text-xs text-slate-500">Articles updated</dt><dd className="font-semibold">{c.articlesUpdated}</dd></div>
                  <div><dt className="text-xs text-slate-500">Articles unpublished</dt><dd className="font-semibold">{c.articlesUnpublished}</dd></div>
                  <div><dt className="text-xs text-slate-500">Kept (edited here)</dt><dd className="font-semibold">{c.preservedLocalEdits}</dd></div>
                  <div><dt className="text-xs text-slate-500">Skipped</dt><dd className="font-semibold">{c.skipped}</dd></div>
                  <div><dt className="text-xs text-slate-500">Unchanged</dt><dd className="font-semibold">{c.issuesUnchanged + c.articlesUnchanged}</dd></div>
                </dl>
              )}
              {last.emailLayout?.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200">
                  <p className="font-semibold">Email layout used for {last.emailLayout.length} post(s)</p>
                  <p className="text-xs">These posts have no web version, so the email HTML was cleaned up and shown instead. For the best result publish them to “Email and web” in beehiiv.</p>
                  <ul className="mt-1 list-disc pl-5 text-xs">{last.emailLayout.slice(0, 10).map((p) => <li key={p.id}>{p.title}</li>)}</ul>
                </div>
              )}
              {last.errors?.length > 0 && <ul className="list-disc pl-5 text-xs text-red-700">{last.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          ) : <p className="text-sm text-slate-500">No sync has run yet.</p>}
        </Card>
      </div>

      <Card className="mt-6" title={`Newsletter issues (${issueCount})`} description="Hidden issues disappear from /newsletter/ and the sitemap. Issues removed or unpublished in beehiiv are hidden automatically and come back if they're live again; a hide you set here sticks." bodyClassName="p-0">
        {issues.length ? (
          <ul className="divide-y divide-slate-100" data-testid="issue-admin-list">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{i.title}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(i.publishedAt)} · /newsletter/{i.slug}/</span>
                </span>
                {i.contentSource === "email" && <span className="badge-amber" title="No web version in beehiiv; email HTML was used">Email layout</span>}
                {i.hidden ? <span className="badge-gray">{i.removedAt ? "Hidden (not live in beehiiv)" : "Hidden"}</span> : <span className="badge-green">Visible</span>}
                {!i.hidden && <a href={`/newsletter/${i.slug}/`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" /><span className="sr-only">View</span></a>}
                <ActionButton action={toggleIssueHiddenAction} fields={{ id: i.id }} className="btn-secondary btn-sm">
                  {i.hidden ? <><Eye className="h-4 w-4" /> Unhide</> : <><EyeOff className="h-4 w-4" /> Hide</>}
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : <p className="p-5 text-sm text-slate-500">No issues synced yet.</p>}
      </Card>

      <Card className="mt-6" title={`Articles from beehiiv (${articles.length})`} description="Created as regular articles (General). Once you edit one here, the sync leaves it alone. If a post stops being live in beehiiv, its article goes back to Draft unless it was edited here." bodyClassName="p-0">
        {articles.length ? (
          <ul className="divide-y divide-slate-100">
            {articles.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0 flex-1">
                  <Link href={`/admin/articles/${a.id}/`} className="block truncate font-semibold text-slate-900 hover:text-brand-700">{a.title}</Link>
                  <span className="text-xs text-slate-500">{a.publishedAt ? formatDateTime(a.publishedAt) : "—"} · {articleHref(a)}{a.localEditedAt ? ` · edited here ${formatDateTime(a.localEditedAt)}` : ""}</span>
                </span>
                {a.beehiivContentSource === "email" && <span className="badge-amber">Email layout</span>}
                <StatusBadge status={a.deletedAt ? "DELETED" : a.status} />
              </li>
            ))}
          </ul>
        ) : <p className="p-5 text-sm text-slate-500">No articles synced yet.</p>}
      </Card>
    </>
  );
}

import Link from "next/link";
import { AlertTriangle, Building2, CalendarClock, FileText, Inbox, Lightbulb, Settings, Upload } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Notice } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { StatCard } from "@/components/admin/stat-card";
import { Pagination } from "@/components/admin/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionButton } from "@/components/admin/action-button";
import { aiConfigured } from "@/lib/gov-watch/analyze";
import { inboxConfigured, recordsAddress } from "@/lib/gov-watch/inbox";
import { sourceCommunities } from "@/lib/gov-watch/sources";
import { DOC_TYPE_LABEL, FINDING_REVIEW, isOneOf, DOC_TYPES } from "@/lib/gov-watch/shared";
import { pageParams, spGet, type SP } from "../_lib/list";
import { loadStarterSourcesAction } from "./actions";
import { FindingsList, type FindingRow } from "./_components/findings-list";
import { GovFilters } from "./_components/filters";
import { BASE, daysAgo, findingWhere, fmtDate, qs, readFilters, startOfTodayUtc } from "./_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Government Watch" };

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as Record<string, number>;

export default async function GovWatchDashboard({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const f = readFilters(sp);
  const statusParam = spGet(sp, "status") || "new";
  const status = statusParam === "all" ? null : isOneOf(FINDING_REVIEW, statusParam) ? statusParam : "new";
  const { page, take, skip, perPage } = pageParams(sp, 40);
  const where = { ...findingWhere(f), ...(status ? { reviewStatus: status } : {}) };
  const weekAgo = daysAgo(7);
  const today = startOfTodayUtc();

  const [sourceCount, activeCount, newDocs, awaiting, failedSources, newStories, highStories, counts, total, findings, recentDocs, upcoming, communities] = await Promise.all([
    db.govSource.count(),
    db.govSource.count({ where: { active: true } }),
    db.govDocument.count({ where: { discoveredAt: { gte: weekAgo } } }),
    db.govDocument.count({ where: { reviewStatus: "awaiting_review" } }),
    db.govSource.findMany({ where: { lastStatus: "error", active: true }, orderBy: { lastCheckedAt: "desc" }, take: 8, select: { id: true, name: true, lastError: true, lastCheckedAt: true, consecutiveFailures: true } }),
    db.govFinding.count({ where: { reviewStatus: "new" } }),
    db.govFinding.count({ where: { reviewStatus: "new", priority: "high" } }),
    db.govFinding.groupBy({ by: ["reviewStatus"], where: findingWhere(f), _count: { _all: true } }),
    db.govFinding.count({ where }),
    db.govFinding.findMany({
      where, skip, take, orderBy: [{ createdAt: "desc" }],
      include: { document: { select: { id: true, title: true, meetingDate: true, source: { select: { name: true, community: true } } } } },
    }),
    db.govDocument.findMany({ orderBy: { discoveredAt: "desc" }, take: 8, select: { id: true, title: true, docType: true, status: true, discoveredAt: true, source: { select: { name: true } } } }),
    db.govFinding.findMany({ where: { eventDate: { gte: today }, reviewStatus: { not: "ignored" } }, orderBy: { eventDate: "asc" }, take: 6, select: { id: true, headline: true, eventDate: true, document: { select: { id: true, source: { select: { name: true } } } } } }),
    sourceCommunities(),
  ]);
  const count = (s: string) => counts.find((c) => c.reviewStatus === s)?._count._all ?? 0;
  // Highest priority first within the page (newest first overall).
  const rows: FindingRow[] = findings
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))
    .map((x) => ({
      id: x.id, headline: x.headline, detail: x.detail, category: x.category, actionStatus: x.actionStatus, priority: x.priority, reviewStatus: x.reviewStatus,
      amount: x.amount, voteResult: x.voteResult, pageNumber: x.pageNumber, quote: x.quote, eventDate: fmtDate(x.eventDate), articleId: x.articleId,
      documentId: x.document.id, documentTitle: x.document.title, documentUrl: `${BASE}/documents/${x.document.id}/`, sourceName: x.document.source?.name ?? null,
      community: x.document.source?.community ?? null, meetingDate: fmtDate(x.document.meetingDate),
    }));
  const tab = (s: string, label: string, n?: number) => ({ label, href: `${BASE}/${qs(f.values, { status: s })}`, active: (status ?? "all") === s, count: n });

  return (
    <>
      <PageHeader
        title="Government Watch"
        description="Meeting minutes, agendas and public documents collected from Tuscarawas County governments, with potential news stories found by AI. Nothing here is published automatically: review each story, and draft articles go to Articles as drafts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${BASE}/upload/`} className="btn-secondary btn-sm"><Upload className="h-4 w-4" /> Upload document</Link>
            <Link href={`${BASE}/settings/`} className="btn-ghost btn-sm"><Settings className="h-4 w-4" /> Settings</Link>
          </div>
        }
      />
      {!sourceCount && (
        <div className="mb-4"><Notice tone="info" title="Start with the source list">
          <p>Load the researched list of Tuscarawas County governments: {"the county commissioners, cities, villages, townships, school boards and other public boards"}. Every source starts as “Needs review”: open each one to confirm its website, minutes page and clerk details.</p>
          <div className="mt-2"><ActionButton action={loadStarterSourcesAction} className="btn-primary btn-sm">Load the starter source list</ActionButton></div>
        </Notice></div>
      )}
      {!aiConfigured() && <div className="mb-4"><Notice tone="warn" title="AI analysis is off">Documents are collected, but potential stories aren’t found until <code>ANTHROPIC_API_KEY</code> is added to the server’s environment (Railway → Variables). See <Link className="underline" href={`${BASE}/settings/`}>Settings</Link>.</Notice></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="gov-stats">
        <StatCard label="Sources monitored" value={`${activeCount} / ${sourceCount}`} icon={Building2} href={`${BASE}/sources/`} tone="navy" />
        <StatCard label="New documents (7 days)" value={newDocs} icon={FileText} href={`${BASE}/documents/`} />
        <StatCard label="Potential stories" value={newStories} hint={highStories ? `${highStories} high priority` : undefined} icon={Lightbulb} tone="orange" href={`${BASE}/?status=new`} />
        <StatCard label="Documents awaiting review" value={awaiting} icon={Inbox} tone="amber" href={`${BASE}/documents/?review=awaiting_review`} />
        <StatCard label="Failed source checks" value={failedSources.length} icon={AlertTriangle} tone={failedSources.length ? "orange" : "green"} href={`${BASE}/sources/?status=error`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <h2 className="mb-2 font-display text-lg font-bold text-navy-900">Potential news stories</h2>
          <LinkTabs className="mb-3" items={[tab("new", "New", count("new")), tab("reviewed", "Reviewed", count("reviewed")), tab("published", "Published", count("published")), tab("ignored", "Ignored", count("ignored")), tab("all", "All")]} />
          <GovFilters action={`${BASE}/`} values={f.values} communities={communities} hidden={{ status: status ?? "all" }} />
          {rows.length ? <FindingsList rows={rows} /> : (
            <EmptyState icon={Lightbulb} title={status === "new" ? "No new potential stories" : "No stories match"}>{sourceCount ? "Stories appear here after documents are collected and analyzed." : "Load the source list to start collecting."}</EmptyState>
          )}
          <Pagination total={total} page={page} perPage={perPage} basePath={`${BASE}/`} params={{ ...f.values, status: status ?? "all" }} />
        </div>
        <aside className="space-y-4">
          <section className="card p-4" data-testid="recent-activity">
            <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-navy-900"><FileText className="h-4 w-4" /> Recent documents</h2>
            {recentDocs.length ? (
              <ul className="space-y-2 text-sm">
                {recentDocs.map((d) => (
                  <li key={d.id}>
                    <Link href={`${BASE}/documents/${d.id}/`} className="font-medium text-brand-700 hover:underline">{d.title}</Link>
                    <span className="block text-xs text-slate-500">{d.source?.name ?? "Unassigned"} · {isOneOf(DOC_TYPES, d.docType) ? DOC_TYPE_LABEL[d.docType] : d.docType} · {fmtDate(d.discoveredAt)}{d.status !== "analyzed" ? ` · ${d.status === "new" ? "waiting for analysis" : d.status}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No documents yet.</p>}
            <Link href={`${BASE}/activity/`} className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline">Collection activity →</Link>
          </section>
          <section className="card p-4" data-testid="upcoming-meetings">
            <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-navy-900"><CalendarClock className="h-4 w-4" /> Upcoming meetings & dates</h2>
            {upcoming.length ? (
              <ul className="space-y-2 text-sm">
                {upcoming.map((u) => <li key={u.id}><span className="font-semibold text-navy-900">{fmtDate(u.eventDate)}</span> · <Link className="text-brand-700 hover:underline" href={`${BASE}/documents/${u.document.id}/`}>{u.headline}</Link><span className="block text-xs text-slate-500">{u.document.source?.name}</span></li>)}
              </ul>
            ) : <p className="text-sm text-slate-500">None found yet.</p>}
          </section>
          <section className="card p-4" data-testid="failed-sources">
            <h2 className="mb-2 flex items-center gap-2 font-display text-sm font-bold text-navy-900"><AlertTriangle className="h-4 w-4" /> Failed source checks</h2>
            {failedSources.length ? (
              <ul className="space-y-2 text-sm">
                {failedSources.map((s) => <li key={s.id}><Link href={`${BASE}/sources/${s.id}/`} className="font-medium text-red-700 hover:underline">{s.name}</Link><span className="block break-words text-xs text-slate-500">{s.lastError?.slice(0, 160)}{s.consecutiveFailures > 1 ? ` (${s.consecutiveFailures} times in a row)` : ""}</span></li>)}
              </ul>
            ) : <p className="text-sm text-slate-500">All checks succeeded.</p>}
          </section>
          <section className="card p-4 text-sm text-slate-600">
            <h2 className="mb-1 font-display text-sm font-bold text-navy-900">Records inbox</h2>
            {inboxConfigured() ? <p>Clerks can email documents to <strong>{recordsAddress()}</strong>. Checked every 30 minutes.</p> : <p>Not set up. See <Link className="text-brand-700 underline" href={`${BASE}/settings/`}>Settings</Link>.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}

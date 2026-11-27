import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, History } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionForm, Submit } from "@/components/admin/action-form";
import { ActionButton } from "@/components/admin/action-button";
import { FormGrid, SelectField, TextField } from "@/components/admin/form-field";
import { formatDateTime } from "@/lib/utils";
import { aiConfigured } from "@/lib/gov-watch/analyze";
import { DOC_STATUS_LABEL, DOC_TYPE_LABEL, DOC_TYPES } from "@/lib/gov-watch/shared";
import { spGet, type SP } from "../../../_lib/list";
import { analyzeNowAction, draftArticleAction, setDocumentReviewAction, updateDocumentAction } from "../../actions";
import { FindingsList, type FindingRow } from "../../_components/findings-list";
import { BASE, fmtDate } from "../../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meeting document" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const d = await db.govDocument.findUnique({
    where: { id },
    include: {
      source: { select: { id: true, name: true, community: true } },
      findings: { orderBy: [{ createdAt: "asc" }] },
      revisionOf: { select: { id: true, title: true, discoveredAt: true } },
      revisions: { select: { id: true, title: true, discoveredAt: true }, orderBy: { discoveredAt: "desc" } },
    },
  });
  if (!d) notFound();
  const sources = await db.govSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const original = d.storageUrl;
  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
  const rows: FindingRow[] = [...d.findings].sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3)).map((x) => ({
    id: x.id, headline: x.headline, detail: x.detail, category: x.category, actionStatus: x.actionStatus, priority: x.priority, reviewStatus: x.reviewStatus,
    amount: x.amount, voteResult: x.voteResult, pageNumber: x.pageNumber, quote: x.quote, eventDate: fmtDate(x.eventDate), articleId: x.articleId,
    documentId: d.id, documentTitle: d.title, documentUrl: `${original}${d.fileType === "pdf" && x.pageNumber ? `#page=${x.pageNumber}` : ""}`, sourceName: d.source?.name ?? null,
    community: d.source?.community ?? null, meetingDate: fmtDate(d.meetingDate),
  }));
  return (
    <>
      <PageHeader title={d.title} back={{ href: `${BASE}/documents/`, label: "Meeting documents" }}
        eyebrow={`${d.source?.name ?? "No source assigned"}${d.meetingDate ? ` · meeting ${fmtDate(d.meetingDate)}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <a href={original} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" data-testid="original-file"><Download className="h-4 w-4" /> Saved original</a>
            {d.sourceUrl && <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><ExternalLink className="h-4 w-4" /> On the government site</a>}
            <ActionButton action={draftArticleAction} fields={{ documentIds: d.id }} className="btn-primary btn-sm">Draft article from this document</ActionButton>
          </div>
        } />
      {spGet(sp, "uploaded") && <div className="mb-4"><Notice tone="success" title="Uploaded">The document was saved{aiConfigured() ? ". Analyze it now, or it will be analyzed on the next automatic run (within about 10 minutes)." : "."}</Notice></div>}
      {d.supersededAt && <div className="mb-4"><Notice tone="warn" title="A newer version exists">This document was replaced by a revised version{d.revisions[0] ? <>: <Link className="underline" href={`${BASE}/documents/${d.revisions[0].id}/`}>{d.revisions[0].title}</Link></> : ""}.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <Card title="Summary" actions={<ActionButton action={analyzeNowAction} fields={{ id: d.id }} className="btn-secondary btn-sm" reloadOnSuccess>{d.status === "analyzed" ? "Analyze again" : "Analyze now"}</ActionButton>}>
            <p className="text-sm"><span className={d.status === "analyzed" ? "badge-green" : d.status === "failed" ? "badge-red" : "badge-amber"} data-testid="doc-status">{DOC_STATUS_LABEL[d.status] ?? d.status}</span>{d.analyzedAt && <span className="ml-2 text-xs text-slate-500">{formatDateTime(d.analyzedAt)}{d.analysisModel ? ` · ${d.analysisModel}` : ""}</span>}</p>
            {d.summary ? <p className="mt-2 text-sm leading-relaxed text-slate-700" data-testid="doc-summary">{d.summary}</p> : null}
            {d.analysisError && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{d.analysisError}</p>}
            {d.extractionMethod === "ocr_ai" && <p className="mt-2 text-xs text-slate-500">Scanned document: the AI reads the page images directly.</p>}
          </Card>
          <div>
            <h2 className="mb-2 font-display text-lg font-bold text-navy-900">Potential stories ({rows.length})</h2>
            {rows.length ? <FindingsList rows={rows} /> : <p className="text-sm text-slate-500">{d.status === "analyzed" ? "Nothing newsworthy was found in this document." : "Stories appear after analysis."}</p>}
          </div>
          {d.textContent && (
            <details className="card p-4">
              <summary className="cursor-pointer font-display text-sm font-bold text-navy-900">Extracted text ({Math.round(d.textContent.length / 1000)}k characters{d.pageCount ? `, ${d.pageCount} pages` : ""})</summary>
              <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap break-words text-xs text-slate-700">{d.textContent.slice(0, 200_000)}</pre>
            </details>
          )}
        </div>
        <aside className="space-y-4">
          <Card title="Review">
            <div className="flex flex-wrap gap-2">
              <ActionButton action={setDocumentReviewAction} fields={{ ids: d.id, status: "reviewed" }} className={d.reviewStatus === "reviewed" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} reloadOnSuccess>Reviewed</ActionButton>
              <ActionButton action={setDocumentReviewAction} fields={{ ids: d.id, status: "ignored" }} className={d.reviewStatus === "ignored" ? "btn-primary btn-sm" : "btn-secondary btn-sm"} reloadOnSuccess>Ignore</ActionButton>
              {d.reviewStatus !== "awaiting_review" && <ActionButton action={setDocumentReviewAction} fields={{ ids: d.id, status: "awaiting_review" }} className="btn-ghost btn-sm" reloadOnSuccess>Back to awaiting review</ActionButton>}
            </div>
          </Card>
          <Card title="Document details">
            <ActionForm action={updateDocumentAction} className="space-y-3">
              <input type="hidden" name="id" value={d.id} />
              <TextField label="Title" name="title" defaultValue={d.title} />
              <SelectField label="Government source" name="sourceId" defaultValue={d.sourceId ?? ""} placeholder="Not assigned" options={sources.map((s) => ({ value: s.id, label: s.name }))} />
              <FormGrid>
                <SelectField label="Type" name="docType" defaultValue={d.docType} options={DOC_TYPES.map((t) => ({ value: t, label: DOC_TYPE_LABEL[t] }))} />
                <TextField label="Meeting date" name="meetingDate" type="date" defaultValue={fmtDate(d.meetingDate) ?? ""} />
              </FormGrid>
              <Submit className="btn-secondary btn-sm">Save details</Submit>
            </ActionForm>
            <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <div>Collected: {formatDateTime(d.discoveredAt)} ({d.origin === "crawl" ? "website check" : d.origin === "email" ? "records inbox" : "upload"})</div>
              <div>File: {d.fileType.toUpperCase()}, {(d.sizeBytes / 1024).toFixed(0)} KB{d.pageCount ? `, ${d.pageCount} pages` : ""}</div>
              {d.emailFrom && <div>Emailed by: {d.emailFrom}{d.emailSubject ? ` — “${d.emailSubject}”` : ""}</div>}
              {d.sourceUrl && <div className="break-all">Address: {d.sourceUrl}</div>}
              <div className="break-all">Fingerprint (SHA-256): {d.sha256.slice(0, 16)}…</div>
              {d.inputTokens != null && <div>AI usage: {d.inputTokens.toLocaleString()} in / {d.outputTokens?.toLocaleString()} out tokens</div>}
            </dl>
          </Card>
          {(d.revisionOf || d.revisions.length > 0) && (
            <Card title="Versions">
              <ul className="space-y-1.5 text-sm">
                {d.revisions.map((r) => <li key={r.id}><History className="mr-1 inline h-3.5 w-3.5" />Newer: <Link className="text-brand-700 hover:underline" href={`${BASE}/documents/${r.id}/`}>{r.title}</Link> <span className="text-xs text-slate-500">{formatDateTime(r.discoveredAt)}</span></li>)}
                {d.revisionOf && <li><History className="mr-1 inline h-3.5 w-3.5" />Earlier: <Link className="text-brand-700 hover:underline" href={`${BASE}/documents/${d.revisionOf.id}/`}>{d.revisionOf.title}</Link> <span className="text-xs text-slate-500">{formatDateTime(d.revisionOf.discoveredAt)}</span></li>}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

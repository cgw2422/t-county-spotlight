import Link from "next/link";
import { Upload } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { LinkTabs } from "@/components/admin/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { DOC_STATUS_LABEL, DOC_TYPE_LABEL, DOC_TYPES, DOC_REVIEW, DOC_REVIEW_LABEL, isOneOf } from "@/lib/gov-watch/shared";
import { sourceCommunities } from "@/lib/gov-watch/sources";
import { pageParams, spGet, type SP } from "../../_lib/list";
import { GovFilters } from "../_components/filters";
import { BASE, documentWhere, fmtDate, qs, readFilters } from "../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meeting documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const f = readFilters(sp);
  const review = spGet(sp, "review");
  const sourceId = spGet(sp, "sourceId");
  const origin = spGet(sp, "origin");
  const { page, take, skip, perPage } = pageParams(sp, 40);
  const base = documentWhere(f);
  const where: Prisma.GovDocumentWhereInput = {
    ...base,
    ...(isOneOf(DOC_REVIEW, review) ? { reviewStatus: review } : {}),
    ...(/^[a-z0-9]{6,40}$/i.test(sourceId) ? { sourceId } : sourceId === "none" ? { sourceId: null } : {}),
    ...(["crawl", "email", "upload"].includes(origin) ? { origin } : {}),
  };
  const [rows, total, counts, communities] = await Promise.all([
    db.govDocument.findMany({ where, skip, take, orderBy: { discoveredAt: "desc" }, select: { id: true, title: true, docType: true, fileType: true, origin: true, status: true, reviewStatus: true, meetingDate: true, discoveredAt: true, revisionOfId: true, supersededAt: true, source: { select: { name: true, community: true } }, _count: { select: { findings: true } } } }),
    db.govDocument.count({ where }),
    db.govDocument.groupBy({ by: ["reviewStatus"], where: base, _count: { _all: true } }),
    sourceCommunities(),
  ]);
  const count = (s: string) => counts.find((c) => c.reviewStatus === s)?._count._all ?? 0;
  const extra = { ...(sourceId ? { sourceId } : {}), ...(origin ? { origin } : {}) };
  const tab = (s: string, label: string, n?: number) => ({ label, href: `${BASE}/documents/${qs({ ...f.values, ...extra }, s ? { review: s } : {})}`, active: review === s, count: n });
  return (
    <>
      <PageHeader title="Meeting documents" back={{ href: `${BASE}/`, label: "Government Watch" }}
        description="Every collected document, kept exactly as it was found. Each one is stored once (duplicates are detected); a changed file at the same address, or new minutes for the same meeting, is kept as a revision."
        actions={<Link href={`${BASE}/upload/`} className="btn-primary btn-sm"><Upload className="h-4 w-4" /> Upload document</Link>} />
      <LinkTabs className="mb-3" items={[tab("", "All"), ...DOC_REVIEW.map((r) => tab(r, DOC_REVIEW_LABEL[r], count(r)))]} />
      <GovFilters action={`${BASE}/documents/`} values={f.values} communities={communities} show={["community", "govType", "docType", "from", "to"]} hidden={{ ...(review ? { review } : {}), ...extra }} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No documents yet">Documents appear after a source is checked, a clerk emails the records inbox, or you upload one.</EmptyState>}
        columns={[
          { header: "Document", primary: true, cell: (r) => <div><Link href={`${BASE}/documents/${r.id}/`} className="font-semibold text-brand-700 hover:underline">{r.title}</Link><span className="block text-xs text-slate-500">{r.source ? `${r.source.name} · ${r.source.community}` : "No source assigned"}{r.revisionOfId ? " · revised version" : ""}{r.supersededAt ? " · replaced by a newer version" : ""}</span></div> },
          { header: "Type", cell: (r) => <span className="text-sm">{isOneOf(DOC_TYPES, r.docType) ? DOC_TYPE_LABEL[r.docType] : r.docType}<span className="block text-xs uppercase text-slate-500">{r.fileType} · {r.origin === "crawl" ? "website" : r.origin}</span></span> },
          { header: "Meeting", hideOnMobile: true, cell: (r) => <span className="text-sm">{fmtDate(r.meetingDate) ?? "—"}</span> },
          { header: "Analysis", cell: (r) => <span className="text-sm"><span className={r.status === "analyzed" ? "badge-green" : r.status === "failed" ? "badge-red" : "badge-amber"}>{DOC_STATUS_LABEL[r.status] ?? r.status}</span>{r.status === "analyzed" && <span className="block text-xs text-slate-500">{r._count.findings} potential stor{r._count.findings === 1 ? "y" : "ies"}</span>}</span> },
          { header: "Review", hideOnMobile: true, cell: (r) => <span className={r.reviewStatus === "awaiting_review" ? "badge-amber" : "badge-gray"}>{isOneOf(DOC_REVIEW, r.reviewStatus) ? DOC_REVIEW_LABEL[r.reviewStatus] : r.reviewStatus}</span> },
          { header: "Found", hideOnMobile: true, cell: (r) => <span className="text-xs text-slate-500">{formatDateTime(r.discoveredAt)}</span> },
        ]}
      />
      <Pagination total={total} page={page} perPage={perPage} basePath={`${BASE}/documents/`} params={{ ...f.values, ...extra, ...(review ? { review } : {}) }} />
    </>
  );
}

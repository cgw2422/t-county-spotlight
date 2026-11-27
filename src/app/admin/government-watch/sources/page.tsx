import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { DataTable } from "@/components/admin/data-table";
import { LinkTabs } from "@/components/admin/tabs";
import { ActionButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/utils";
import { GOV_TYPE_LABEL, GOV_TYPES, VERIFICATION_LABEL, isOneOf, VERIFICATION, COLLECTION_METHOD_LABEL, COLLECTION_METHODS } from "@/lib/gov-watch/shared";
import { sourceCommunities } from "@/lib/gov-watch/sources";
import { spGet, type SP } from "../../_lib/list";
import { checkNowAction, loadStarterSourcesAction } from "../actions";
import { BASE } from "../_lib";

export const dynamic = "force-dynamic";
export const metadata = { title: "Government sources" };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = spGet(sp, "status");
  const govType = spGet(sp, "govType");
  const community = spGet(sp, "community");
  const where: Prisma.GovSourceWhereInput = {
    ...(tab === "error" ? { lastStatus: "error" } : tab === "review" ? { verification: "needs_review" } : tab === "verified" ? { verification: "verified" } : tab === "off" ? { active: false } : {}),
    ...(isOneOf(GOV_TYPES, govType) ? { govType } : {}),
    ...(community ? { community } : {}),
  };
  const [rows, all, errors, review, verified, off, communities] = await Promise.all([
    db.govSource.findMany({ where, orderBy: [{ govType: "asc" }, { name: "asc" }], include: { _count: { select: { documents: true } } } }),
    db.govSource.count(), db.govSource.count({ where: { lastStatus: "error" } }), db.govSource.count({ where: { verification: "needs_review" } }),
    db.govSource.count({ where: { verification: "verified" } }), db.govSource.count({ where: { active: false } }), sourceCommunities(),
  ]);
  const href = (s: string) => `${BASE}/sources/${s ? `?status=${s}` : ""}`;
  return (
    <>
      <PageHeader
        title="Government sources"
        back={{ href: `${BASE}/`, label: "Government Watch" }}
        description="Every government body Government Watch follows. Sources marked “Needs review” came from research that couldn’t open the government websites: confirm each address and contact before relying on it. Active sources are checked automatically once a day."
        actions={<div className="flex gap-2"><ActionButton action={loadStarterSourcesAction} className="btn-ghost btn-sm">Add missing starter sources</ActionButton><Link href={`${BASE}/sources/new/`} className="btn-primary btn-sm"><Plus className="h-4 w-4" /> Add source</Link></div>}
      />
      <LinkTabs className="mb-3" items={[
        { label: "All", href: href(""), active: !tab, count: all }, { label: "Needs review", href: href("review"), active: tab === "review", count: review },
        { label: "Verified", href: href("verified"), active: tab === "verified", count: verified }, { label: "Failed checks", href: href("error"), active: tab === "error", count: errors },
        { label: "Not checked automatically", href: href("off"), active: tab === "off", count: off },
      ]} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        {tab && <input type="hidden" name="status" value={tab} />}
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Type</span><select name="govType" defaultValue={govType} className="input"><option value="">All</option>{GOV_TYPES.map((t) => <option key={t} value={t}>{GOV_TYPE_LABEL[t]}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-600">Community</span><select name="community" defaultValue={community} className="input"><option value="">All</option>{communities.map((c) => <option key={c}>{c}</option>)}</select></label>
        <button className="btn-secondary btn-sm">Filter</button>
      </form>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState title="No sources here">Load the starter list or add a source.</EmptyState>}
        columns={[
          { header: "Source", primary: true, cell: (r) => <div><Link href={`${BASE}/sources/${r.id}/`} className="font-semibold text-brand-700 hover:underline">{r.name}</Link><span className="block text-xs text-slate-500">{r.community} · {isOneOf(GOV_TYPES, r.govType) ? GOV_TYPE_LABEL[r.govType] : r.govType}</span></div> },
          { header: "Status", cell: (r) => <div className="space-y-1">
            <span className={r.verification === "verified" ? "badge-green" : r.verification === "unavailable" ? "badge-gray" : "badge-amber"}>{isOneOf(VERIFICATION, r.verification) ? VERIFICATION_LABEL[r.verification] : r.verification}</span>
            <span className="block text-xs text-slate-500">{r.active ? "Checked daily" : "Not checked automatically"}</span>
          </div> },
          { header: "Collection", hideOnMobile: true, cell: (r) => <span className="text-sm">{isOneOf(COLLECTION_METHODS, r.collectionMethod) ? COLLECTION_METHOD_LABEL[r.collectionMethod] : r.collectionMethod}<span className="block text-xs text-slate-500">{r.minutesUrl || r.agendasUrl ? "Minutes/agenda page set" : r.website ? "Website only" : "No address yet"}</span></span> },
          { header: "Last check", hideOnMobile: true, cell: (r) => r.lastCheckedAt ? <span className="text-sm"><span className={r.lastStatus === "error" ? "badge-red" : "badge-green"}>{r.lastStatus === "error" ? "Failed" : "OK"}</span> <span className="text-xs text-slate-500">{formatDateTime(r.lastCheckedAt)}</span>{r.lastStatus === "error" && r.lastError && <span className="block max-w-xs break-words text-xs text-red-700">{r.lastError.slice(0, 140)}</span>}</span> : <span className="text-xs text-slate-500">Never</span> },
          { header: "Last success", hideOnMobile: true, cell: (r) => <span className="text-xs text-slate-500">{r.lastSuccessAt ? formatDateTime(r.lastSuccessAt) : "—"}</span> },
          { header: "Documents", align: "right", cell: (r) => <Link href={`${BASE}/documents/?sourceId=${r.id}`} className="text-sm text-brand-700 hover:underline">{r._count.documents}</Link> },
        ]}
        actions={(r) => (r.minutesUrl || r.agendasUrl || r.website || r.extraUrls.length) ? <ActionButton action={checkNowAction} fields={{ id: r.id }} className="btn-secondary btn-sm" reloadOnSuccess>Check now</ActionButton> : null}
      />
    </>
  );
}

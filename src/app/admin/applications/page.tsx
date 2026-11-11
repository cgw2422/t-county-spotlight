import Link from "next/link";
import { ClipboardList, Eye } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { applicationClaim } from "@/lib/applications";
import { pageParams, spGet, type SP } from "../_lib/list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Business applications" };

const TABS = ["PENDING", "APPROVED", "REJECTED"] as const;

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaff();
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(spGet(sp, "tab").toUpperCase()) ? (spGet(sp, "tab").toUpperCase() as (typeof TABS)[number]) : "PENDING";
  const q = spGet(sp, "q");
  const { page, take, skip, perPage } = pageParams(sp);
  const search: Prisma.BusinessApplicationWhereInput = q ? { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }] } : {};
  const where = { ...search, status: tab };
  const [rows, total, counts] = await Promise.all([
    db.businessApplication.findMany({ where, skip, take, orderBy: { createdAt: tab === "PENDING" ? "asc" : "desc" } }),
    db.businessApplication.count({ where }),
    Promise.all(TABS.map((t) => db.businessApplication.count({ where: { ...search, status: t } }))),
  ]);
  const claimIds = [...new Set(rows.map((r) => applicationClaim(r)?.businessId).filter((x): x is string => !!x))];
  const claimed = claimIds.length ? await db.business.findMany({ where: { id: { in: claimIds } }, select: { id: true, name: true, deletedAt: true } }) : [];
  const kindBadge = (r: (typeof rows)[number]) => {
    const c = applicationClaim(r);
    if (!c) return <span className="badge-blue">New business</span>;
    const b = claimed.find((x) => x.id === c.businessId);
    return (
      <span className="badge-amber" data-testid="claim-badge">
        Claim of existing listing: {b && !b.deletedAt ? <Link className="underline" href={`/admin/businesses/${b.id}/`}>{b.name}</Link> : `${c.name || "unknown"} (deleted)`}
      </span>
    );
  };
  return (
    <>
      <PageHeader title="Business applications" description="Requests submitted through “List your business”. Approving a new business creates a listing; approving a claim adds the applicant as an owner of the existing listing." />
      <LinkTabs items={TABS.map((t, i) => ({ label: t[0] + t.slice(1).toLowerCase(), href: `/admin/applications/?tab=${t.toLowerCase()}${q ? `&q=${encodeURIComponent(q)}` : ""}`, active: t === tab, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search business, contact or email…" />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ClipboardList} title={tab === "PENDING" ? "No applications waiting" : `No ${tab.toLowerCase()} applications`}>New requests from the public form will show up here.</EmptyState>}
          columns={[
            { header: "Business", primary: true, cell: (r) => <div><Link href={`/admin/applications/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.businessName}</Link>{r.wantsSpotlight && <span className="badge-blue ml-2">Wants spotlight</span>}<div className="mt-1">{kindBadge(r)}</div><p className="text-xs text-slate-500">{r.category || "No category given"}</p></div> },
            { header: "Contact", cell: (r) => <div className="min-w-0"><p className="truncate">{r.contactName || "—"}</p><p className="truncate text-xs text-slate-500">{r.email}</p></div> },
            { header: "City", cell: (r) => r.city || "—" },
            { header: "Submitted", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} />, hideOnMobile: true },
          ]}
          actions={(r) => <Link href={`/admin/applications/${r.id}/`} className="btn-secondary btn-sm"><Eye className="h-4 w-4" /> Review</Link>}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/applications/" params={sp} />
      </div>
    </>
  );
}

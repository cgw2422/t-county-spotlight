import Link from "next/link";
import { Plus, FileStack, Pencil, RotateCcw, Trash2, ExternalLink } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { pageHref } from "@/lib/links";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { deletePageForever, restorePage, trashPage } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pages" };

const TABS: { key: string; label: string; where: Prisma.PageWhereInput }[] = [
  { key: "all", label: "All", where: { deletedAt: null } },
  { key: "published", label: "Published", where: { deletedAt: null, status: "PUBLISHED" } },
  { key: "drafts", label: "Drafts", where: { deletedAt: null, status: { not: "PUBLISHED" } } },
  { key: "trash", label: "Trash", where: { deletedAt: { not: null } } },
];

export default async function PagesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const q = spGet(sp, "q");
  const { page, take, skip, perPage } = pageParams(sp);
  const search: Prisma.PageWhereInput = q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {};
  const where = { AND: [tab.where, search] };
  const [rows, total, counts] = await Promise.all([
    db.page.findMany({ where, skip, take, orderBy: { title: "asc" } }),
    db.page.count({ where }),
    Promise.all(TABS.map((t) => db.page.count({ where: { AND: [t.where, search] } }))),
  ]);
  const trash = tab.key === "trash";
  return (
    <>
      <PageHeader title="Pages" description="Standalone pages like About, Contact or Advertise." actions={<Link href="/admin/pages/new/" className="btn-primary"><Plus className="h-4 w-4" /> New page</Link>} />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: `/admin/pages/?tab=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`, active: t.key === tab.key, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <ListToolbar placeholder="Search pages…" />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={FileStack} title={trash ? "Trash is empty" : "No pages yet"} />}
          columns={[
            { header: "Title", primary: true, cell: (r) => <div><Link href={`/admin/pages/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link><p className="text-xs text-slate-500">{pageHref(r)}{r.wpId ? " · imported" : ""}{r.showInNav ? " · in nav" : ""}</p></div> },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Updated", cell: (r) => <span className="whitespace-nowrap">{formatDate(r.updatedAt, { month: "short", day: "numeric", year: "numeric" })}</span> },
          ]}
          actions={(r) => trash ? (
            <>
              <ActionButton action={restorePage} fields={{ id: r.id }}><RotateCcw className="h-4 w-4" /> Restore</ActionButton>
              {user.role === "ADMIN" && <ConfirmButton action={deletePageForever} fields={{ id: r.id }} title="Permanently delete this page?" body="This cannot be undone." confirmLabel="Delete forever"><Trash2 className="h-4 w-4" /> Delete forever</ConfirmButton>}
            </>
          ) : (
            <>
              <Link href={`/admin/pages/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
              {r.status === "PUBLISHED" && <a href={pageHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.title}`}><ExternalLink className="h-4 w-4" /></a>}
              <ConfirmButton action={trashPage} fields={{ id: r.id }} title="Move to trash?" body="The page and its menu links will be hidden." confirmLabel="Move to trash" className="btn-ghost btn-sm text-red-700"><Trash2 className="h-4 w-4" /><span className="sr-only">Trash</span></ConfirmButton>
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/pages/" params={sp} />
      </div>
    </>
  );
}

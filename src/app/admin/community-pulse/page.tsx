import Link from "next/link";
import { Archive, Eye, EyeOff, MessagesSquare, Pencil, Plus, RotateCcw, Rocket, Star, Trash2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { pulseHref } from "@/lib/pulse";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { deletePulse, featurePulse, restorePulse, setPulseStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Community Pulse" };

const TABS = [
  { key: "all", label: "All", where: { deletedAt: null } },
  { key: "published", label: "Published", where: { deletedAt: null, status: "PUBLISHED" } },
  { key: "drafts", label: "Drafts", where: { deletedAt: null, status: "DRAFT" } },
  { key: "archived", label: "Archived", where: { deletedAt: null, status: "ARCHIVED" } },
  { key: "trash", label: "Deleted", where: { deletedAt: { not: null } } },
] as const satisfies readonly { key: string; label: string; where: Prisma.CommunityPulseWhereInput }[];

const short = { month: "short", day: "numeric", year: "numeric" } as const;

export default async function PulseListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === spGet(sp, "tab")) ?? TABS[0];
  const q = spGet(sp, "q");
  const category = spGet(sp, "category");
  const status = spGet(sp, "status");
  const { page, take, skip, perPage } = pageParams(sp);

  const filters: Prisma.CommunityPulseWhereInput = {
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { results: { some: { name: { contains: q, mode: "insensitive" } } } }] } : {}),
    ...(category === "none" ? { categoryId: null } : category ? { categoryId: category } : {}),
    ...(status === "PUBLISHED" || status === "DRAFT" || status === "ARCHIVED" ? { status } : {}),
  };
  const where: Prisma.CommunityPulseWhereInput = { AND: [tab.where, filters] };
  const [rows, total, counts, categories] = await Promise.all([
    db.communityPulse.findMany({
      where, skip, take, orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      select: { id: true, title: true, slug: true, status: true, publishedAt: true, updatedAt: true, deletedAt: true, isFeatured: true, featuredImageUrl: true, firstPublishedAt: true, category: { select: { name: true } }, _count: { select: { results: true } } },
    }),
    db.communityPulse.count({ where }),
    Promise.all(TABS.map((t) => db.communityPulse.count({ where: { AND: [t.where, filters] } }))),
    db.pulseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  const isTrash = tab.key === "trash";
  const qs = (k: string) => { const p = new URLSearchParams(); if (k !== "all") p.set("tab", k); if (q) p.set("q", q); if (category) p.set("category", category); if (status) p.set("status", status); const s = p.toString(); return `/admin/community-pulse/${s ? `?${s}` : ""}`; };

  return (
    <>
      <PageHeader
        title="Community Pulse"
        description="Community conversations and recommendations, compiled by hand into permanent, searchable pages."
        actions={isAdmin ? <Link href="/admin/community-pulse/new/" className="btn-primary"><Plus className="h-4 w-4" /> New entry</Link> : undefined}
      />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: qs(t.key), active: t.key === tab.key, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search titles, slugs or result names…"
          filters={[
            { name: "status", label: "Status", options: [{ value: "PUBLISHED", label: "Published" }, { value: "DRAFT", label: "Draft" }, { value: "ARCHIVED", label: "Archived" }] },
            { name: "category", label: "Category", options: [...categories.map((c) => ({ value: c.id, label: c.name })), { value: "none", label: "Uncategorized" }] },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={MessagesSquare} title={isTrash ? "Nothing deleted" : q || category || status ? "No entries match your filters" : "No Community Pulse entries yet"}>{!isTrash && !q && isAdmin && <Link href="/admin/community-pulse/new/" className="font-semibold text-brand-700">Create the first entry</Link>}</EmptyState>}
          columns={[
            {
              header: "Title", primary: true, className: "min-w-[260px]",
              cell: (r) => (
                <div className="flex items-start gap-3">
                  {r.featuredImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.featuredImageUrl} alt="" className="hidden h-11 w-16 shrink-0 rounded-md object-cover sm:block" />
                  ) : <span className="hidden h-11 w-16 shrink-0 rounded-md bg-slate-100 sm:block" />}
                  <div className="min-w-0">
                    <Link href={`/admin/community-pulse/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      {r.isFeatured && <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden /> Featured</span>}
                      <span>/community-pulse/{r.slug}/</span>
                    </div>
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <StatusBadge status={r.deletedAt ? "DELETED" : r.status} /> },
            { header: "Category", cell: (r) => <span className="text-slate-600">{r.category?.name ?? "—"}</span>, hideOnMobile: true },
            { header: "Results", cell: (r) => <span className="tabular-nums text-slate-600">{r._count.results}</span>, align: "right" },
            { header: "Published", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.publishedAt ? formatDate(r.publishedAt, short) : "—"}</span> },
            { header: "Updated", cell: (r) => <span className="whitespace-nowrap text-slate-600">{formatDate(r.updatedAt, short)}</span>, hideOnMobile: true },
          ]}
          actions={(r) => isTrash ? (
            isAdmin ? <ActionButton action={restorePulse} fields={{ id: r.id }} className="btn-secondary btn-sm"><RotateCcw className="h-4 w-4" /> Restore</ActionButton> : null
          ) : (
            <>
              <Link href={`/admin/community-pulse/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> {isAdmin ? "Edit" : "View"}</Link>
              {r.status === "PUBLISHED" ? (
                <a href={pulseHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.title}`}><Eye className="h-4 w-4" /></a>
              ) : (
                <Link href={`/admin/community-pulse/${r.id}/preview/`} className="btn-ghost btn-sm" aria-label={`Preview ${r.title}`}><Eye className="h-4 w-4" /></Link>
              )}
              {isAdmin && (
                <>
                  {r.status === "PUBLISHED" && !r.isFeatured && <ActionButton action={featurePulse} fields={{ id: r.id }} className="btn-ghost btn-sm" title="Set as featured"><Star className="h-4 w-4" /> <span className="hidden xl:inline">Set as featured</span><span className="sr-only xl:hidden">Set as featured</span></ActionButton>}
                  {r.status === "PUBLISHED" ? (
                    <ActionButton action={setPulseStatus} fields={{ id: r.id, intent: "unpublish" }} className="btn-ghost btn-sm" title="Unpublish"><EyeOff className="h-4 w-4" /><span className="sr-only">Unpublish</span></ActionButton>
                  ) : (
                    <ActionButton action={setPulseStatus} fields={{ id: r.id, intent: "publish" }} className="btn-ghost btn-sm" title="Publish"><Rocket className="h-4 w-4" /><span className="sr-only">Publish</span></ActionButton>
                  )}
                  {r.status !== "ARCHIVED" && <ActionButton action={setPulseStatus} fields={{ id: r.id, intent: "archive" }} className="btn-ghost btn-sm" title="Archive"><Archive className="h-4 w-4" /><span className="sr-only">Archive</span></ActionButton>}
                  <ConfirmButton
                    action={deletePulse} fields={{ id: r.id }} title="Delete this entry?" confirmLabel="Delete"
                    body={r.status === "DRAFT" && !r.firstPublishedAt ? <>“{r.title}” and its results will be permanently deleted.</> : <>“{r.title}” will be removed from the site. It can be restored from the Deleted tab.</>}
                    className="btn-ghost btn-sm text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span>
                  </ConfirmButton>
                </>
              )}
            </>
          )}
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/community-pulse/" params={sp} />
      </div>
    </>
  );
}

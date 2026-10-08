import Link from "next/link";
import { Plus, FileText, Pencil, Eye, RotateCcw, Trash2 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { articleHref } from "@/lib/links";
import { PageHeader } from "@/components/admin/page-header";
import { LinkTabs } from "@/components/admin/tabs";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { DataTable, Pagination } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { EmptyState } from "@/components/ui/empty-state";
import { pageParams, spGet, type SP } from "../_lib/list";
import { publishDueScheduled } from "../_lib/scheduling";
import { deleteArticleForever, restoreArticle, trashArticle } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Articles" };

const TABS = [
  { key: "all", label: "All", where: { deletedAt: null } },
  { key: "published", label: "Published", where: { deletedAt: null, status: "PUBLISHED" } },
  { key: "drafts", label: "Drafts", where: { deletedAt: null, status: { in: ["DRAFT", "UNPUBLISHED"] } } },
  { key: "scheduled", label: "Scheduled", where: { deletedAt: null, status: "SCHEDULED" } },
  { key: "pending", label: "Pending review", where: { deletedAt: null, status: "PENDING" } },
  { key: "trash", label: "Trash", where: { deletedAt: { not: null } } },
] as const satisfies readonly { key: string; label: string; where: Prisma.ArticleWhereInput }[];

export const KIND_LABEL: Record<string, string> = { SPOTLIGHT: "Spotlight", NEWS: "News", ANNOUNCEMENT: "Announcement", THINGS_TO_DO: "Things to Do", GENERAL: "General" };

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaff();
  await publishDueScheduled();
  const sp = await searchParams;
  const tabKey = spGet(sp, "tab") || "all";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];
  const q = spGet(sp, "q");
  const category = spGet(sp, "category");
  const kind = spGet(sp, "kind");
  const { page, take, skip, perPage } = pageParams(sp);

  const filters: Prisma.ArticleWhereInput = {
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
    ...(category ? { categories: { some: { id: category } } } : {}),
    ...(kind ? { kind: kind as Prisma.EnumArticleKindFilter["equals"] } : {}),
  };
  const where: Prisma.ArticleWhereInput = { AND: [tab.where, filters] };

  const [rows, total, counts, categories] = await Promise.all([
    db.article.findMany({
      where, skip, take,
      orderBy: tab.key === "scheduled" ? { publishedAt: "asc" } : [{ updatedAt: "desc" }],
      select: { id: true, title: true, slug: true, legacyPath: true, status: true, kind: true, publishedAt: true, updatedAt: true, deletedAt: true, wpId: true, isFeatured: true, authorName: true, featuredImageUrl: true, categories: { select: { name: true } } },
    }),
    db.article.count({ where }),
    Promise.all(TABS.map((t) => db.article.count({ where: { AND: [t.where, filters] } }))),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const isTrash = tab.key === "trash";
  const qs = (k: string) => { const p = new URLSearchParams(); if (k !== "all") p.set("tab", k); if (q) p.set("q", q); if (category) p.set("category", category); if (kind) p.set("kind", kind); const s = p.toString(); return `/admin/articles/${s ? `?${s}` : ""}`; };

  return (
    <>
      <PageHeader title="Articles" description="Business spotlights, news, announcements and things-to-do guides." actions={<Link href="/admin/articles/new/" className="btn-primary"><Plus className="h-4 w-4" /> New article</Link>} />
      <LinkTabs items={TABS.map((t, i) => ({ label: t.label, href: qs(t.key), active: t.key === tab.key, count: counts[i] }))} />
      <div className="card overflow-hidden">
        <ListToolbar
          placeholder="Search titles or slugs…"
          filters={[
            { name: "kind", label: "Type", options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })) },
            { name: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          ]}
        />
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={FileText} title={isTrash ? "Trash is empty" : q || category || kind ? "No articles match your filters" : "No articles yet"}>{!isTrash && !q && <Link href="/admin/articles/new/" className="font-semibold text-brand-700">Write the first article</Link>}</EmptyState>}
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
                    <Link href={`/admin/articles/${r.id}/`} className="font-semibold text-slate-900 hover:text-brand-700">{r.title}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{KIND_LABEL[r.kind]}</span>
                      {r.wpId && <span className="badge-gray">Imported</span>}
                      {r.isFeatured && <span className="badge-blue">Featured</span>}
                    </div>
                  </div>
                </div>
              ),
            },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Categories", cell: (r) => <span className="text-slate-600">{r.categories.map((c) => c.name).join(", ") || "—"}</span>, hideOnMobile: true },
            { header: "Author", cell: (r) => <span className="text-slate-600">{r.authorName || "—"}</span>, hideOnMobile: true },
            {
              header: isTrash ? "Trashed" : "Date",
              cell: (r) => (
                <span className="whitespace-nowrap text-slate-600">
                  {isTrash ? formatDate(r.deletedAt, { month: "short", day: "numeric", year: "numeric" })
                    : r.status === "SCHEDULED" ? <>Goes live {formatDate(r.publishedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>
                    : r.publishedAt && r.status === "PUBLISHED" ? formatDate(r.publishedAt, { month: "short", day: "numeric", year: "numeric" })
                    : <>Edited {formatDate(r.updatedAt, { month: "short", day: "numeric", year: "numeric" })}</>}
                </span>
              ),
            },
          ]}
          actions={(r) =>
            isTrash ? (
              <>
                <ActionButton action={restoreArticle} fields={{ id: r.id }} className="btn-secondary btn-sm"><RotateCcw className="h-4 w-4" /> Restore</ActionButton>
                {user.role === "ADMIN" && (
                  <ConfirmButton action={deleteArticleForever} fields={{ id: r.id }} title="Permanently delete this article?" body={<>“{r.title}” and all of its revisions will be deleted. This cannot be undone.</>} confirmLabel="Delete forever">
                    <Trash2 className="h-4 w-4" /> Delete forever
                  </ConfirmButton>
                )}
              </>
            ) : (
              <>
                <Link href={`/admin/articles/${r.id}/`} className="btn-secondary btn-sm"><Pencil className="h-4 w-4" /> Edit</Link>
                {r.status === "PUBLISHED" ? (
                  <a href={articleHref(r)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" aria-label={`View ${r.title}`}><Eye className="h-4 w-4" /></a>
                ) : (
                  <Link href={`/admin/articles/${r.id}/preview/`} className="btn-ghost btn-sm" aria-label={`Preview ${r.title}`}><Eye className="h-4 w-4" /></Link>
                )}
                <ConfirmButton action={trashArticle} fields={{ id: r.id }} title="Move to trash?" body={<>“{r.title}” will be hidden from the site. You can restore it from the Trash.</>} confirmLabel="Move to trash" className="btn-ghost btn-sm text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" /><span className="sr-only">Trash</span>
                </ConfirmButton>
              </>
            )
          }
        />
        <Pagination total={total} page={page} perPage={perPage} basePath="/admin/articles/" params={sp} />
      </div>
    </>
  );
}

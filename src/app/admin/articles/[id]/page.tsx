import { notFound } from "next/navigation";
import Link from "next/link";
import { History, RotateCcw, Trash2, ExternalLink } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, toDateInput } from "@/lib/utils";
import { articleHref } from "@/lib/links";
import { PageHeader, Card, Notice } from "@/components/admin/page-header";
import { ActionButton, ConfirmButton } from "@/components/admin/action-button";
import { ArticleForm } from "../article-form";
import { restoreArticle, restoreOriginalContent, restoreRevision, trashArticle } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit article" };

export default async function EditArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { created } = await searchParams;
  const a = await db.article.findUnique({
    where: { id },
    include: {
      categories: { select: { id: true } },
      tags: { select: { name: true } },
      businesses: { include: { business: { select: { id: true, name: true, city: true } } } },
      revisions: { orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { name: true, email: true } } } },
      _count: { select: { revisions: true } },
    },
  });
  if (!a) notFound();
  const [categories, tags] = await Promise.all([
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, take: 500 }),
  ]);
  const imported = !!(a.originalContent || a.wpId);

  return (
    <>
      <PageHeader
        title={a.title}
        back={{ href: "/admin/articles/", label: "Articles" }}
        actions={a.status === "PUBLISHED" && !a.deletedAt ? <a href={articleHref(a)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm"><ExternalLink className="h-4 w-4" /> View live</a> : undefined}
      />
      {created && <div className="mb-4"><Notice tone="success">Article created. Drafts autosave every 20 seconds while you edit.</Notice></div>}
      {a.deletedAt ? (
        <Notice tone="warn" title="This article is in the trash">
          <div className="mt-2"><ActionButton action={restoreArticle} fields={{ id: a.id }} reloadOnSuccess className="btn-secondary btn-sm"><RotateCcw className="h-4 w-4" /> Restore article</ActionButton></div>
        </Notice>
      ) : (
        <ArticleForm
          key={a.id}
          categories={categories}
          tagSuggestions={tags.map((t) => t.name)}
          article={{
            id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt ?? "", content: a.content, kind: a.kind, status: a.status,
            featuredImageUrl: a.featuredImageUrl ?? "", featuredImageAlt: a.featuredImageAlt ?? "", ogImageUrl: a.ogImageUrl ?? "",
            authorName: a.authorName ?? "", seoTitle: a.seoTitle ?? "", seoDescription: a.seoDescription ?? "", isFeatured: a.isFeatured,
            publishAtInput: a.status === "SCHEDULED" || a.status === "PUBLISHED" ? toDateInput(a.publishedAt) : "",
            publishedLabel: a.publishedAt ? formatDateTime(a.publishedAt) : "",
            categoryIds: a.categories.map((c) => c.id), tagNames: a.tags.map((t) => t.name),
            businesses: a.businesses.map((b) => ({ id: b.business.id, label: b.business.name, sub: b.business.city })),
            imported, legacyPath: a.legacyPath ?? "",
          }}
        />
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card title={<span className="inline-flex items-center gap-2"><History className="h-4 w-4" /> Revisions</span>} description={`${a._count.revisions} saved version${a._count.revisions === 1 ? "" : "s"} · restoring keeps the current version in history`} bodyClassName="p-0">
          {a.revisions.length ? (
            <ul className="divide-y divide-slate-100">
              {a.revisions.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{r.note || "Saved"}{i === 0 && <span className="badge-blue ml-2">Latest</span>}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(r.createdAt)} · {r.user ? r.user.name || r.user.email : "System / import"} · {r.content.length.toLocaleString()} chars</p>
                  </div>
                  {i > 0 && !a.deletedAt && (
                    <ActionButton action={restoreRevision} fields={{ revisionId: r.id }} reloadOnSuccess className="btn-secondary btn-sm" confirm={{ title: "Restore this revision?", body: <>The title, excerpt and content from {formatDateTime(r.createdAt)} will replace the current version. The current version stays in history.</>, confirmLabel: "Restore" }}>
                      <RotateCcw className="h-4 w-4" /> Restore
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-6 text-sm text-slate-500">No revisions yet. One is saved every time you save.</p>}
        </Card>
        <div className="space-y-6">
          {a.originalContent && !a.deletedAt && (
            <Card title="Original WordPress HTML" description={a.wpModifiedAt ? `Last modified in WordPress ${formatDateTime(a.wpModifiedAt)}` : "Kept verbatim from the import"}>
              <p className="text-sm text-slate-600">{a.localEditedAt ? `Edited here ${formatDateTime(a.localEditedAt)} — re-running the importer won't overwrite your edits.` : "Not edited since import."}</p>
              <div className="mt-3">
                <ActionButton action={restoreOriginalContent} fields={{ id: a.id }} reloadOnSuccess className="btn-secondary btn-sm" confirm={{ title: "Restore the original WordPress HTML?", body: "The current content is replaced with the untouched imported HTML. The current version stays in revisions.", confirmLabel: "Restore original" }}>
                  <RotateCcw className="h-4 w-4" /> Restore original
                </ActionButton>
              </div>
            </Card>
          )}
          {!a.deletedAt && (
            <Card title="Danger zone">
              <p className="mb-3 text-sm text-slate-600">Trashed articles disappear from the site and can be restored later.</p>
              <ConfirmButton action={trashArticle} fields={{ id: a.id, redirect: "1" }} title="Move to trash?" body={<>“{a.title}” will be hidden from the site.</>} confirmLabel="Move to trash">
                <Trash2 className="h-4 w-4" /> Move to trash
              </ConfirmButton>
            </Card>
          )}
          <p className="text-xs text-slate-500">Need the list? <Link className="text-brand-700 hover:underline" href="/admin/articles/">Back to articles</Link></p>
        </div>
      </div>
    </>
  );
}

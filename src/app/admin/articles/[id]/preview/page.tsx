import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/status-badge";
import { Notice } from "@/components/admin/page-header";
import { KIND_LABEL } from "../../page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview" };

export default async function PreviewArticle({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const a = await db.article.findUnique({ where: { id }, include: { categories: { select: { name: true } }, businesses: { include: { business: { select: { name: true } } } } } });
  if (!a) notFound();
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Notice tone="info"><span className="inline-flex flex-wrap items-center gap-2">Preview — this is how the article will look. Status: <StatusBadge status={a.status} /></span></Notice>
        <Link href={`/admin/articles/${a.id}/`} className="btn-primary btn-sm"><Pencil className="h-4 w-4" /> Back to editor</Link>
      </div>
      <article className="card mx-auto max-w-3xl overflow-hidden">
        {a.featuredImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.featuredImageUrl} alt={a.featuredImageAlt ?? ""} className="aspect-[16/9] w-full object-cover" />
        )}
        <div className="px-5 py-8 sm:px-10">
          <p className="eyebrow">{KIND_LABEL[a.kind]}{a.categories.length ? ` · ${a.categories.map((c) => c.name).join(", ")}` : ""}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-navy-900 sm:text-4xl">{a.title}</h1>
          <p className="mt-3 text-sm text-slate-500">{[a.authorName, a.publishedAt ? formatDate(a.publishedAt) : "Not yet published"].filter(Boolean).join(" · ")}</p>
          {a.excerpt && <p className="mt-4 text-lg text-slate-600">{a.excerpt}</p>}
          <div className={`${PROSE_CLASSES} mt-8`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(a.content) }} />
          {a.businesses.length > 0 && <p className="mt-8 border-t border-slate-100 pt-4 text-sm text-slate-600">Featured businesses: {a.businesses.map((b) => b.business.name).join(", ")}</p>}
        </div>
      </article>
    </>
  );
}

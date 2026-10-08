import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper, X } from "lucide-react";
import { db } from "@/lib/db";
import { articleCardSelect, publishedArticleWhere } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { ArticleCard } from "@/components/cards/article-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { SearchBox } from "@/components/public/search-box";
import { Pagination } from "@/components/public/pagination";
import { StoryFeature } from "@/components/public/story-feature";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
const PER_PAGE = 12;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const category = param(sp, "category"), tag = param(sp, "tag"), page = pageParam(sp);
  const [cat, tg] = await Promise.all([
    category ? db.category.findUnique({ where: { slug: category }, select: { name: true, description: true } }) : null,
    tag ? db.tag.findUnique({ where: { slug: tag }, select: { name: true } }) : null,
  ]);
  return buildMetadata({
    title: cat ? `${cat.name} — Stories` : tg ? `Stories tagged “${tg.name}”` : "Stories & News",
    description: cat?.description || "Stories, business spotlights and community news from across Tuscarawas County, Ohio.",
    path: `/articles/${qs({ category: cat ? category : undefined, tag: tg ? tag : undefined, page: page > 1 ? page : undefined })}`,
    noindex: !!param(sp, "q"),
  });
}

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = param(sp, "q").slice(0, 100);
  const catSlug = param(sp, "category");
  const tagSlug = param(sp, "tag");
  const page = pageParam(sp);

  const [categories, tag] = await Promise.all([
    db.category.findMany({
      where: { articles: { some: publishedArticleWhere() } },
      select: { id: true, name: true, slug: true, _count: { select: { articles: { where: publishedArticleWhere() } } } },
      orderBy: { name: "asc" },
    }),
    tagSlug ? db.tag.findUnique({ where: { slug: tagSlug }, select: { id: true, name: true, slug: true } }) : null,
  ]);
  const category = catSlug ? await db.category.findUnique({ where: { slug: catSlug }, select: { id: true, name: true, slug: true, description: true } }) : null;

  const and: Prisma.ArticleWhereInput[] = [];
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ title: c }, { excerpt: c }, { content: c }] });
  }
  if (category) and.push({ categories: { some: { id: category.id } } });
  if (tag) and.push({ tags: { some: { id: tag.id } } });
  const where = publishedArticleWhere(and.length ? { AND: and } : {});
  const [total, articles] = await Promise.all([
    db.article.count({ where }),
    db.article.findMany({ where, select: articleCardSelect, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (o: { category?: string | null; tag?: string | null; q?: string | null; page?: number }) => `/articles/${qs({
    q: o.q === undefined ? q : o.q,
    category: o.category === undefined ? category?.slug : o.category,
    tag: o.tag === undefined ? tag?.slug : o.tag,
    page: o.page && o.page > 1 ? o.page : undefined,
  })}`;
  const showLead = page === 1 && !q && !category && !tag && articles.length > 3;
  const [lead, ...rest] = articles;
  const filtered = !!(q || category || tag);

  return (
    <>
      <PageHeader
        eyebrow="Stories & news"
        title={category ? category.name : tag ? `#${tag.name}` : "Articles"}
        subtitle={category?.description || "Business spotlights, community news and things worth knowing about in Tuscarawas County."}
        crumbs={category || tag ? [{ label: "Articles", href: "/articles/" }, { label: category?.name ?? `#${tag!.name}` }] : [{ label: "Articles" }]}
      />
      <div className="container-page py-6 sm:py-8">
        <SearchBox action="/articles/" defaultValue={q} placeholder="Search stories…" label="Search articles" hidden={{ category: category?.slug, tag: tag?.slug }} id="art-q" />
        {categories.length > 0 && (
          <nav aria-label="Article categories" className="-mx-4 mt-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <ul className="flex gap-2 pb-1 sm:flex-wrap">
              <li><Link href={href({ category: null, page: 1 })} aria-current={!category ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", !category ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>All stories</Link></li>
              {categories.map((c) => (
                <li key={c.id}><Link href={href({ category: c.slug, page: 1 })} aria-current={c.id === category?.id ? "page" : undefined} className={cn("inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium ring-1", c.id === category?.id ? "bg-navy-800 text-white ring-navy-800" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}>{c.name}</Link></li>
              ))}
            </ul>
          </nav>
        )}
        {filtered && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <p><span className="font-semibold text-slate-900">{total}</span> {total === 1 ? "story" : "stories"}</p>
            {q && <Link href={href({ q: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">“{q}” <X className="h-3 w-3" aria-label="Remove search" /></Link>}
            {tag && <Link href={href({ tag: null, page: 1 })} className="badge-gray min-h-7 hover:bg-slate-200">#{tag.name} <X className="h-3 w-3" aria-label="Remove tag filter" /></Link>}
          </div>
        )}

        <div className="mt-8">
          {articles.length === 0 ? (
            <EmptyState icon={Newspaper} title={filtered ? "No stories match" : "Stories are on the way"}>
              {filtered ? <>Try another search or <Link href="/articles/" className="font-semibold text-brand-700">see all stories</Link>.</> : "We’re bringing our archive of local stories over now. Check back soon."}
            </EmptyState>
          ) : (
            <>
              {showLead && <div className="mb-10"><StoryFeature a={lead} /></div>}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {(showLead ? rest : articles).map((a) => <ArticleCard key={a.id} a={a} />)}
              </div>
            </>
          )}
          <Pagination page={page} totalPages={totalPages} hrefFor={(p) => href({ page: p })} />
        </div>
      </div>
    </>
  );
}

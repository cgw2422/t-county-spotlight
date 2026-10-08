import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";
import { db } from "@/lib/db";
import { articleCardSelect, businessCardSelect, publicBusinessWhere, publishedArticleWhere } from "@/lib/queries";
import { ArticleCard } from "@/components/cards/article-card";
import { BusinessCard } from "@/components/cards/business-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { Pagination } from "@/components/public/pagination";
import { StoryFeature } from "@/components/public/story-feature";
import { buildMetadata, pageParam, qs, type SearchParams } from "@/components/public/seo";

export const dynamic = "force-dynamic";
const PER_PAGE = 12;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const page = pageParam(await searchParams);
  return buildMetadata({
    title: "Business Spotlights",
    description: "The people and stories behind Tuscarawas County’s local businesses — in-depth spotlights from TCountySpotlight.",
    path: `/spotlights/${qs({ page: page > 1 ? page : undefined })}`,
  });
}

export default async function SpotlightsPage({ searchParams }: { searchParams: SearchParams }) {
  const page = pageParam(await searchParams);
  const where = publishedArticleWhere({ kind: "SPOTLIGHT" });
  const [total, lead] = await Promise.all([
    db.article.count({ where }),
    page === 1 ? db.article.findFirst({ where, select: articleCardSelect, orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }] }) : null,
  ]);
  const listWhere = lead ? publishedArticleWhere({ kind: "SPOTLIGHT", id: { not: lead.id } }) : where;
  const listTotal = lead ? total - 1 : total;
  const [articles, businesses] = await Promise.all([
    db.article.findMany({ where: listWhere, select: articleCardSelect, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    page === 1 ? db.business.findMany({ where: publicBusinessWhere({ isSpotlighted: true }), select: businessCardSelect, orderBy: { updatedAt: "desc" }, take: 4 }) : [],
  ]);
  const totalPages = Math.max(1, Math.ceil(listTotal / PER_PAGE));

  return (
    <>
      <PageHeader
        eyebrow="Editorial"
        title="Business Spotlights"
        subtitle="Every business has a story. Meet the owners, makers and families who make Tuscarawas County special."
        crumbs={[{ label: "Spotlights" }]}
      />
      <div className="container-page py-8 sm:py-10">
        {total === 0 ? (
          <EmptyState icon={Star} title="Spotlight stories are on the way">
            We&rsquo;re bringing our archive of business spotlights over now. Know a business with a great story? <Link href="/list-your-business/" className="font-semibold text-brand-700">Tell us about it</Link>.
          </EmptyState>
        ) : (
          <>
            {lead && <StoryFeature a={lead} eyebrow="Featured spotlight" />}
            {articles.length > 0 && (
              <section aria-labelledby="more-spotlights" className={lead ? "mt-12" : ""}>
                {lead && <h2 id="more-spotlights" className="section-title mb-6">More spotlights</h2>}
                {!lead && <h2 id="more-spotlights" className="sr-only">Spotlights</h2>}
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
              </section>
            )}
            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => `/spotlights/${qs({ page: p > 1 ? p : undefined })}`} />
          </>
        )}

        {businesses.length > 0 && (
          <section aria-labelledby="spotlighted-biz" className="mt-16 rounded-3xl bg-cream p-6 ring-1 ring-amber-200/60 sm:p-8">
            <h2 id="spotlighted-biz" className="section-title">Spotlighted businesses</h2>
            <p className="mt-1 text-slate-600">Chosen by our editors — spotlights are never for sale.</p>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{businesses.map((b) => <BusinessCard key={b.id} b={b} />)}</div>
          </section>
        )}
      </div>
    </>
  );
}

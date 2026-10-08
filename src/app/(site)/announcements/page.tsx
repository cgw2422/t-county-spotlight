import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { db } from "@/lib/db";
import { articleCardSelect, publishedArticleWhere } from "@/lib/queries";
import { ArticleCard } from "@/components/cards/article-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { Pagination } from "@/components/public/pagination";
import { buildMetadata, pageParam, qs, type SearchParams } from "@/components/public/seo";

export const dynamic = "force-dynamic";
const PER_PAGE = 16;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const page = pageParam(await searchParams);
  return buildMetadata({
    title: "Community Announcements",
    description: "Announcements and community news from around Tuscarawas County, Ohio.",
    path: `/announcements/${qs({ page: page > 1 ? page : undefined })}`,
  });
}

export default async function AnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const page = pageParam(await searchParams);
  const where = publishedArticleWhere({ kind: "ANNOUNCEMENT" });
  const [total, items] = await Promise.all([
    db.article.count({ where }),
    db.article.findMany({ where, select: articleCardSelect, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Community news" title="Announcements" subtitle="Openings, milestones, and news from around the county." crumbs={[{ label: "Announcements" }]} />
      <div className="container-page py-8 sm:py-10">
        {items.length === 0 ? (
          <EmptyState icon={Megaphone} title="No announcements yet">Community announcements will appear here as they&rsquo;re published.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} hrefFor={(p) => `/announcements/${qs({ page: p > 1 ? p : undefined })}`} />
      </div>
    </>
  );
}

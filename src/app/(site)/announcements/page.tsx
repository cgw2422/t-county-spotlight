import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { articleCardSelect, publishedArticleWhere } from "@/lib/queries";
import { COMMUNITIES, communityName, communitySlug } from "@/lib/my-t-county-shared";
import { ArticleCard } from "@/components/cards/article-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/public/page-header";
import { Pagination } from "@/components/public/pagination";
import { buildMetadata, pageParam, param, qs, type SearchParams } from "@/components/public/seo";

export const dynamic = "force-dynamic";
const PER_PAGE = 16;
const EARLIER_PER_PAGE = 12;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const page = pageParam(sp);
  const city = communityName(param(sp, "city"));
  return buildMetadata({
    title: city ? `Community Updates in ${city}` : "Community Announcements",
    description: city ? `Community updates and news from ${city}, Tuscarawas County, Ohio.` : "Announcements and community news from around Tuscarawas County, Ohio.",
    path: `/announcements/${qs({ city: city ? communitySlug(city) : undefined, page: page > 1 ? page : undefined })}`,
    noindex: !!param(sp, "ep"),
  });
}

/**
 * All community updates (Article kind ANNOUNCEMENT). Updates whose "show
 * prominently until" date (expiresAt) has passed move to "Earlier updates"
 * but stay available here.
 */
export default async function AnnouncementsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = pageParam(sp);
  const ep = Math.max(1, Number.parseInt(param(sp, "ep"), 10) || 1);
  const city = communityName(param(sp, "city"));
  const citySlug = (city && communitySlug(city)) || "";
  const now = new Date();
  const base: Prisma.ArticleWhereInput[] = [{ kind: "ANNOUNCEMENT" }, ...(city ? [{ city: { equals: city, mode: "insensitive" as const } }] : [])];
  const currentWhere = publishedArticleWhere({ AND: [...base, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] });
  const earlierWhere = publishedArticleWhere({ AND: [...base, { expiresAt: { lte: now } }] });
  const [total, items, earlierTotal, earlier] = await Promise.all([
    db.article.count({ where: currentWhere }),
    db.article.findMany({ where: currentWhere, select: articleCardSelect, orderBy: { publishedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.article.count({ where: earlierWhere }),
    db.article.findMany({ where: earlierWhere, select: articleCardSelect, orderBy: { publishedAt: "desc" }, skip: (ep - 1) * EARLIER_PER_PAGE, take: EARLIER_PER_PAGE }),
  ]);
  const href = (p: number, e: number) => `/announcements/${qs({ city: citySlug, page: p > 1 ? p : undefined, ep: e > 1 ? e : undefined })}`;
  return (
    <>
      <PageHeader eyebrow="Community news" title={city ? `Community Updates · ${city}` : "Announcements"} subtitle="Openings, milestones, and news from around the county." crumbs={[{ label: "Announcements" }]}>
        <Link href="/submit/suggest/?kind=COMMUNITY_UPDATE" className="btn-secondary">Share a community update</Link>
      </PageHeader>
      <div className="container-page py-8 sm:py-10">
        <form action="/announcements/" method="get" className="mb-6 flex max-w-md items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="f-city" className="label">Community</label>
            <select id="f-city" name="city" defaultValue={citySlug} className="input">
              <option value="">All of Tuscarawas County</option>
              {COMMUNITIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn-primary">Apply</button>
        </form>
        {items.length === 0 ? (
          <EmptyState icon={Megaphone} title={city ? `No current updates for ${city}` : "No current announcements"}>
            {city ? <><Link href="/announcements/" className="font-semibold text-brand-700">See all of T County</Link>. </> : null}
            Community announcements will appear here as they&rsquo;re published.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4" data-testid="announcements-current">
            {items.map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
        )}
        <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))} hrefFor={(p) => href(p, ep)} />

        {earlierTotal > 0 && (
          <section aria-labelledby="earlier-title" className="mt-12" data-testid="announcements-earlier">
            <h2 id="earlier-title" className="section-title">Earlier updates</h2>
            <p className="mt-1 text-sm text-slate-600">Past community updates, kept for reference.</p>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">{earlier.map((a) => <ArticleCard key={a.id} a={a} variant="compact" />)}</div>
            <Pagination page={ep} totalPages={Math.max(1, Math.ceil(earlierTotal / EARLIER_PER_PAGE))} hrefFor={(e) => href(page, e)} />
          </section>
        )}
      </div>
    </>
  );
}

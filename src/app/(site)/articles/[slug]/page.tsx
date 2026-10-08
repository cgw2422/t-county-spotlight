import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ArticleView } from "@/components/public/article-view";
import { articleMetadata, findPublishedArticle, getRelatedArticles } from "@/components/public/article-data";
import { followRedirectIfAny, isSaved } from "@/components/public/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  return findPublishedArticle({ slug: decodeURIComponent(slug) });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load((await params).slug);
  return a ? articleMetadata(a) : {};
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = await load(slug);
  if (!a) {
    await followRedirectIfAny(`/articles/${slug}/`);
    notFound();
  }
  // Migrated articles live at their original WordPress URL — exactly one canonical URL.
  if (a.legacyPath && a.legacyPath !== `/articles/${a.slug}/`) permanentRedirect(a.legacyPath);
  const [related, saved] = await Promise.all([getRelatedArticles(a), isSaved("ARTICLE", a.id)]);
  return <ArticleView article={a} related={related} saved={saved} />;
}

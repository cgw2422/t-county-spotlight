import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import type { ArticleCardData } from "@/components/cards/article-card";
import { articleHref } from "@/lib/links";
import { formatDate, stripHtml, truncate } from "@/lib/utils";

/** Large magazine-style lead story. */
export function StoryFeature({ a, eyebrow }: { a: ArticleCardData; eyebrow?: string }) {
  const title = stripHtml(a.title);
  return (
    <Link href={articleHref(a)} className="group grid overflow-hidden rounded-3xl bg-navy-900 text-white shadow-lg lg:grid-cols-[1.4fr_1fr]">
      <div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto lg:min-h-[420px]">
        {a.featuredImageUrl ? (
          <SmartImage src={a.featuredImageUrl} alt={a.featuredImageAlt || ""} fill priority sizes="(min-width:1024px) 60vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
        ) : <ImagePlaceholder label={title} />}
      </div>
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-wider text-sunset-400">{eyebrow ?? a.categories?.[0]?.name ?? "Featured story"}</p>
        <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-balance sm:text-4xl">{title}</h2>
        {a.excerpt && <p className="mt-4 line-clamp-4 text-white/80 sm:text-lg">{truncate(stripHtml(a.excerpt), 280)}</p>}
        <div className="mt-6 flex items-center justify-between gap-4 text-sm">
          {a.publishedAt && <span className="text-white/60">{formatDate(a.publishedAt)}</span>}
          <span className="flex items-center gap-1 font-semibold text-white group-hover:text-sunset-400">Read the story <ArrowRight className="h-4 w-4" aria-hidden /></span>
        </div>
      </div>
    </Link>
  );
}

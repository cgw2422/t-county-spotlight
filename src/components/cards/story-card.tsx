import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { articleHref } from "@/lib/links";
import { stripHtml } from "@/lib/utils";
import type { StoryImageFit } from "@/lib/story-cards";
import type { ArticleCardData } from "./article-card";

const KIND_EYEBROW: Record<string, string> = {
  SPOTLIGHT: "Business Spotlight",
  THINGS_TO_DO: "Things to Do",
  ANNOUNCEMENT: "Community Update",
  NEWS: "News",
  GENERAL: "Local Story",
};

/**
 * Editorial story card (homepage "spotlights" section): fixed 16:9 image area, eyebrow, title,
 * short excerpt and a "Read the …" cue. The whole card is one link to the article — no nested
 * links and no directory-style details (address, phone, categories chips, ratings).
 */
export function StoryCard({ a, fit = "cover", excerpt, sizes }: { a: ArticleCardData; fit?: StoryImageFit; excerpt?: string | null; sizes: string }) {
  const title = stripHtml(a.title);
  const spotlight = a.kind === "SPOTLIGHT";
  const eyebrow = spotlight ? KIND_EYEBROW.SPOTLIGHT : a.categories?.[0]?.name ?? KIND_EYEBROW[a.kind ?? "GENERAL"] ?? KIND_EYEBROW.GENERAL;
  const img = a.featuredImageUrl;
  return (
    <Link href={articleHref(a)} data-testid="story-card" data-fit={img ? fit : "placeholder"} className="card card-hover group flex h-full flex-col overflow-hidden">
      <div data-testid="story-card-image" className="relative aspect-[16/9] shrink-0 overflow-hidden bg-slate-100">
        {!img ? (
          <ImagePlaceholder label={title} />
        ) : fit === "contain" ? (
          <div className="absolute inset-0 bg-slate-50 p-5 sm:p-6">
            <div className="relative h-full w-full">
              <SmartImage src={img} alt={a.featuredImageAlt || ""} fill sizes={sizes} className="object-contain" />
            </div>
          </div>
        ) : (
          <SmartImage src={img} alt={a.featuredImageAlt || ""} fill sizes={sizes} className="object-cover transition duration-500 group-hover:scale-105" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="mt-2 line-clamp-2 font-display text-xl font-bold leading-snug text-navy-900 text-balance group-hover:text-brand-700">{title}</h3>
        {excerpt && <p className="mt-2 line-clamp-3 text-[0.95rem] leading-relaxed text-slate-600">{excerpt}</p>}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-4 font-display text-sm font-bold text-brand-700 group-hover:text-brand-600">
          {spotlight ? "Read the Spotlight" : "Read the story"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

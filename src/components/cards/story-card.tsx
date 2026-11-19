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
 * Compact editorial story card (homepage "spotlights" section): small thumbnail on the left,
 * eyebrow, title, two-line excerpt and a "Read the …" cue on the right. Photos are cropped
 * (object-cover); logos/graphics are contained so artwork isn't cut off. The whole card is one
 * link to the article — no nested links and no directory-style details.
 */
export function StoryCard({ a, fit: fitProp = "cover", excerpt, sizes = "120px" }: { a: ArticleCardData; fit?: StoryImageFit; excerpt?: string | null; sizes?: string }) {
  const title = stripHtml(a.title);
  const spotlight = a.kind === "SPOTLIGHT";
  const eyebrow = spotlight ? KIND_EYEBROW.SPOTLIGHT : a.categories?.[0]?.name ?? KIND_EYEBROW[a.kind ?? "GENERAL"] ?? KIND_EYEBROW.GENERAL;
  const img = a.featuredImageUrl;
  // Newsletter (beehiiv) covers are graphics with text: always shown whole.
  const fit: StoryImageFit = a.beehiivPostId ? "contain" : fitProp;
  return (
    <Link href={articleHref(a)} data-testid="story-card" data-fit={img ? fit : "placeholder"} className="card card-hover group flex h-full items-start gap-4 p-3 sm:p-4">
      <div data-testid="story-card-image" className="relative aspect-square w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-[112px]">
        {!img ? (
          <ImagePlaceholder className="p-2 [&_svg]:h-7 [&_svg]:w-7" />
        ) : fit === "contain" ? (
          <div className="absolute inset-0 bg-slate-50 p-2">
            <div className="relative h-full w-full">
              <SmartImage src={img} alt={a.featuredImageAlt || ""} fill sizes={sizes} className="object-contain" />
            </div>
          </div>
        ) : (
          <SmartImage src={img} alt={a.featuredImageAlt || ""} fill sizes={sizes} className="object-cover transition duration-500 group-hover:scale-105" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <p className="eyebrow text-[11px]">{eyebrow}</p>
        <h3 className="mt-1 line-clamp-2 font-display text-base font-bold leading-snug text-navy-900 group-hover:text-brand-700 sm:text-lg">{title}</h3>
        {excerpt && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">{excerpt}</p>}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-2 font-display text-sm font-bold text-brand-700 group-hover:text-brand-600">
          {spotlight ? "Read the Spotlight" : "Read the story"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

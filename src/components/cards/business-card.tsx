import Link from "next/link";
import { MapPin, ThumbsUp } from "lucide-react";
import { coverPosition } from "@/lib/cover";
import { BusinessCardImage } from "./business-card-image";
import { businessHref } from "@/lib/links";
import { stripHtml, truncate } from "@/lib/utils";
import { visibleRecommendationCount } from "@/lib/recommendations-shared";

export type BusinessCardData = {
  id: string; slug: string; name: string; tagline?: string | null; description?: string | null; city?: string | null;
  coverUrl?: string | null; coverFocusX?: number | null; coverFocusY?: number | null; logoUrl?: string | null; isSpotlighted?: boolean;
  categories?: { name: string }[];
  recommendationCount?: number | null; recommendationsDisabled?: boolean | null;
};

export function BusinessCard({ b, sponsored, sponsoredLabel = "Sponsored" }: { b: BusinessCardData; sponsored?: boolean; sponsoredLabel?: string }) {
  const recs = visibleRecommendationCount(b);
  return (
    <Link href={businessHref(b)} className="card card-hover group flex flex-col overflow-hidden">
      <div className="relative aspect-video max-h-44 w-full overflow-hidden bg-slate-100 sm:max-h-none">
        <BusinessCardImage
          name={b.name}
          category={b.categories?.[0]?.name}
          coverUrl={b.coverUrl}
          logoUrl={b.logoUrl}
          objectPosition={b.coverUrl ? coverPosition(b.coverFocusX, b.coverFocusY) : undefined}
          sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          {sponsored && <span className="badge-sponsored">{sponsoredLabel}</span>}
          {b.isSpotlighted && <span className="badge bg-white/95 text-navy-900 shadow-sm">★ Spotlight</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 font-semibold text-navy-900 group-hover:text-brand-700">{b.name}</h3>
          {recs > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hillside-50 px-2 py-0.5 text-xs font-semibold text-hillside-700 ring-1 ring-hillside-200" role="img" aria-label={`${recs} ${recs === 1 ? "recommendation" : "recommendations"}`} title="Community recommendations from members" data-testid="card-recommendations">
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden /><span aria-hidden className="tabular-nums">{recs}</span>
            </span>
          )}
        </div>
        {b.categories?.[0] && <p className="text-sm text-slate-500">{b.categories.map((c) => c.name).slice(0, 2).join(" · ")}</p>}
        {(b.tagline || b.description) && (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{b.tagline || truncate(stripHtml(b.description), 140)}</p>
        )}
        {b.city && (
          <p className="mt-auto flex items-center gap-1 pt-3 text-sm text-slate-500"><MapPin className="h-4 w-4" aria-hidden />{b.city}</p>
        )}
      </div>
    </Link>
  );
}

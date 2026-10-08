import Link from "next/link";
import { MapPin } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { businessHref } from "@/lib/links";
import { stripHtml, truncate } from "@/lib/utils";

export type BusinessCardData = {
  id: string; slug: string; name: string; tagline?: string | null; description?: string | null; city?: string | null;
  coverUrl?: string | null; logoUrl?: string | null; isSpotlighted?: boolean;
  categories?: { name: string }[];
};

export function BusinessCard({ b, sponsored, sponsoredLabel = "Sponsored" }: { b: BusinessCardData; sponsored?: boolean; sponsoredLabel?: string }) {
  const img = b.coverUrl || b.logoUrl;
  return (
    <Link href={businessHref(b)} className="card card-hover group flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {img ? (
          <SmartImage src={img} alt="" fill sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <ImagePlaceholder label={b.name} />
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {sponsored && <span className="badge-sponsored">{sponsoredLabel}</span>}
          {b.isSpotlighted && <span className="badge bg-white/95 text-navy-900 shadow-sm">★ Spotlight</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-navy-900 group-hover:text-brand-700">{b.name}</h3>
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

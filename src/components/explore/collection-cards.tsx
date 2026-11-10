import Link from "next/link";
import { Compass, ExternalLink, MapPin, Navigation } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { coverPosition } from "@/lib/cover";
import { communityHref } from "@/lib/communities-shared";
import type { PlaceData } from "@/lib/explore-collections";

/** Collection teaser on /explore/. Only collections with visible items are ever passed in. */
export function CollectionCard({ c }: {
  c: { slug: string; title: string; description: string | null; coverImageUrl: string | null; coverFocusX: number; coverFocusY: number; previewImage: string | null; itemCount: number; isFeatured: boolean };
}) {
  const img = c.coverImageUrl || c.previewImage;
  return (
    <Link href={`/explore/${c.slug}/`} className="card card-hover group flex h-full flex-col overflow-hidden" data-testid="collection-card">
      <div className="relative aspect-[16/9] overflow-hidden bg-navy-900">
        {img ? (
          <SmartImage src={img} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" style={c.coverImageUrl ? { objectPosition: coverPosition(c.coverFocusX, c.coverFocusY) } : undefined} />
        ) : (
          <div aria-hidden className="flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_top_right,rgba(255,133,8,0.45),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,125,20,0.45),transparent_60%),linear-gradient(135deg,#061527,#0b2340_55%,#13305a)]">
            <Compass className="h-10 w-10 text-white/50" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-semibold leading-snug text-navy-900 group-hover:text-brand-700">{c.title}</h3>
        {c.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.description}</p>}
        <p className="mt-auto pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{c.itemCount} {c.itemCount === 1 ? "pick" : "picks"}</p>
      </div>
    </Link>
  );
}

/** A staff-entered place (park, trail, historic site). Only verified details are shown — nothing is filled in automatically. */
export function PlaceCard({ p }: { p: PlaceData }) {
  const town = communityHref(p.city);
  return (
    <article className="card flex h-full flex-col overflow-hidden" data-testid="place-card">
      {p.imageUrl && (
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          <SmartImage src={p.imageUrl} alt="" fill sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw" className="object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <p className="eyebrow text-hillside-700">Place</p>
        <h3 className="font-semibold text-navy-900">{p.title}</h3>
        {p.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{p.description}</p>}
        {(p.address || p.city) && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <span>
              {p.address && <span className="block">{p.address}</span>}
              {p.city && (town ? <Link href={town} className="font-medium text-brand-700 hover:underline">{p.city}</Link> : <span>{p.city}</span>)}
            </span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <a href={p.directionsUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm min-h-11">
            <Navigation className="h-4 w-4" aria-hidden /> Directions<span className="sr-only"> to {p.title} (opens Google Maps)</span>
          </a>
          {p.websiteUrl && (
            <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm min-h-11">
              <ExternalLink className="h-4 w-4" aria-hidden /> Website<span className="sr-only"> for {p.title} (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

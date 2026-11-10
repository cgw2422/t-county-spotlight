import Link from "next/link";
import { CalendarDays, Clock, MapPin, Navigation, Tag } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { SaveButton } from "@/components/public/save-button";
import { cn, truncate } from "@/lib/utils";
import { categoryLabel, directionsUrl, formatHours, formatSaleDates, saleTypeLabel } from "@/lib/garage-sales-shared";
import type { PublicGarageSale } from "@/lib/garage-sales";

/** Public garage sale card. Takes the public DTO only (no private address for GENERAL sales). */
export function GarageSaleCard({ s, compact = false }: { s: PublicGarageSale; compact?: boolean }) {
  const href = `/garage-sales/${s.slug}/`;
  const photo = s.photos[0];
  const where = [s.locationLine, s.city].filter(Boolean).join(", ");
  return (
    <article className="card group flex h-full flex-col overflow-hidden">
      {!compact && (
        <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-[16/9] overflow-hidden bg-hillside-50">
          {photo ? (
            <SmartImage src={photo} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-hillside-700"><Tag className="h-10 w-10" aria-hidden /></span>
          )}
          <span className="badge absolute left-3 top-3 bg-white/95 text-navy-900 shadow-sm">{saleTypeLabel(s.saleType)}</span>
        </Link>
      )}
      <div className={cn("flex flex-1 flex-col", compact ? "p-4" : "p-4 sm:p-5")}>
        {compact && <p className="eyebrow text-hillside-700">{saleTypeLabel(s.saleType)}</p>}
        <h3 className="font-display text-lg font-semibold leading-snug text-navy-900"><Link href={href} className="hover:text-brand-700">{s.title}</Link></h3>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          <li className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />{formatSaleDates(s.startDate, s.endDate)}</li>
          <li className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />{formatHours(s.dailyStart, s.dailyEnd)} daily</li>
          {where && <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />{where}</li>}
        </ul>
        {!compact && s.description && <p className="mt-3 text-sm text-slate-600">{truncate(s.description, 140)}</p>}
        {s.itemCategories.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Items for sale">
            {s.itemCategories.slice(0, compact ? 3 : 6).map((c) => <li key={c} className="badge-gray">{categoryLabel(c)}</li>)}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Link href={href} className="btn-secondary btn-sm">Details</Link>
          <a href={directionsUrl(s)} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm text-brand-700"><Navigation className="h-4 w-4" aria-hidden /> Directions</a>
          <SaveButton type="GARAGE_SALE" targetId={s.id} compact wrapperClassName="ml-auto" />
        </div>
      </div>
    </article>
  );
}

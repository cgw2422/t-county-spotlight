import Link from "next/link";
import { CalendarDays, MapPin, Sparkles, Store } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { cn, stripHtml, truncate } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import { OPENING_BADGE, OPENING_LABELS, isOpeningKind, openingDatePrefix, openingDateText, openingHref, openingName } from "@/lib/openings-shared";
import type { OpeningCard as OpeningRow } from "@/lib/openings";

function cityOf(o: OpeningRow) {
  return o.city || o.business?.city || null;
}

export function OpeningStatusBadge({ kind, className }: { kind: string; className?: string }) {
  if (!isOpeningKind(kind)) return null;
  return <span className={cn(OPENING_BADGE[kind], className)}>{OPENING_LABELS[kind]}</span>;
}

/** Public New & Coming Soon card. Shows the announced date or the timing note — never an invented date. */
export function OpeningCard({ o, compact = false }: { o: OpeningRow; compact?: boolean }) {
  const href = openingHref(o);
  const name = openingName(o);
  const photo = o.photos[0] || o.imageUrl || o.business?.coverUrl || null;
  const date = openingDateText(o);
  const city = cityOf(o);
  const kind = isOpeningKind(o.kind) ? o.kind : null;
  return (
    <article className="card group flex h-full flex-col overflow-hidden" data-testid="opening-card">
      {!compact && (
        <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-[16/9] overflow-hidden bg-brand-50">
          {photo ? (
            <SmartImage src={photo} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-brand-700"><Sparkles className="h-10 w-10" aria-hidden /></span>
          )}
          {kind && <span className={cn(OPENING_BADGE[kind], "absolute left-3 top-3 shadow-sm")}>{OPENING_LABELS[kind]}</span>}
        </Link>
      )}
      <div className={cn("flex flex-1 flex-col", compact ? "p-4" : "p-4 sm:p-5")}>
        {compact && kind && <p><span className={OPENING_BADGE[kind]}>{OPENING_LABELS[kind]}</span></p>}
        <h3 className={cn("font-display text-lg font-semibold leading-snug text-navy-900", compact && "mt-2")}>
          <Link href={href} className="hover:text-brand-700">{name}</Link>
        </h3>
        {o.title && o.title !== name && <p className="mt-0.5 text-sm font-medium text-slate-700">{o.title}</p>}
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {date && kind && <li className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />{o.effectiveDate ? `${openingDatePrefix(kind, o.effectiveDate)} ${date}` : date}</li>}
          {city && <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />{city}</li>}
        </ul>
        {!compact && o.body && <p className="mt-3 text-sm text-slate-600">{truncate(stripHtml(o.body), 140)}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <Link href={href} className="btn-secondary btn-sm">Details</Link>
          {o.business && <Link href={businessHref(o.business)} className="btn-ghost btn-sm text-brand-700"><Store className="h-4 w-4" aria-hidden /> Listing</Link>}
        </div>
      </div>
    </article>
  );
}

import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock, ExternalLink, Globe, MapPin, Navigation, Truck, UtensilsCrossed } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { TrackedLink } from "@/components/public/track";
import { SaveButton } from "@/components/public/save-button";
import { businessHref } from "@/lib/links";
import { formatDate } from "@/lib/utils";
import { directionsHref, facebookUrl, safeHttpUrl, shortTime, stopLabel, type PublicStop } from "@/lib/food-trucks";

export type StopCardExtras = { menu?: { href: string; external: boolean }; updatedAt?: Date };

export function TruckLogo({ truck, size = "md" }: { truck: { name: string; logoUrl: string | null; coverUrl: string | null }; size?: "sm" | "md" }) {
  const src = truck.logoUrl || truck.coverUrl;
  const cls = size === "sm" ? "h-12 w-12" : "h-16 w-16";
  return (
    <div className={`relative ${cls} shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200`}>
      {src ? (
        <SmartImage src={src} alt="" fill sizes="64px" className={truck.logoUrl ? "object-contain p-0.5" : "object-cover"} />
      ) : (
        <span aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 to-brand-700 text-white"><Truck className="h-6 w-6" /></span>
      )}
    </div>
  );
}

/** Scheduled vs. confirmed: a schedule alone never means "open". */
export function StopBadge({ stop, now = new Date() }: { stop: { startAt: Date; endAt: Date; confirmedAt: Date | null }; now?: Date }) {
  if (stop.confirmedAt) {
    return (
      <span className="badge-green" data-testid="stop-confirmed">
        <CheckCircle2 className="h-3 w-3" aria-hidden /> Confirmed by the truck · {shortTime(stop.confirmedAt)}
      </span>
    );
  }
  return <span className="badge-blue" data-testid="stop-scheduled"><CalendarClock className="h-3 w-3" aria-hidden /> {stop.startAt <= now && stop.endAt > now ? "Scheduled now" : "Scheduled"}</span>;
}

export function FoodTruckStopCard({ stop, extras, compact = false, now = new Date() }: { stop: PublicStop; extras?: StopCardExtras; compact?: boolean; now?: Date }) {
  const t = stop.business;
  const profile = businessHref(t);
  const website = safeHttpUrl(t.website ? (/^https?:\/\//i.test(t.website) ? t.website : `https://${t.website}`) : null);
  const fb = facebookUrl(t.socials);
  const place = [stop.address, stop.city].filter(Boolean).join(", ");
  const track = { type: "click_food_truck_directions", businessId: t.id, targetType: "BUSINESS", targetId: t.id };
  return (
    <article className="card flex h-full flex-col p-4" data-testid="truck-stop" data-stop-id={stop.id}>
      <div className="flex items-start gap-3">
        <TruckLogo truck={t} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug text-navy-900"><Link href={profile} className="hover:text-brand-700 hover:underline">{t.name}</Link></h3>
          {t.cuisine && <p className="flex items-center gap-1 text-sm text-slate-600"><UtensilsCrossed className="h-3.5 w-3.5" aria-hidden /> {t.cuisine}</p>}
          <div className="mt-1.5"><StopBadge stop={stop} now={now} /></div>
        </div>
        <SaveButton type="BUSINESS" targetId={t.id} compact label="Save food truck" savedLabel="Saved food truck" />
      </div>
      <div className="mt-3 space-y-1 text-sm text-slate-700">
        <p className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span><span className="font-semibold text-navy-900">{stopLabel(stop, now)}</span>{compact && <span className="text-slate-500"> · {formatDate(stop.startAt, { weekday: "short", month: "short", day: "numeric" })}</span>}</span>
        </p>
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span><span className="font-medium text-navy-900">{stop.locationName}</span>{place && <span className="block text-slate-600">{place}</span>}</span>
        </p>
        {!compact && stop.notes && <p className="pl-6 text-slate-600">{stop.notes}</p>}
      </div>
      <div className="mt-auto pt-3">
        <div className="flex flex-wrap gap-2">
          <TrackedLink href={directionsHref(stop)} target="_blank" rel="noopener noreferrer" track={track} className="btn-secondary btn-sm"><Navigation className="h-4 w-4" aria-hidden /> Directions</TrackedLink>
          {!compact && extras?.menu && (
            extras.menu.external
              ? <a href={extras.menu.href} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><UtensilsCrossed className="h-4 w-4" aria-hidden /> Menu <ExternalLink className="h-3 w-3" aria-hidden /></a>
              : <Link href={extras.menu.href} className="btn-ghost btn-sm"><UtensilsCrossed className="h-4 w-4" aria-hidden /> Menu</Link>
          )}
          {!compact && (website ?? fb) && (
            <a href={website ?? fb ?? undefined} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm"><Globe className="h-4 w-4" aria-hidden /> {website ? "Website" : "Facebook"}</a>
          )}
        </div>
        {!compact && extras?.updatedAt && <p className="mt-2 text-xs text-slate-500">Schedule updated {formatDate(extras.updatedAt, { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>
    </article>
  );
}

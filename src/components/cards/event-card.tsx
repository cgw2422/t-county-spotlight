import Link from "next/link";
import { MapPin, Repeat } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { eventHref } from "@/lib/links";
import { formatDate, formatTime } from "@/lib/utils";

export type EventCardData = {
  id: string; slug: string; title: string; imageUrl?: string | null; locationName?: string | null; city?: string | null;
  occurrenceStart: Date; occurrenceEnd?: Date | null; allDay?: boolean; isSponsored?: boolean; recurrence?: unknown; isFree?: boolean;
};

export function DateBadge({ date }: { date: Date }) {
  return (
    <div className="flex w-14 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-center shadow-sm">
      <span className="bg-red-600 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{formatDate(date, { month: "short" })}</span>
      <span className="py-1 text-xl font-bold leading-none text-navy-900">{formatDate(date, { day: "numeric" })}</span>
    </div>
  );
}

export function EventCard({ e, layout = "card" }: { e: EventCardData; layout?: "card" | "row" }) {
  const time = e.allDay ? "All day" : `${formatTime(e.occurrenceStart)}${e.occurrenceEnd ? ` – ${formatTime(e.occurrenceEnd)}` : ""}`;
  const href = eventHref(e);
  if (layout === "row") {
    return (
      <Link href={href} className="card card-hover group flex items-center gap-4 p-3">
        <DateBadge date={e.occurrenceStart} />
        <div className="relative hidden h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:block">
          {e.imageUrl ? <SmartImage src={e.imageUrl} alt="" fill sizes="96px" className="object-cover" /> : <ImagePlaceholder />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-navy-900 group-hover:text-brand-700">{e.title}</h3>
          <p className="text-sm text-slate-600">{formatDate(e.occurrenceStart, { weekday: "short", month: "short", day: "numeric" })} · {time}</p>
          {(e.locationName || e.city) && <p className="truncate text-sm text-slate-500">{[e.locationName, e.city].filter(Boolean).join(", ")}</p>}
        </div>
        {e.isSponsored && <span className="badge-sponsored">Sponsored</span>}
      </Link>
    );
  }
  return (
    <Link href={href} className="card card-hover group flex flex-col overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {e.imageUrl ? <SmartImage src={e.imageUrl} alt="" fill sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw" className="object-cover transition duration-500 group-hover:scale-105" /> : <ImagePlaceholder label={e.title} />}
        {e.isSponsored && <span className="badge-sponsored absolute right-3 top-3">Sponsored</span>}
      </div>
      <div className="flex gap-3 p-4">
        <DateBadge date={e.occurrenceStart} />
        <div className="min-w-0">
          <h3 className="line-clamp-2 font-semibold text-navy-900 group-hover:text-brand-700">{e.title}</h3>
          <p className="mt-0.5 text-sm text-slate-600">{formatDate(e.occurrenceStart, { weekday: "short", month: "short", day: "numeric" })} · {time}</p>
          {(e.locationName || e.city) && <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-slate-500"><MapPin className="h-3.5 w-3.5 shrink-0" />{[e.locationName, e.city].filter(Boolean).join(", ")}</p>}
          {!!e.recurrence && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Repeat className="h-3 w-3" /> Recurring</p>}
        </div>
      </div>
    </Link>
  );
}

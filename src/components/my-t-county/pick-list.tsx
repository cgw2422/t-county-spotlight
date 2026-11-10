import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import type { Pick } from "@/lib/my-t-county";

const fmt = (iso: string, allDay: boolean) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }) }).format(new Date(iso));

/** Compact "Picked for you" rows (server or client rendered). */
export function PickList({ picks }: { picks: Pick[] }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="picks">
      {picks.map((p) => (
        <li key={p.id}>
          <Link href={p.href} className="card card-hover flex h-full flex-col gap-1 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-hillside-700">{p.reason}</span>
            <span className="line-clamp-2 font-semibold text-navy-900">{p.title}</span>
            <span className="flex items-center gap-1.5 text-sm text-slate-600"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden /> {fmt(p.start, p.allDay)}{p.allDay ? " · All day" : ""}</span>
            {(p.locationName || p.city) && <span className="flex min-w-0 items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{[p.locationName, p.city].filter(Boolean).join(", ")}</span></span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

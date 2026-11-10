import Link from "next/link";
import { CalendarDays, ChevronRight, PartyPopper, ThumbsUp, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/events/?when=today", label: "Happening today", icon: CalendarDays },
  { href: "/events/?when=weekend", label: "This weekend", icon: PartyPopper },
  { href: "/food-trucks/", label: "Food trucks", icon: Truck },
  { href: "/businesses/?sort=recommended", label: "Most recommended businesses", icon: ThumbsUp },
] as const;

/** Empty-state suggestions: always real pages, never a blank placeholder. */
export function DiscoverySuggestions({ intro, className }: { intro?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-slate-50 p-4", className)} data-testid="discovery-suggestions">
      {intro && <p className="text-sm text-slate-700">{intro}</p>}
      <ul className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", !!intro && "mt-3")}>
        {LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-navy-900 ring-1 ring-slate-200 hover:ring-brand-300">
              <Icon className="h-4 w-4 shrink-0 text-hillside-600" aria-hidden />
              <span className="min-w-0 flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

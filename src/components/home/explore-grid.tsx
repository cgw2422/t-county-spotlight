import Link from "next/link";
import { BadgePercent, CalendarHeart, Church, Compass, HeartHandshake, MessagesSquare, Store, Sun, Tag, Truck } from "lucide-react";

/** Homepage quick access: everyday resident features (also used as "Browse" on /search/). */
export const EXPLORE_ITEMS: { label: string; href: string; icon: typeof Sun; color: string; needs?: "foodTrucks" | "garageSales" }[] = [
  { label: "Today", href: "/events/?when=today", icon: Sun, color: "bg-orange-50 text-sunset-600" },
  { label: "This Weekend", href: "/events/?when=weekend", icon: CalendarHeart, color: "bg-hillside-50 text-hillside-700" },
  { label: "Food Trucks", href: "/food-trucks/", icon: Truck, color: "bg-brand-50 text-navy-900", needs: "foodTrucks" },
  { label: "Garage Sales", href: "/garage-sales/", icon: Tag, color: "bg-orange-50 text-sunset-600", needs: "garageSales" },
  { label: "Local Specials", href: "/specials/", icon: BadgePercent, color: "bg-hillside-50 text-hillside-700" },
  { label: "Things to Do", href: "/things-to-do/", icon: Compass, color: "bg-brand-50 text-navy-900" },
  { label: "T County Gives", href: "/gives/", icon: HeartHandshake, color: "bg-orange-50 text-sunset-600" },
  { label: "Community Pulse", href: "/community-pulse/", icon: MessagesSquare, color: "bg-hillside-50 text-hillside-700" },
  { label: "Local Businesses", href: "/businesses/", icon: Store, color: "bg-brand-50 text-navy-900" },
  { label: "Churches", href: "/churches/", icon: Church, color: "bg-orange-50 text-sunset-600" },
];

/** Column classes per tile count (literal strings for Tailwind): 10 → 5×2 / 10, 9 → 5+4 / 9, 8 → 4×2 / 8. */
const GRID_COLS: Record<number, string> = { 10: "grid-cols-5 lg:grid-cols-10", 9: "grid-cols-5 lg:grid-cols-9", 8: "grid-cols-4 lg:grid-cols-8" };

/**
 * `availability` (homepage): the Food Trucks / Garage Sales tiles only show when something is scheduled
 * in the next 7 days (getHomeAvailability). Omitted (e.g. /explore/) = every tile, year-round.
 */
export function ExploreGrid({ title, availability }: { title?: string; availability?: { foodTrucks: boolean; garageSales: boolean } }) {
  const items = EXPLORE_ITEMS.filter((i) => !i.needs || !availability || availability[i.needs]);
  return (
    <section aria-labelledby="explore-title" className="bg-[var(--season-tint)]">
      {/* --season-tint is transparent unless a seasonal theme is active */}
      <div className="container-page py-8 sm:py-10">
      <h2 id="explore-title" className="sr-only">{title || "Explore T County"}</h2>
      <ul className={`grid gap-x-1 gap-y-3 sm:gap-4 ${GRID_COLS[items.length] ?? GRID_COLS[10]}`} data-testid="explore-grid">
        {items.map(({ label, href, icon: Icon, color }) => (
          <li key={label}>
            <Link href={href} className="group flex flex-col items-center gap-1.5 rounded-xl px-0.5 py-1.5 text-center sm:gap-2 sm:p-3 hover:bg-slate-50">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5 transition group-hover:-translate-y-0.5 sm:h-16 sm:w-16 ${color}`}>
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden />
              </span>
              <span className="text-[11px] font-medium leading-tight text-slate-700 sm:text-sm">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </section>
  );
}

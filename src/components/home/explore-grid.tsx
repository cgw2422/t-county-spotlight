import Link from "next/link";
import { BadgePercent, CalendarHeart, Church, Compass, HeartHandshake, MessagesSquare, Store, Sun, Tag, Truck } from "lucide-react";

/** Homepage quick access: everyday resident features (also used as "Browse" on /search/). */
export const EXPLORE_ITEMS = [
  { label: "Today", href: "/events/?when=today", icon: Sun, color: "bg-orange-50 text-sunset-600" },
  { label: "This Weekend", href: "/events/?when=weekend", icon: CalendarHeart, color: "bg-hillside-50 text-hillside-700" },
  { label: "Food Trucks", href: "/food-trucks/", icon: Truck, color: "bg-brand-50 text-navy-900" },
  { label: "Garage Sales", href: "/garage-sales/", icon: Tag, color: "bg-orange-50 text-sunset-600" },
  { label: "Local Specials", href: "/specials/", icon: BadgePercent, color: "bg-hillside-50 text-hillside-700" },
  { label: "Things to Do", href: "/things-to-do/", icon: Compass, color: "bg-brand-50 text-navy-900" },
  { label: "T County Gives", href: "/gives/", icon: HeartHandshake, color: "bg-orange-50 text-sunset-600" },
  { label: "Community Pulse", href: "/community-pulse/", icon: MessagesSquare, color: "bg-hillside-50 text-hillside-700" },
  { label: "Local Businesses", href: "/businesses/", icon: Store, color: "bg-brand-50 text-navy-900" },
  { label: "Churches", href: "/churches/", icon: Church, color: "bg-orange-50 text-sunset-600" },
];

export function ExploreGrid({ title }: { title?: string }) {
  return (
    <section aria-labelledby="explore-title" className="bg-[var(--season-tint)]">
      {/* --season-tint is transparent unless a seasonal theme is active */}
      <div className="container-page py-8 sm:py-10">
      <h2 id="explore-title" className="sr-only">{title || "Explore T County"}</h2>
      <ul className="grid grid-cols-5 gap-x-1 gap-y-3 sm:gap-4 lg:grid-cols-10">
        {EXPLORE_ITEMS.map(({ label, href, icon: Icon, color }) => (
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

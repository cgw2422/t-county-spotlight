import Link from "next/link";
import { Briefcase, CalendarDays, Church, HeartHandshake, Megaphone, Music, Star, Store, Tag, UtensilsCrossed } from "lucide-react";

export const EXPLORE_ITEMS = [
  { label: "Local Businesses", href: "/businesses/", icon: Store, color: "bg-brand-50 text-navy-900" },
  { label: "Community Events", href: "/events/", icon: CalendarDays, color: "bg-hillside-50 text-hillside-700" },
  { label: "Food & Dining", href: "/businesses/?category=food-dining", icon: UtensilsCrossed, color: "bg-orange-50 text-sunset-600" },
  { label: "Local Specials", href: "/specials/", icon: Tag, color: "bg-brand-50 text-navy-900" },
  { label: "Things to Do", href: "/things-to-do/", icon: Music, color: "bg-hillside-50 text-hillside-700" },
  { label: "Jobs", href: "/jobs/", icon: Briefcase, color: "bg-orange-50 text-sunset-600" },
  { label: "Business Spotlights", href: "/spotlights/", icon: Star, color: "bg-brand-50 text-navy-900" },
  { label: "Community News", href: "/announcements/", icon: Megaphone, color: "bg-hillside-50 text-hillside-700" },
  { label: "T County Gives", href: "/gives/", icon: HeartHandshake, color: "bg-orange-50 text-sunset-600" },
  { label: "Churches", href: "/churches/", icon: Church, color: "bg-brand-50 text-navy-900" },
];

export function ExploreGrid({ title }: { title?: string }) {
  return (
    <section aria-labelledby="explore-title" className="container-page py-10">
      <h2 id="explore-title" className="sr-only">{title || "Explore T County"}</h2>
      <ul className="grid grid-cols-4 gap-x-2 gap-y-3 sm:grid-cols-5 sm:gap-4 lg:grid-cols-10">
        {EXPLORE_ITEMS.map(({ label, href, icon: Icon, color }) => (
          <li key={label}>
            <Link href={href} className="group flex flex-col items-center gap-2 rounded-xl p-2 text-center sm:p-3 hover:bg-slate-50">
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-black/5 transition group-hover:-translate-y-0.5 sm:h-16 sm:w-16 ${color}`}>
                <Icon className="h-7 w-7" aria-hidden />
              </span>
              <span className="text-xs font-medium leading-tight text-slate-700 sm:text-sm">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

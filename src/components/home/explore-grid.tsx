import Link from "next/link";
import { Briefcase, CalendarDays, Megaphone, Music, Star, Store, Tag, UtensilsCrossed } from "lucide-react";

export const EXPLORE_ITEMS = [
  { label: "Local Businesses", href: "/businesses/", icon: Store, color: "bg-blue-50 text-blue-600" },
  { label: "Community Events", href: "/events/", icon: CalendarDays, color: "bg-red-50 text-red-600" },
  { label: "Food & Dining", href: "/businesses/?category=food-dining", icon: UtensilsCrossed, color: "bg-emerald-50 text-emerald-600" },
  { label: "Local Specials", href: "/specials/", icon: Tag, color: "bg-orange-50 text-orange-600" },
  { label: "Things to Do", href: "/things-to-do/", icon: Music, color: "bg-violet-50 text-violet-600" },
  { label: "Jobs", href: "/jobs/", icon: Briefcase, color: "bg-sky-50 text-sky-700" },
  { label: "Business Spotlights", href: "/spotlights/", icon: Star, color: "bg-amber-50 text-amber-600" },
  { label: "Community News", href: "/announcements/", icon: Megaphone, color: "bg-pink-50 text-pink-600" },
];

export function ExploreGrid({ title }: { title?: string }) {
  return (
    <section aria-labelledby="explore-title" className="container-page py-10">
      <h2 id="explore-title" className="sr-only">{title || "Explore T-County"}</h2>
      <ul className="grid grid-cols-4 gap-3 sm:gap-4 lg:grid-cols-8">
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

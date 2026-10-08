"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Compass, Home, Tag, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore/", label: "Explore", icon: Compass },
  { href: "/events/", label: "Events", icon: CalendarDays },
  { href: "/specials/", label: "Specials", icon: Tag },
  { href: "/account/", label: "Profile", icon: UserRound },
];

/** App-style bottom navigation for phones (hidden on large screens). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href.replace(/\/$/, ""));
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-brand-600" : "text-slate-500")}>
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

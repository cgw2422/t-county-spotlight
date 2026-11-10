"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, CalendarDays, Compass, Home, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore/", label: "Explore", icon: Compass },
  { href: "/events/", label: "Events", icon: CalendarDays },
  { href: "/saved/", label: "Saved", icon: Bookmark },
  { href: "/my-t-county/", label: "My T County", icon: MapPin },
];

/** Exact match for Home, otherwise the tab's section (e.g. /events/… for Events). */
function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  const base = href.replace(/\/$/, "");
  return path === base || path.startsWith(`${base}/`);
}

/** App-style bottom navigation for phones (hidden on large screens). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-tight", active ? "text-brand-600" : "text-slate-500")}>
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

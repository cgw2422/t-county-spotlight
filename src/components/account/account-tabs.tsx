"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bookmark, Heart, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/account/", label: "Saved", icon: Bookmark },
  { href: "/account/following/", label: "Following", icon: Heart },
  { href: "/account/notifications/", label: "Alerts", icon: Bell },
  { href: "/account/profile/", label: "Profile", icon: UserRound },
];

export function AccountTabs() {
  const path = usePathname();
  const norm = path.endsWith("/") ? path : path + "/";
  return (
    <nav aria-label="Account" className="sticky top-[calc(4rem+var(--safe-top))] z-30 -mx-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-2 lg:top-[calc(72px+var(--safe-top))]">
      <ul className="grid grid-cols-4">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = norm === href;
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined}
                className={cn("flex min-h-12 flex-col items-center justify-center gap-0.5 border-b-2 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm",
                  active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-navy-900")}>
                <Icon className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

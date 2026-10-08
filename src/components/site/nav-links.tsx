"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-data";

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <ul className="flex items-center gap-1">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <li key={i.href + i.label}>
            <Link
              href={i.href}
              target={i.newTab ? "_blank" : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "text-brand-700" : "text-slate-700 hover:text-navy-900",
                active && "after:absolute after:inset-x-3 after:-bottom-[15px] after:h-0.5 after:rounded after:bg-brand-600",
              )}
            >
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

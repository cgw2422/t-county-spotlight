"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin/newsletter/", label: "Overview", exact: true },
  { href: "/admin/newsletter/subscribers/", label: "Subscribers" },
  { href: "/admin/newsletter/campaigns/", label: "Campaigns" },
  { href: "/admin/newsletter/suppressions/", label: "Suppression list" },
  { href: "/admin/newsletter/settings/", label: "Settings" },
];

export function NewsletterNav() {
  const path = usePathname();
  const norm = path.endsWith("/") ? path : `${path}/`;
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      <nav className="flex min-w-max gap-1 border-b border-slate-200" aria-label="Newsletter">
        {ITEMS.map((t) => {
          const active = t.exact ? norm === t.href : norm.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
              className={cn("-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold transition-colors",
                active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800")}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

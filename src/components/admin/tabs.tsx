import Link from "next/link";
import { cn } from "@/lib/utils";

export type TabItem = { label: string; href: string; active: boolean; count?: number };

/** URL-driven tabs (server-rendered); scrolls horizontally on small screens. */
export function LinkTabs({ items, className }: { items: TabItem[]; className?: string }) {
  return (
    <div className={cn("-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0", className)}>
      <nav className="flex min-w-max gap-1 border-b border-slate-200" aria-label="Tabs">
        {items.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
              t.active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] leading-none", t.active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-600")}>{t.count}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

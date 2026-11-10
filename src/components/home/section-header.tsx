import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function SectionHeader({ title, subtitle, href, linkLabel = "View all" }: { title: string; subtitle?: string | null; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {/* thin seasonal highlight above the title — only rendered visibly while a seasonal theme is active */}
        <span aria-hidden className="season-only"><span className="mb-2 block h-1 w-10 rounded-full bg-[var(--season-border)]" /></span>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="-my-2 flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">
          {linkLabel} <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

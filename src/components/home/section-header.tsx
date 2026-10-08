import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function SectionHeader({ title, subtitle, href, linkLabel = "View all" }: { title: string; subtitle?: string | null; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-600">
          {linkLabel} <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

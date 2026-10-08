import type { Crumb } from "./breadcrumbs";
import { Breadcrumbs } from "./breadcrumbs";

/** Title band used at the top of listing pages. */
export function PageHeader({ title, subtitle, eyebrow, crumbs, children }: {
  title: string; subtitle?: string | null; eyebrow?: string; crumbs?: Crumb[]; children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 bg-gradient-to-b from-cream to-white">
      <div className="container-page py-8 sm:py-10">
        {crumbs && <Breadcrumbs items={crumbs} className="mb-4" />}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-navy-900 sm:text-4xl">{title}</h1>
            {subtitle && <p className="mt-2 max-w-2xl text-slate-600 sm:text-lg">{subtitle}</p>}
          </div>
          {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Shown as the card title on mobile. */
  primary?: boolean;
  /** Hidden in the mobile card layout. */
  hideOnMobile?: boolean;
  align?: "right";
};

/**
 * Responsive table: a regular table on md+ screens, stacked cards on phones.
 */
export function DataTable<T>({ rows, columns, rowKey, empty, actions }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty?: React.ReactNode;
  actions?: (row: T) => React.ReactNode;
}) {
  if (!rows.length) return <div className="p-4 sm:p-6">{empty ?? <p className="text-sm text-slate-500">Nothing here yet.</p>}</div>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="table-base">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={cn(c.className, c.align === "right" && "text-right")}>{c.header}</th>
              ))}
              {actions && <th className="text-right"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-slate-50/70">
                {columns.map((c, i) => (
                  <td key={i} className={cn(c.className, c.align === "right" && "text-right")}>{c.cell(r)}</td>
                ))}
                {actions && <td className="text-right"><div className="flex flex-wrap justify-end gap-1.5">{actions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)} className="px-4 py-3.5">
            <div className="min-w-0">{primary.cell(r)}</div>
            {rest.length > 0 && (
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {rest.map((c, i) => (
                  <div key={i} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.header}</dt>
                    <dd className="min-w-0 break-words text-slate-700">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Pagination({ total, page, perPage, basePath, params }: {
  total: number; page: number; perPage: number; basePath: string; params: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined || v === "") continue;
      sp.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (p > 1) sp.set("page", String(p));
    const q = sp.toString();
    return q ? `${basePath}?${q}` : basePath;
  };
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(total, page * perPage);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:px-5">
      <span>{total ? `${from}–${to} of ${total}` : "0 results"}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          {page > 1 ? <Link href={href(page - 1)} className="btn-secondary btn-sm" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Link> : <span className="btn-secondary btn-sm opacity-40" aria-hidden><ChevronLeft className="h-4 w-4" /></span>}
          <span className="px-2 tabular-nums">{page} / {pages}</span>
          {page < pages ? <Link href={href(page + 1)} className="btn-secondary btn-sm" aria-label="Next page"><ChevronRight className="h-4 w-4" /></Link> : <span className="btn-secondary btn-sm opacity-40" aria-hidden><ChevronRight className="h-4 w-4" /></span>}
        </div>
      )}
    </div>
  );
}

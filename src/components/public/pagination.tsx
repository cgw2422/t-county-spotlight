import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Server-rendered pagination. `hrefFor(page)` builds each link. */
export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (p: number) => string }) {
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className="btn-ghost px-3" aria-label="Previous page"><ChevronLeft className="h-5 w-5" /><span className="hidden sm:inline">Previous</span></Link>
      ) : (
        <span className="btn-ghost px-3 opacity-40" aria-hidden><ChevronLeft className="h-5 w-5" /><span className="hidden sm:inline">Previous</span></span>
      )}
      <ul className="flex items-center gap-1">
        {pages.map((p, i) => (
          <li key={i}>
            {p === "…" ? (
              <span className="px-2 text-slate-400">…</span>
            ) : (
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn("flex h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm font-semibold", p === page ? "bg-navy-800 text-white" : "text-slate-700 hover:bg-slate-100")}
              >
                {p}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className="btn-ghost px-3" aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="h-5 w-5" /></Link>
      ) : (
        <span className="btn-ghost px-3 opacity-40" aria-hidden><span className="hidden sm:inline">Next</span><ChevronRight className="h-5 w-5" /></span>
      )}
    </nav>
  );
}

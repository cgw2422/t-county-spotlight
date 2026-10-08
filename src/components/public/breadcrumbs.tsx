import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { absoluteUrl } from "@/lib/utils";
import { JsonLd } from "./json-ld";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, className = "", invert = false }: { items: Crumb[]; className?: string; invert?: boolean }) {
  const all: Crumb[] = [{ label: "Home", href: "/" }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb" className={className}>
        <ol className={`flex flex-wrap items-center gap-1 text-sm ${invert ? "text-white/80" : "text-slate-500"}`}>
          {all.map((c, i) => {
            const last = i === all.length - 1;
            return (
              <li key={i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
                {c.href && !last ? (
                  <Link href={c.href} className={`hover:underline ${invert ? "hover:text-white" : "hover:text-navy-900"}`}>{c.label}</Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={`line-clamp-1 ${invert ? "text-white" : "text-slate-700"}`}>{c.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.label,
            ...(c.href ? { item: absoluteUrl(c.href) } : {}),
          })),
        }}
      />
    </>
  );
}

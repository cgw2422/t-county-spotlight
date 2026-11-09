import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { mentionsLabel, orderResults, pulseHref, type PulseCardData } from "@/lib/pulse";
import { cn, formatDate } from "@/lib/utils";

/** Teaser line: the top result as ordered by the admin (never "the best"). */
export function topResultTeaser(p: PulseCardData) {
  const top = orderResults(p.results, p.sortMode)[0];
  if (!top) return null;
  if (p.displayMode === "EDITORIAL_LIST") return { label: "Includes", name: top.name, count: null };
  return { label: "Most mentioned", name: top.name, count: top.mentions };
}

export function PulseCard({ p, variant = "default" }: { p: PulseCardData; variant?: "default" | "feature" }) {
  const teaser = topResultTeaser(p);
  const feature = variant === "feature";
  return (
    <article className={cn("card card-hover group relative flex h-full overflow-hidden", feature ? "flex-col lg:flex-row" : "flex-col")}>
      <div className={cn("relative shrink-0 overflow-hidden bg-gradient-to-br from-navy-900 to-hillside-700", feature ? "aspect-[16/9] lg:aspect-auto lg:w-1/2" : "aspect-[16/9]")}>
        {p.featuredImageUrl ? (
          <SmartImage src={p.featuredImageUrl} alt={p.featuredImageAlt ?? ""} fill sizes={feature ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} className="object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center"><MessagesSquare className="h-12 w-12 text-white/40" aria-hidden /></div>
        )}
        {p.status === "ARCHIVED" && <span className="absolute left-3 top-3 badge-gray">Archived</span>}
      </div>
      <div className={cn("flex flex-1 flex-col", feature ? "p-5 sm:p-8" : "p-4 sm:p-5")}>
        <p className="eyebrow">{p.category?.name ?? "Community Pulse"}{p.publishedAt && <span className="font-normal normal-case tracking-normal text-slate-500"> · {formatDate(p.publishedAt, { month: "short", day: "numeric", year: "numeric" })}</span>}</p>
        <h3 className={cn("mt-1.5 font-display font-bold leading-snug text-navy-900", feature ? "text-2xl sm:text-3xl" : "text-lg")}>
          <Link href={pulseHref(p)} className="after:absolute after:inset-0 focus:outline-none">{p.title}</Link>
        </h3>
        {p.description && <p className={cn("mt-2 text-slate-600", feature ? "line-clamp-3" : "line-clamp-2 text-sm")}>{p.description}</p>}
        {teaser && (
          <p className="mt-auto pt-4 text-sm">
            <span className="mr-1.5 inline-block rounded-full bg-hillside-50 px-2 py-0.5 text-xs font-semibold text-hillside-700 ring-1 ring-hillside-200">{teaser.label}</span>
            <span className="font-semibold text-navy-900">{teaser.name}</span>
            {teaser.count != null && <span className="text-slate-500"> · {mentionsLabel(teaser.count)}</span>}
          </p>
        )}
      </div>
    </article>
  );
}

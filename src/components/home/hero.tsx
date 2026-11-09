import Link from "next/link";
import { Search } from "lucide-react";
import { HeroBackground, type HeroAppearance } from "./hero-background";
import { cn } from "@/lib/utils";

/**
 * Homepage hero. Left: headline, description, search, quick links.
 * Right (desktop) / below quick links (mobile): optional `aside`, e.g. the
 * featured Community Pulse card. Without an aside the original single-column
 * layout is used. The background (admin-managed image or default gradient) is
 * rendered by <HeroBackground>.
 */
export function Hero({ headline, sub, appearance, aside }: { headline: string; sub: string; appearance?: HeroAppearance | null; aside?: React.ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden bg-navy-900">
      <HeroBackground appearance={appearance} />
      <div className={cn("container-page py-14 sm:py-20 lg:py-28", !!aside && "grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-12")}>
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl text-balance">{headline.replace(/\bT County\b/g, "T County")}</h1>
          <p className="mt-4 max-w-xl text-base text-white/90 sm:text-lg">{sub}</p>
          <form action="/search/" role="search" className="mt-8 flex max-w-xl items-center gap-2 rounded-xl bg-white p-1.5 shadow-xl">
            <label htmlFor="hero-q" className="sr-only">Search T County</label>
            <Search className="ml-2.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <input id="hero-q" name="q" type="search" placeholder="Search businesses, events, churches and more…" className="min-h-11 w-full min-w-0 bg-transparent px-1 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none" />
            <button className="btn-accent shrink-0">Search</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {[["This weekend", "/events/?when=weekend"], ["Food & Dining", "/businesses/?category=food-dining"], ["Local specials", "/specials/"], ["Churches", "/churches/"], ["Nonprofits", "/gives/"]].map(([l, h]) => (
              <Link key={h} href={h} className="rounded-full bg-white/15 px-3 py-1.5 font-medium text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25">{l}</Link>
            ))}
          </div>
        </div>
        {aside && <div className="min-w-0">{aside}</div>}
      </div>
    </section>
  );
}

import Link from "next/link";
import { Search } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";

export function Hero({ headline, sub, imageUrl }: { headline: string; sub: string; imageUrl?: string | null }) {
  return (
    <section className="relative isolate overflow-hidden bg-navy-900">
      {imageUrl ? (
        <SmartImage src={imageUrl} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(247,162,75,0.55),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(47,123,240,0.45),transparent_60%),linear-gradient(135deg,#0b1a33,#16325c_55%,#1e4277)]" />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/85 via-navy-950/55 to-navy-950/10" />
      <div className="container-page py-16 sm:py-24 lg:py-32">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-6xl">{headline}</h1>
          <p className="mt-4 max-w-xl text-base text-white/90 sm:text-lg">{sub}</p>
          <form action="/search/" role="search" className="mt-8 flex max-w-xl items-center gap-2 rounded-xl bg-white p-1.5 shadow-xl">
            <label htmlFor="hero-q" className="sr-only">Search T-County</label>
            <Search className="ml-2.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            <input id="hero-q" name="q" type="search" placeholder="Search businesses, events, articles and more…" className="min-h-11 w-full min-w-0 bg-transparent px-1 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none" />
            <button className="btn-primary shrink-0">Search</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {[["This weekend", "/events/?when=weekend"], ["Food & Dining", "/businesses/?category=food-dining"], ["Local specials", "/specials/"], ["Spotlights", "/spotlights/"]].map(([l, h]) => (
              <Link key={h} href={h} className="rounded-full bg-white/15 px-3 py-1.5 font-medium text-white ring-1 ring-white/25 backdrop-blur hover:bg-white/25">{l}</Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

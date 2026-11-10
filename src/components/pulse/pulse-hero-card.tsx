import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { TrackedLink } from "@/components/public/track";
import { mentionsLabel, orderResults, pulseHref, type FeaturedPulse } from "@/lib/pulse";
import { cn } from "@/lib/utils";
import { rankBadgeClass, rankBarClass } from "@/components/pulse/rank-colors";

/**
 * Featured Community Pulse card for the homepage hero `aside`. Translucent
 * navy glass so it stays readable over the default gradient and over photos.
 * Render only when a featured, published entry exists.
 */
export function PulseHeroCard({ pulse }: { pulse: FeaturedPulse }) {
  const rows = orderResults(pulse.results, pulse.sortMode).slice(0, Math.min(10, Math.max(1, pulse.homepageLimit)));
  const mode = pulse.displayMode;
  const max = Math.max(1, ...rows.map((r) => r.mentions ?? 0));
  const href = pulseHref(pulse);
  const source = pulse.sourceType === "FACEBOOK" ? "Based on recommendations from our Facebook community" : "Based on community responses";

  return (
    <section aria-labelledby="hero-pulse-title" className="relative overflow-hidden rounded-2xl bg-navy-950/60 p-4 text-white shadow-2xl ring-1 ring-white/20 backdrop-blur-xl sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hillside-500 via-hillside-500 to-sunset-500" />
      <p className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] text-sunset-400">
        <span className="relative flex h-2 w-2" aria-hidden><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sunset-400 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-sunset-500" /></span>
        Community Pulse
      </p>
      <h2 id="hero-pulse-title" className="mt-2 font-display text-lg font-bold leading-snug text-white sm:text-xl line-clamp-3">
        <Link href={href} className="hover:underline hover:decoration-white/50 hover:underline-offset-4">{pulse.title}</Link>
      </h2>
      <p className="mt-1 text-xs text-white/75 sm:text-sm">{source}</p>

      {rows.length > 0 && (
        mode === "BARS" ? (
          <ol className="mt-4 space-y-2.5" aria-label="Top results">
            {rows.map((r, i) => (
              <li key={r.id} className={cn(i >= 3 && "hidden sm:block")}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-semibold">{r.name}</span>
                  <span className="shrink-0 tabular-nums text-white/80">{mentionsLabel(r.mentions ?? 0)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15" aria-hidden>
                  <div className={cn("h-full rounded-full", rankBarClass(i))} style={{ width: `${Math.max(3, Math.round(((r.mentions ?? 0) / max) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <ol className="mt-4 divide-y divide-white/10 rounded-xl bg-white/5 ring-1 ring-white/10" aria-label={mode === "EDITORIAL_LIST" ? "Community recommendations" : "Top results"}>
            {rows.map((r, i) => (
              <li key={r.id} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", i >= 3 && "hidden sm:flex")}>
                {mode === "RANKED_LIST" ? (
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", rankBadgeClass(i))}>{i + 1}<span className="sr-only">.</span></span>
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-hillside-500" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                {mode === "RANKED_LIST" && r.mentions != null && <span className="shrink-0 tabular-nums text-white/80">{mentionsLabel(r.mentions)}</span>}
              </li>
            ))}
          </ol>
        )
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={href} className="btn-accent btn-sm">View all results <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        {pulse.sourceUrl && (
          <TrackedLink href={pulse.sourceUrl} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-white/90 underline decoration-white/40 underline-offset-4 hover:text-white" track={{ type: "click_pulse_source", targetType: "PULSE", targetId: pulse.id }}>
            View the discussion <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </TrackedLink>
        )}
      </div>
    </section>
  );
}

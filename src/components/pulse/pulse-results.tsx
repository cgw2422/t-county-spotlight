import { ExternalLink } from "lucide-react";
import { TrackedLink } from "@/components/public/track";
import { mentionsLabel, resultProfileHref, type PulseResultRow } from "@/lib/pulse";
import { cn } from "@/lib/utils";
import { rankBadgeClass, rankBarClass } from "@/components/pulse/rank-colors";

/** Result name: public directory profile → external website → plain text. */
export function ResultName({ r, pulseId, className }: { r: PulseResultRow; pulseId: string; className?: string }) {
  const profile = resultProfileHref(r);
  if (profile) {
    return (
      <TrackedLink href={profile.href} className={cn("font-semibold text-navy-900 underline decoration-hillside-600/40 underline-offset-4 hover:text-hillside-700 hover:decoration-hillside-600", className)} track={{ type: "click_pulse_business", businessId: profile.businessId ?? null, targetType: "PULSE", targetId: pulseId }}>
        {r.name}
      </TrackedLink>
    );
  }
  if (r.websiteUrl) {
    return (
      <a href={r.websiteUrl} target="_blank" rel="noopener nofollow" className={cn("inline-flex items-center gap-1 font-semibold text-navy-900 underline decoration-slate-300 underline-offset-4 hover:text-hillside-700", className)}>
        {r.name}<ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden /><span className="sr-only"> (opens the business website in a new tab)</span>
      </a>
    );
  }
  return <span className={cn("font-semibold text-navy-900", className)}>{r.name}</span>;
}

function Thumb({ r }: { r: PulseResultRow }) {
  if (!r.imageUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={r.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 sm:h-20 sm:w-20" />;
}

/** Full results list for the public page, rendered per display mode. `rows` must already be ordered. */
export function PulseResults({ rows, displayMode, pulseId }: { rows: PulseResultRow[]; displayMode: string; pulseId: string }) {
  if (!rows.length) return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-slate-600">Results are being compiled. Check back soon.</p>;

  if (displayMode === "EDITORIAL_LIST") {
    return (
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-4 p-4 sm:p-5">
            <Thumb r={r} />
            <div className="min-w-0">
              <ResultName r={r} pulseId={pulseId} className="text-lg" />
              {r.description && <p className="mt-1 text-slate-600">{r.description}</p>}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (displayMode === "BARS") {
    const max = Math.max(1, ...rows.map((r) => r.mentions ?? 0));
    return (
      <ol className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        {rows.map((r, i) => {
          const pct = Math.max(2, Math.round(((r.mentions ?? 0) / max) * 100));
          return (
            <li key={r.id} className="flex gap-4">
              <Thumb r={r} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <ResultName r={r} pulseId={pulseId} className="text-base sm:text-lg" />
                  <span className="text-sm font-semibold tabular-nums text-slate-700">{mentionsLabel(r.mentions ?? 0)}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={cn("h-full rounded-full", rankBarClass(i))} style={{ width: `${pct}%` }} />
                </div>
                {r.description && <p className="mt-2 text-sm text-slate-600">{r.description}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {rows.map((r, i) => (
        <li key={r.id} className="flex gap-3 p-4 sm:gap-4 sm:p-5">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold", rankBadgeClass(i))}>
            {i + 1}<span className="sr-only">.</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <ResultName r={r} pulseId={pulseId} className="text-lg" />
              {r.mentions != null && <span className="text-sm font-semibold tabular-nums text-slate-600">{mentionsLabel(r.mentions)}</span>}
            </div>
            {r.description && <p className="mt-1 text-slate-600">{r.description}</p>}
          </div>
          <Thumb r={r} />
        </li>
      ))}
    </ol>
  );
}

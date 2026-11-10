import type { Season } from "@/lib/seasons";
import { cn } from "@/lib/utils";

/**
 * Tiny decorative seasonal accent (blossom, sun, leaf, snowflake). Inline SVG,
 * aria-hidden, no animation; colored with the `--season-decor` token.
 */
/** `themed` (default) colors it with --season-decor; false inherits the text color. */
export function SeasonIcon({ season, className, themed = true }: { season: Season; className?: string; themed?: boolean }) {
  const common = { "aria-hidden": true, focusable: false, viewBox: "0 0 24 24", className: cn(themed && "season-decor", "inline-block h-4 w-4 shrink-0", className), "data-season-icon": season } as const;
  switch (season) {
    case "spring":
      return (
        <svg {...common} fill="currentColor">
          {[0, 72, 144, 216, 288].map((r) => <ellipse key={r} cx="12" cy="6.5" rx="3.2" ry="4.6" transform={`rotate(${r} 12 12)`} opacity="0.85" />)}
          <circle cx="12" cy="12" r="2.4" fill="#FFFFFF" opacity="0.9" />
        </svg>
      );
    case "summer":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" stroke="none" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => <line key={r} x1="12" y1="2.5" x2="12" y2="5" transform={`rotate(${r} 12 12)`} />)}
        </svg>
      );
    case "fall":
      return (
        <svg {...common} fill="currentColor">
          <path d="M12 2.5c1 2.2 2.4 3.3 4.3 3.4-.6 1.4-.4 2.4.6 3.2 1.4-.6 2.8-.5 4.1.3-1 1.3-1.3 2.6-.9 4-1.6-.2-2.9.3-3.9 1.5l1.3 2.6c-1.9-.4-3.4-.2-4.4.7V21h-1.2v-2.8c-1-.9-2.5-1.1-4.4-.7l1.3-2.6c-1-1.2-2.3-1.7-3.9-1.5.4-1.4.1-2.7-.9-4 1.3-.8 2.7-.9 4.1-.3 1-.8 1.2-1.8.6-3.2 1.9-.1 3.3-1.2 4.3-3.4Z" />
        </svg>
      );
    case "winter":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {[0, 60, 120].map((r) => (
            <g key={r} transform={`rotate(${r} 12 12)`}>
              <line x1="12" y1="2.5" x2="12" y2="21.5" />
              <path d="M9.5 4.5 12 6.8l2.5-2.3M9.5 19.5 12 17.2l2.5 2.3" />
            </g>
          ))}
        </svg>
      );
  }
}

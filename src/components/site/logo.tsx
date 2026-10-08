import Link from "next/link";
import { cn } from "@/lib/utils";

/** Fallback brand mark (Ohio outline) used until the WordPress logo is imported or uploaded in Settings. */
export function OhioMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <path
        d="M5 4.5 11.5 6l4-1.6 3.4 1.4L26.5 3l.6 13.4-1.4 2.8-2.2 3.4-2.6 2.1-.6 3.4-4.2 1.3-3.3-1.9-3.4.7-3.5-1.4z"
        stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ logoUrl, siteName, className, invert = false }: { logoUrl?: string | null; siteName: string; className?: string; invert?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 shrink-0", className)} aria-label={`${siteName} home`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={siteName} className="h-9 w-auto max-w-[220px] object-contain sm:h-10" />
      ) : (
        <>
          <OhioMark className={cn("h-8 w-8 sm:h-9 sm:w-9", invert ? "text-white" : "text-navy-800")} />
          <span className={cn("text-lg font-extrabold tracking-tight sm:text-xl", invert ? "text-white" : "text-navy-900")}>
            TCounty<span className={invert ? "text-sunset-400" : "text-brand-600"}>Spotlight</span>
          </span>
        </>
      )}
    </Link>
  );
}

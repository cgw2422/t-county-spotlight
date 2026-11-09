import Link from "next/link";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

/**
 * Small square brand mark — the county-outline icon cropped from the official
 * T County Connect artwork (served by /brand/mark.png). It sits on a white
 * tile so the original navy/green/orange artwork stays legible on any
 * background. Until the official logo is uploaded, the route falls back to a
 * neutral placeholder icon.
 */
export function BrandMark({ className, tile = true }: { className?: string; tile?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = (size: string) => <img src="/brand/mark.png" alt="" aria-hidden className={cn(size, "object-contain")} />;
  if (!tile) return <span className={cn("inline-flex shrink-0", className)}>{img("h-full w-full")}</span>;
  // Inner image sized as a share of the tile (percentage padding would follow the parent's width).
  return <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm", className)}>{img("h-[78%] w-[78%]")}</span>;
}

/** Legacy export name kept for existing imports. */
export const OhioMark = BrandMark;

/** The brand name set in Montserrat — used only when the logo image is unavailable. */
export function BrandWordmark({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("font-display font-extrabold uppercase leading-[0.95] tracking-tight", className)}>
      <span className={cn("block", onDark ? "text-white" : "text-navy-900")}>T County</span>
      <span className={cn("block", onDark ? "text-white" : "text-hillside-600")}>Connect</span>
    </span>
  );
}

/**
 * Horizontal T County Connect logo. `src` is the trimmed official logo
 * generated from the uploaded artwork. For the full-color logo on a dark
 * background pass `onDark` (white plate); for the official all-white logo pass
 * `plate={false}`.
 */
export function Logo({ src, className, onDark = false, plate = onDark, size = "md" }: { src?: string | null; className?: string; onDark?: boolean; plate?: boolean; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-12 sm:h-14" : "h-10 sm:h-12";
  return (
    <Link href="/" className={cn("flex shrink-0 items-center", className)} aria-label={`${BRAND.name} home`}>
      {src ? (
        <span className={cn(plate && "rounded-xl bg-white px-3 py-2 shadow-sm")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={BRAND.name} className={cn(h, "w-auto max-w-[240px] object-contain")} />
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <BrandMark className={size === "sm" ? "h-8 w-8" : "h-10 w-10"} />
          <BrandWordmark onDark={onDark} className={size === "sm" ? "text-[13px]" : "text-[15px] sm:text-base"} />
        </span>
      )}
    </Link>
  );
}

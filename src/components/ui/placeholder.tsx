import { OhioMark } from "@/components/site/logo";
import { cn } from "@/lib/utils";

/** Branded placeholder for records without an image (never a stock photo). */
export function ImagePlaceholder({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-navy-800 via-navy-700 to-brand-700 p-4 text-center text-white", className)}>
      <OhioMark className="h-10 w-10 opacity-60" />
      {label && <span className="line-clamp-2 font-display text-lg font-semibold leading-tight">{label}</span>}
    </div>
  );
}

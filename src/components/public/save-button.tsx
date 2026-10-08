"use client";
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BellRing, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveKind = "BUSINESS" | "EVENT" | "PROMOTION" | "ARTICLE" | "BUSINESS_FOLLOW";

/**
 * Optimistic save / follow toggle. Unauthenticated visitors are sent to
 * /login/?next=<current page>. Pass `type="BUSINESS_FOLLOW"` to follow a business.
 */
export function SaveButton({ type, targetId, initial = false, label, savedLabel, className, compact = false }: {
  type: SaveKind; targetId: string; initial?: boolean; label?: string; savedLabel?: string; className?: string; compact?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const path = usePathname();
  const router = useRouter();
  const follow = type === "BUSINESS_FOLLOW";
  const text = saved ? (savedLabel ?? (follow ? "Following" : "Saved")) : (label ?? (follow ? "Follow" : "Save"));
  const Icon = follow ? (saved ? BellRing : Bell) : Heart;

  function toggle() {
    const next = !saved;
    setSaved(next);
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/save/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, targetId, action: follow ? (next ? "follow" : "unfollow") : next ? "save" : "unsave" }),
        });
        if (res.status === 401) {
          setSaved(!next);
          router.push(`/login/?next=${encodeURIComponent(path || "/")}`);
          return;
        }
        if (!res.ok) throw new Error();
        const json = (await res.json()) as { saved: boolean };
        setSaved(json.saved);
      } catch {
        setSaved(!next);
        setError("Couldn't update. Try again.");
      }
    });
  }

  return (
    <span className={cn("inline-flex flex-col", className?.includes("w-full") && "w-full")}>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={compact ? text : undefined}
        title={compact ? text : undefined}
        className={cn(
          compact ? "btn-secondary px-3" : "btn-secondary",
          saved && "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
          saved && follow && "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100",
          className,
        )}
      >
        <Icon className={cn("h-5 w-5", saved && !follow && "fill-current")} aria-hidden />
        {!compact && <span>{text}</span>}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}

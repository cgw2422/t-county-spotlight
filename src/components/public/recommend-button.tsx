"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, ThumbsUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { OWN_LISTING_MESSAGE, RECOMMENDATION_TRUST_NOTE, recommendationCountText } from "@/lib/recommendations-shared";

/**
 * Community recommendation block for a business profile: thumbs-up count + toggle.
 * Optimistic: the button and count flip immediately and are reconciled with the
 * server's answer (or rolled back on error). Guests get an inline sign-in prompt.
 */
export function RecommendButton({ businessId, initialCount, initialRecommended, signedIn, manages, profilePath }: {
  businessId: string; initialCount: number; initialRecommended: boolean; signedIn: boolean; manages: boolean; profilePath: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [recommended, setRecommended] = useState(initialRecommended);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(false);
  const inflight = useRef(false);
  const next = encodeURIComponent(profilePath);

  async function toggle() {
    if (!signedIn) { setPrompt(true); return; }
    if (inflight.current) return; // double-click / repeated taps while a request is running
    inflight.current = true;
    const want = !recommended;
    const prev = { count, recommended };
    setRecommended(want);
    setCount((c) => Math.max(0, c + (want ? 1 : -1)));
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/recommend/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, action: want ? "recommend" : "unrecommend" }),
      });
      const json = (await res.json().catch(() => ({}))) as { recommended?: boolean; count?: number; error?: string; code?: string };
      if (res.status === 401) { setRecommended(prev.recommended); setCount(prev.count); setPrompt(true); return; }
      if (!res.ok) {
        setRecommended(prev.recommended);
        setCount(prev.count);
        setError(json.code === "own_listing" ? OWN_LISTING_MESSAGE : json.error || "Couldn't update. Try again.");
        return;
      }
      setRecommended(!!json.recommended);
      if (typeof json.count === "number") setCount(json.count);
    } catch {
      setRecommended(prev.recommended);
      setCount(prev.count);
      setError("Couldn't update. Check your connection and try again.");
    } finally {
      inflight.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="recs-title" className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:p-5" data-testid="recommendations">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", count > 0 ? "bg-hillside-600 text-white" : "bg-slate-100 text-slate-500")}>
            <ThumbsUp className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="recs-title" className="text-xs font-bold uppercase tracking-wide text-slate-500">Community recommendations: <span className="tabular-nums" data-testid="recommendation-count">{count}</span></h2>
            <p className="font-semibold text-navy-900" aria-live="polite" data-testid="recommendation-text">{recommendationCountText(count)}</p>
            {recommended && <p className="text-sm font-medium text-hillside-700" data-testid="you-recommend">You recommend this business</p>}
          </div>
        </div>
        {manages ? (
          <p className="text-sm text-slate-600 sm:max-w-56 sm:text-right" data-testid="recommend-own-listing">{OWN_LISTING_MESSAGE}</p>
        ) : (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            aria-pressed={recommended}
            data-testid="recommend-button"
            className={cn("min-h-11 w-full shrink-0 sm:w-auto", recommended ? "btn-secondary" : "btn-primary")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ThumbsUp className={cn("h-4 w-4", recommended && "fill-current")} aria-hidden />}
            {recommended ? "Remove Recommendation" : "Recommend This Business"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700" data-testid="recommend-error">{error}</p>}
      {prompt && (
        <div role="status" className="mt-3 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-navy-900 ring-1 ring-slate-200" data-testid="recommend-signin-prompt">
          <p className="flex-1">
            Sign in to recommend this business. It&rsquo;s free for every member.
            <span className="mt-2 flex flex-wrap gap-2">
              <Link href={`/login/?next=${next}`} className="btn-primary btn-sm min-h-11">Sign in</Link>
              <Link href={`/register/?next=${next}`} className="btn-secondary btn-sm min-h-11">Create a free account</Link>
            </span>
          </p>
          <button type="button" onClick={() => setPrompt(false)} className="-m-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-500 hover:text-navy-900" aria-label="Dismiss">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500" data-testid="recommend-trust-note">{RECOMMENDATION_TRUST_NOTE}</p>
    </section>
  );
}

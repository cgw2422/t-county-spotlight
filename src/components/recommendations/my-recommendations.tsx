import Link from "next/link";
import { ThumbsUp } from "lucide-react";
import { getUserRecommendations } from "@/lib/recommendations";
import { businessHref } from "@/lib/links";
import { formatDate } from "@/lib/utils";
import { removeMyRecommendationAction } from "./actions";
import { DiscoverySuggestions } from "@/components/my-t-county/discovery-suggestions";

/**
 * "Businesses I've Recommended" — the member's own community recommendations, kept separate
 * from Saved. Shows a short empty state when there are none.
 */
export async function MyRecommendations({ userId, suggestions = false }: { userId: string; /** Empty state with discovery links (My T County). */ suggestions?: boolean }) {
  const rows = await getUserRecommendations(userId);
  return (
    <div data-testid="my-recommendations">
      {rows.length ? (
        <ul className="card divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3" data-testid="my-recommendation">
              <span className="min-w-0 flex-1">
                <Link href={businessHref(r.business)} className="block font-semibold text-navy-900 hover:text-brand-700 hover:underline">{r.business.name}</Link>
                <span className="block text-sm text-slate-500">{[r.business.city, `Recommended ${formatDate(r.createdAt, { month: "short", day: "numeric", year: "numeric" })}`].filter(Boolean).join(" · ")}</span>
              </span>
              <form action={removeMyRecommendationAction}>
                <input type="hidden" name="businessId" value={r.business.id} />
                <button type="submit" className="btn-secondary btn-sm min-h-11" data-testid="remove-my-recommendation">Remove<span className="sr-only"> recommendation for {r.business.name}</span></button>
              </form>
            </li>
          ))}
        </ul>
      ) : suggestions ? (
        <DiscoverySuggestions intro={<>You haven&rsquo;t recommended any businesses yet. Tap <strong>Recommend This Business</strong> on a place you&rsquo;d tell a neighbor about. See what others recommend:</>} />
      ) : (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          You haven&rsquo;t recommended any businesses yet. Tap <ThumbsUp className="inline h-4 w-4 align-text-bottom" aria-label="Recommend" /> <strong>Recommend This Business</strong> on a business you&rsquo;d tell a neighbor about. <Link href="/businesses/" className="font-semibold text-brand-700 hover:underline">Browse businesses</Link>.
        </p>
      )}
    </div>
  );
}

/**
 * Community recommendations: shared copy and display helpers (safe for client components).
 *
 * A recommendation is a single thumbs-up from a signed-in T County Connect member. It is NOT a
 * star rating or a written review, and it is never described as verified or as coming from customers.
 * Membership / paid plans play no part in who can recommend, in counts, sorting or moderation.
 */

export const RECOMMENDATION_TRUST_NOTE =
  "Recommendations are submitted by registered T County Connect members. They reflect individual opinions and are not verified customer reviews.";

export const OWN_LISTING_MESSAGE = "You can't recommend a listing you manage.";

/** "No recommendations yet" / "1 person recommends this business" / "47 people recommend this business" */
export function recommendationCountText(n: number) {
  if (n <= 0) return "No recommendations yet";
  if (n === 1) return "1 person recommends this business";
  return `${n.toLocaleString("en-US")} people recommend this business`;
}

/** Public count: hidden (0) while staff have recommendations switched off for the listing. */
export function visibleRecommendationCount(b: { recommendationCount?: number | null; recommendationsDisabled?: boolean | null }) {
  return b.recommendationsDisabled ? 0 : Math.max(0, b.recommendationCount ?? 0);
}

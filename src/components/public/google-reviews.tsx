import { Suspense } from "react";
import { ExternalLink, Star } from "lucide-react";
import { getGooglePlacesSettings, getPlaceDetails, googleListingUrl, placeFallbackUrl, type PlaceDetails } from "@/lib/google-places";
import { cn } from "@/lib/utils";

type Listing = { name: string; googlePlaceId: string | null; googleMapsUrl: string | null; googleReviewsEnabled: boolean };

/**
 * Google listing / reviews card for a public business profile (third-party content).
 * Renders nothing unless the business is linked and opted in; falls back to a plain
 * "Read Reviews on Google" link whenever live data isn't available. Never breaks the page.
 */
export function GoogleReviews({ business }: { business: Listing }) {
  if (!business.googleReviewsEnabled || (!business.googlePlaceId && !business.googleMapsUrl)) return null;
  return (
    <Suspense fallback={<div aria-hidden className="card h-40 animate-pulse bg-slate-50" />}>
      <GoogleReviewsInner business={business} />
    </Suspense>
  );
}

async function GoogleReviewsInner({ business }: { business: Listing }) {
  const link = googleListingUrl(business)!;
  let place: PlaceDetails | null = null;
  let showReviews = true;
  try {
    if (business.googlePlaceId) {
      const settings = await getGooglePlacesSettings();
      showReviews = settings.showReviews;
      place = await getPlaceDetails(business.googlePlaceId, { settings });
    }
  } catch {
    place = null;
  }
  if (!place || place.rating == null) return <FallbackCard link={link} name={business.name} />;
  const mapsLink = place.googleMapsUri || link || placeFallbackUrl(place.id);
  const reviews = showReviews ? place.reviews : [];

  return (
    <section aria-labelledby="google-reviews-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="google-reviews-title" className="font-semibold text-navy-900">Google reviews</h2>
          <p className="text-xs text-slate-500">Third-party reviews from Google. TCountySpotlight does not edit or select them.</p>
        </div>
        <GoogleMapsAttribution />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-3xl font-bold text-navy-900">{place.rating.toFixed(1)}</span>
        <Stars rating={place.rating} className="h-5 w-5" />
        {place.userRatingCount != null && (
          <span className="text-sm text-slate-600">{place.userRatingCount.toLocaleString("en-US")} review{place.userRatingCount === 1 ? "" : "s"} on Google</span>
        )}
      </div>

      {reviews.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
          {reviews.map((r, i) => (
            <li key={`${r.authorName}-${i}`} className="py-4">
              <div className="flex items-center gap-3">
                {r.authorPhotoUri ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Google-hosted avatar, must not be proxied or stored
                  <img src={r.authorPhotoUri} alt="" width={36} height={36} loading="lazy" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full bg-slate-100 object-cover" />
                ) : (
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">{r.authorName.charAt(0)}</span>
                )}
                <div className="min-w-0">
                  {r.authorUri ? (
                    <a href={r.authorUri} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-semibold text-navy-900 hover:underline">{r.authorName}</a>
                  ) : (
                    <span className="block truncate text-sm font-semibold text-navy-900">{r.authorName}</span>
                  )}
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    {r.rating != null && <Stars rating={r.rating} className="h-3.5 w-3.5" />}
                    {r.relativeTime && (r.googleMapsUri
                      ? <a href={r.googleMapsUri} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.relativeTime}</a>
                      : <span>{r.relativeTime}</span>)}
                  </div>
                </div>
              </div>
              {r.text && <p className="mt-2 whitespace-pre-line break-words text-sm text-slate-700">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}

      {place.attributions.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Data also from{" "}
          {place.attributions.map((a, i) => (
            <span key={a.provider}>{i > 0 && ", "}{a.providerUri ? <a href={a.providerUri} target="_blank" rel="noopener noreferrer" className="underline">{a.provider}</a> : a.provider}</span>
          ))}
        </p>
      )}

      <a href={mapsLink} target="_blank" rel="noopener" className="btn-secondary mt-4 w-full sm:w-auto">
        See all reviews on Google Maps <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    </section>
  );
}

function FallbackCard({ link, name }: { link: string; name: string }) {
  return (
    <section aria-labelledby="google-reviews-title" className="card p-5 sm:p-6">
      <h2 id="google-reviews-title" className="font-semibold text-navy-900">Reviews on Google</h2>
      <p className="mt-1 text-sm text-slate-600">See what customers say about {name} on Google.</p>
      <a href={link} target="_blank" rel="noopener" className="btn-secondary mt-4 w-full sm:w-auto">
        Read Reviews on Google <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    </section>
  );
}

/** Text attribution required when showing Places data without a Google map. */
function GoogleMapsAttribution() {
  return (
    <span translate="no" className="shrink-0 text-xs text-slate-500" style={{ fontFamily: "Roboto, Arial, sans-serif" }}>
      Google Maps
    </span>
  );
}

function Stars({ rating, className }: { rating: number; className?: string }) {
  const label = `Rated ${rating.toFixed(1)} out of 5`;
  return (
    <span role="img" aria-label={label} className="inline-flex items-center">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} aria-hidden className={cn("relative inline-block", className)}>
            <Star className={cn("absolute inset-0 text-slate-300", className)} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn("fill-amber-400 text-amber-400", className)} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

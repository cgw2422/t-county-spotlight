import { Card } from "@/components/admin/page-header";
import { getGooglePlacesSettings, isPlacesApiActive } from "@/lib/google-places";
import { GoogleListingFields } from "./google-listing-fields";

type B = { id: string; name: string; city: string | null; address: string | null; googlePlaceId: string | null; googleMapsUrl: string | null; googleReviewsEnabled: boolean; googlePlaceVerifiedAt: Date | null } | null;

/** Admin business editor card (server component; place inside the editor form). */
export async function GoogleListingAdminCard({ b }: { b: B }) {
  const settings = await getGooglePlacesSettings();
  return (
    <Card title="Google listing" description="Link this business to its Google Maps listing to show a Google reviews card on the profile.">
      <GoogleListingFields
        key={`${b?.googlePlaceId ?? ""}|${b?.googleMapsUrl ?? ""}|${b?.googlePlaceVerifiedAt?.toISOString() ?? ""}`}
        businessId={b?.id}
        searchAvailable={isPlacesApiActive(settings)}
        defaultQuery={b ? [b.name, b.address, b.city ?? "", "OH"].filter(Boolean).join(", ") : ""}
        initial={{ placeId: b?.googlePlaceId ?? "", mapsUrl: b?.googleMapsUrl ?? "", reviewsEnabled: b?.googleReviewsEnabled ?? true, verifiedAt: b?.googlePlaceVerifiedAt?.toISOString() ?? null }}
      />
    </Card>
  );
}

import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { getSavedItemsForUser } from "@/lib/saved";
import { buildMetadata } from "@/components/public/seo";
import { PageHeader } from "@/components/public/page-header";
import { TrackView } from "@/components/public/track";
import { SavedSections } from "@/components/saved/saved-sections";
import { DeviceSaved, DeviceSavesOffer } from "@/components/saved/device-saved";
import { removeSavedItemAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Saved",
    description: "Events, businesses, food trucks, garage sales, specials and stories you saved on T County Connect.",
    path: "/saved/",
    noindex: true,
  });
}

export default async function SavedPage() {
  const user = await getCurrentUser();
  const items = user ? await getSavedItemsForUser(user.id) : null;
  return (
    <>
      <PageHeader
        title="Saved"
        subtitle={user ? "Everything you've saved, on all your devices." : "Events, businesses, garage sales and more that you've saved on this device."}
        crumbs={[{ label: "Saved" }]}
      />
      <div className="container-page max-w-3xl space-y-6 py-8">
        <TrackView type="view_saved" />
        {user && items ? (
          <>
            <DeviceSavesOffer />
            <SavedSections items={items} remove={{ kind: "action", action: removeSavedItemAction }} />
          </>
        ) : (
          <DeviceSaved />
        )}
      </div>
    </>
  );
}

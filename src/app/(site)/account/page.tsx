import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSavedItemsForUser } from "@/lib/saved";
import { SavedSections } from "@/components/saved/saved-sections";
import { DeviceSavesOffer } from "@/components/saved/device-saved";
import { removeSavedItemAction } from "../saved/actions";
import { GivesAccountCard } from "@/components/gives/account-card";
import { MyGarageSales } from "@/components/garage-sales/my-garage-sales";

export const dynamic = "force-dynamic";

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ welcome?: string; password?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const sp = await searchParams;
  const items = await getSavedItemsForUser(user.id);

  return (
    <div className="space-y-8">
      <GivesAccountCard user={user} />
      <MyGarageSales userId={user.id} />
      {sp.welcome && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Welcome to T County Connect! Tap the heart on any event, business, food truck, garage sale, special or story to save it here.</p>}
      {sp.password && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your new password is saved and you&apos;re signed in.</p>}
      <DeviceSavesOffer />
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-navy-900">Saved</h2>
        <Link href="/saved/" className="text-sm font-semibold text-brand-700 hover:underline">Open the Saved page →</Link>
      </div>
      <SavedSections items={items} remove={{ kind: "action", action: removeSavedItemAction }} />
    </div>
  );
}

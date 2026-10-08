import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, getOwnedBusinesses, isStaff } from "@/lib/auth";
import { TUSCARAWAS_CITIES } from "@/lib/utils";
import { PageHeader } from "@/components/public/page-header";
import { buildMetadata } from "@/components/public/seo";
import { nyDateKey } from "@/components/public/dates";
import { EventSubmitForm } from "./form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: "Submit an Event",
    description: "Add your festival, concert, class, fundraiser or community event to the free Tuscarawas County events calendar.",
    path: "/events/submit/",
  });
}

export default async function SubmitEventPage() {
  const user = await getCurrentUser();
  const [categories, businesses] = await Promise.all([
    db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    user ? (isStaff(user) ? Promise.resolve([]) : getOwnedBusinesses(user.id)) : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Free listing"
        title="Submit an event"
        subtitle="Share what’s happening in Tuscarawas County. Listings are free and reviewed by our team before they go live."
        crumbs={[{ label: "Events", href: "/events/" }, { label: "Submit" }]}
      />
      <div className="container-page py-8 sm:py-10">
        <div className="mx-auto max-w-3xl">
          {!user && (
            <p className="mb-6 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
              Have an account? <Link href="/login/?next=/events/submit/" className="font-semibold underline">Sign in</Link> to track your submissions and link events to your business.
            </p>
          )}
          <EventSubmitForm
            categories={categories}
            cities={TUSCARAWAS_CITIES}
            businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
            signedInEmail={user?.email ?? null}
            canUpload={!!user && (isStaff(user) || businesses.length > 0)}
            today={nyDateKey(new Date())}
          />
        </div>
      </div>
    </>
  );
}

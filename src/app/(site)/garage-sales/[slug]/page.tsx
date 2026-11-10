import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CalendarDays, Clock, Flag, MapPin, Navigation, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { absoluteUrl, truncate } from "@/lib/utils";
import { addDaysKey, nyDateKey } from "@/components/public/dates";
import { PageHeader } from "@/components/public/page-header";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { JsonLd } from "@/components/public/json-ld";
import { TrackView } from "@/components/public/track";
import { ShareButtons } from "@/components/public/share-buttons";
import { SaveButton } from "@/components/public/save-button";
import { isSaved } from "@/components/public/server";
import { buildMetadata } from "@/components/public/seo";
import { EmptyState } from "@/components/ui/empty-state";
import { garageSaleCardSelect, garageSaleHref, isSaleEnded, toPublicSale } from "@/lib/garage-sales";
import { categoryLabel, directionsUrl, formatHours, formatSaleDates, saleTypeLabel } from "@/lib/garage-sales-shared";

export const dynamic = "force-dynamic";

/** Only published (or once-published, now removed) sales have public URLs. */
const getSale = cache(async (slug: string) => {
  const s = await db.garageSale.findUnique({ where: { slug }, select: { ...garageSaleCardSelect, status: true, publishedAt: true, updatedAt: true } });
  if (!s) return null;
  if (s.status === "PUBLISHED") return { sale: toPublicSale(s), ended: isSaleEnded(s), updatedAt: s.updatedAt };
  if (s.status === "REMOVED" && s.publishedAt) return { sale: toPublicSale(s), ended: true, updatedAt: s.updatedAt };
  return null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await getSale((await params).slug);
  if (!r) return { title: "Sale not found", robots: { index: false } };
  const { sale } = r;
  return buildMetadata({
    title: r.ended ? `${sale.title} (ended)` : `${sale.title} — ${saleTypeLabel(sale.saleType)} in ${sale.city || "Tuscarawas County"}`,
    description: r.ended ? "This sale has ended." : `${formatSaleDates(sale.startDate, sale.endDate)}, ${formatHours(sale.dailyStart, sale.dailyEnd)}. ${truncate(sale.description || "", 200)}`,
    path: garageSaleHref(sale),
    image: sale.photos[0] ?? null,
    noindex: r.ended,
  });
}

export default async function GarageSalePage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await getSale((await params).slug);
  if (!r) notFound();
  const { sale } = r;

  if (r.ended) {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl">
          <EmptyState icon={Tag} title="This sale has ended">
            “{sale.title}” is no longer running. See what else is coming up nearby.
            <span className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/garage-sales/" className="btn-primary btn-sm">Upcoming garage sales</Link>
              <Link href="/garage-sales/submit/" className="btn-secondary btn-sm">List your sale</Link>
            </span>
          </EmptyState>
        </div>
      </div>
    );
  }

  const [settings, saved] = await Promise.all([getSettings(), isSaved("GARAGE_SALE", sale.id)]);
  const reportTo = settings.contactEmail || settings.emailFromAddress || "";
  const where = [sale.locationLine, sale.city].filter(Boolean).join(", ");
  const directions = directionsUrl(sale);
  const days: string[] = [];
  for (let k = nyDateKey(sale.startDate), end = nyDateKey(sale.endDate); k <= end && days.length < 8; k = addDaysKey(k, 1)) days.push(k);

  return (
    <>
      <TrackView type="view_garage_sale" targetType="GARAGE_SALE" targetId={sale.id} />
      <PageHeader eyebrow={saleTypeLabel(sale.saleType)} title={sale.title} crumbs={[{ label: "Garage Sales", href: "/garage-sales/" }, { label: sale.title }]} />
      <div className="container-page py-8 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-8">
            {sale.photos.length > 0 && <PhotoGallery name={sale.title} photos={sale.photos.map((url, i) => ({ id: `${i}`, url, alt: `${sale.title} photo ${i + 1}` }))} />}
            {sale.description && (
              <section aria-labelledby="about">
                <h2 id="about" className="section-title">About this sale</h2>
                <p className="mt-3 whitespace-pre-line text-slate-700">{sale.description}</p>
              </section>
            )}
            {sale.itemCategories.length > 0 && (
              <section aria-labelledby="items">
                <h2 id="items" className="section-title">What&apos;s for sale</h2>
                <ul className="mt-3 flex flex-wrap gap-2">{sale.itemCategories.map((c) => <li key={c} className="badge-gray">{categoryLabel(c)}</li>)}</ul>
              </section>
            )}
          </div>
          <aside className="space-y-4">
            <div className="card space-y-4 p-5">
              <p className="flex items-start gap-3 text-slate-800"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-hillside-700" aria-hidden /><span><span className="block font-semibold">{formatSaleDates(sale.startDate, sale.endDate)}</span>{days.length > 1 && <span className="text-sm text-slate-500">{days.length} days</span>}</span></p>
              <p className="flex items-start gap-3 text-slate-800"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-hillside-700" aria-hidden /><span>{formatHours(sale.dailyStart, sale.dailyEnd)} each day</span></p>
              {where && (
                <p className="flex items-start gap-3 text-slate-800"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-hillside-700" aria-hidden />
                  <span>{where}{sale.addressVisibility === "GENERAL" && <span className="block text-sm text-slate-500">General area — the host chose not to show the exact address.</span>}</span>
                </p>
              )}
              <a href={directions} target="_blank" rel="noopener noreferrer" className="btn-primary w-full"><Navigation className="h-4 w-4" aria-hidden /> Get directions</a>
              <SaveButton type="GARAGE_SALE" targetId={sale.id} initial={saved} className="w-full" />
            </div>
            <ShareButtons url={absoluteUrl(garageSaleHref(sale))} title={sale.title} />
            <p className="text-sm text-slate-500">
              Listings are shared by residents and reviewed by our team.{" "}
              {reportTo && <a href={`mailto:${reportTo}?subject=${encodeURIComponent(`Problem with garage sale: ${sale.title}`)}&body=${encodeURIComponent(absoluteUrl(garageSaleHref(sale)))}`} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><Flag className="h-3.5 w-3.5" aria-hidden /> Report a problem</a>}
            </p>
            <Link href="/garage-sales/" className="block text-sm font-semibold text-brand-700 hover:underline">← All garage sales</Link>
          </aside>
        </div>
      </div>
      <JsonLd data={{
        "@context": "https://schema.org", "@type": "Event", name: sale.title,
        startDate: `${nyDateKey(sale.startDate)}T${sale.dailyStart}`, endDate: `${nyDateKey(sale.endDate)}T${sale.dailyEnd}`,
        eventStatus: "https://schema.org/EventScheduled", eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: where || "Tuscarawas County", address: { "@type": "PostalAddress", ...(sale.addressVisibility === "EXACT" && sale.address ? { streetAddress: sale.address, postalCode: sale.zip ?? undefined } : {}), addressLocality: sale.city ?? undefined, addressRegion: "OH", addressCountry: "US" } },
        ...(sale.description ? { description: truncate(sale.description, 300) } : {}),
        ...(sale.photos[0] ? { image: [absoluteUrl(sale.photos[0])] } : {}),
        isAccessibleForFree: true,
      }} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CalendarDays, ExternalLink, MapPin, Navigation, Store } from "lucide-react";
import { db } from "@/lib/db";
import { absoluteUrl, stripHtml, truncate } from "@/lib/utils";
import { businessHref } from "@/lib/links";
import { PageHeader } from "@/components/public/page-header";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { ShareButtons } from "@/components/public/share-buttons";
import { buildMetadata } from "@/components/public/seo";
import { OpeningStatusBadge } from "@/components/openings/opening-card";
import {
  OPENING_LABELS, isArchivedOpening, isOpeningKind, openingCardSelect, openingDatePrefix, openingDateText, openingHref, openingName, publicOpeningsWhere,
} from "@/lib/openings";

export const dynamic = "force-dynamic";

const getOpening = cache(async (id: string) => {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return db.businessUpdate.findFirst({ where: await publicOpeningsWhere({ id }), select: { ...openingCardSelect, updatedAt: true } });
});

function safeLink(url: string | null) {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const o = await getOpening((await params).id);
  if (!o || !isOpeningKind(o.kind)) return { title: "Not found", robots: { index: false } };
  const name = openingName(o);
  const city = o.city || o.business?.city;
  return buildMetadata({
    title: `${name} — ${OPENING_LABELS[o.kind]}${city ? ` in ${city}` : ""}`,
    description: truncate(stripHtml(o.body), 200) || `${name}: ${OPENING_LABELS[o.kind]} in Tuscarawas County.`,
    path: openingHref(o),
    image: o.photos[0] || o.imageUrl || null,
  });
}

export default async function OpeningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const o = await getOpening((await params).id);
  if (!o || !isOpeningKind(o.kind)) notFound();
  const name = openingName(o);
  const date = openingDateText(o);
  const city = o.city || o.business?.city || null;
  const address = o.address || (o.city ? null : o.business?.address) || null;
  const where = [address, city].filter(Boolean).join(", ");
  const directions = where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${where}, OH`)}` : null;
  const photos = [...o.photos, ...(o.photos.length === 0 && o.imageUrl ? [o.imageUrl] : [])];
  const link = safeLink(o.linkUrl);
  const archived = isArchivedOpening(o);
  const body = stripHtml(o.body.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n")).trim();

  return (
    <>
      <PageHeader eyebrow={OPENING_LABELS[o.kind]} title={name} subtitle={o.title !== name ? o.title : null} crumbs={[{ label: "New & Coming Soon", href: "/new/" }, { label: name }]} />
      <div className="container-page py-8 sm:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-8">
            {archived && <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">This announcement is from our archive and may be out of date.</p>}
            {photos.length > 0 && <PhotoGallery name={name} photos={photos.map((url, i) => ({ id: `${i}`, url, alt: `${name} photo ${i + 1}` }))} />}
            {body && (
              <section aria-labelledby="about">
                <h2 id="about" className="section-title">Details</h2>
                <p className="mt-3 whitespace-pre-line text-slate-700">{body}</p>
              </section>
            )}
          </div>
          <aside className="space-y-4">
            <div className="card space-y-4 p-5">
              <p><OpeningStatusBadge kind={o.kind} /></p>
              <p className="flex items-start gap-3 text-slate-800">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-hillside-700" aria-hidden />
                <span data-testid="opening-date">{date ? (o.effectiveDate ? `${openingDatePrefix(o.kind, o.effectiveDate)} ${date}` : date) : o.kind === "COMING_SOON" ? "Opening date not announced yet" : "Date not announced"}</span>
              </p>
              {where && <p className="flex items-start gap-3 text-slate-800"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-hillside-700" aria-hidden /><span>{where}</span></p>}
              {directions && <a href={directions} target="_blank" rel="noopener noreferrer" className="btn-primary w-full"><Navigation className="h-4 w-4" aria-hidden /> Get directions</a>}
              {o.business && <Link href={businessHref(o.business)} className="btn-secondary w-full"><Store className="h-4 w-4" aria-hidden /> View {o.business.name}&apos;s listing</Link>}
              {link && <a href={link} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost w-full text-brand-700"><ExternalLink className="h-4 w-4" aria-hidden /> Source / more info</a>}
            </div>
            <ShareButtons url={absoluteUrl(openingHref(o))} title={name} />
            <p className="text-sm text-slate-500">Information is gathered by our local team and businesses. Dates appear only once they&apos;ve been announced.</p>
            <Link href="/new/" className="block text-sm font-semibold text-brand-700 hover:underline">← All new &amp; coming soon</Link>
          </aside>
        </div>
      </div>
    </>
  );
}

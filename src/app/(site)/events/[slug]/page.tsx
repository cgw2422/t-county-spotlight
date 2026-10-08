import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CalendarPlus, Clock, Download, MapPin, Repeat, Ticket, UserRound } from "lucide-react";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { describeRecurrence, expandOccurrences, googleCalendarUrl } from "@/lib/events";
import { eventHref } from "@/lib/links";
import { getUpcomingOccurrences } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { absoluteUrl, formatDate, formatTime, stripHtml } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { BusinessCard } from "@/components/cards/business-card";
import { EventCard, DateBadge } from "@/components/cards/event-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { SaveButton } from "@/components/public/save-button";
import { ShareButtons } from "@/components/public/share-buttons";
import { TrackView, TrackedLink } from "@/components/public/track";
import { buildMetadata } from "@/components/public/seo";
import { followRedirectIfAny, isSaved } from "@/components/public/server";
import { loadEvent } from "./data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function timeRange(start: Date, end: Date | null, allDay: boolean) {
  if (allDay) return "All day";
  if (!end) return formatTime(start);
  const sameDay = formatDate(start) === formatDate(end);
  return sameDay ? `${formatTime(start)} – ${formatTime(end)}` : `${formatTime(start)} – ${formatDate(end, { month: "short", day: "numeric" })}, ${formatTime(end)}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await loadEvent((await params).slug);
  if (!e) return {};
  const now = new Date();
  const next = expandOccurrences([e], now, new Date(now.getTime() + 730 * 86400_000), 1)[0];
  const when = formatDate(next?.occurrenceStart ?? e.startAt, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return buildMetadata({
    title: `${e.title} — ${when}${e.city ? `, ${e.city}` : ""}`,
    description: stripHtml(e.description) || `${e.title} on ${when}${e.locationName ? ` at ${e.locationName}` : ""}${e.city ? ` in ${e.city}, Ohio` : ""}.`,
    path: eventHref(e),
    image: e.imageUrl,
    noindex: !next,
  });
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const e = await loadEvent(slug);
  if (!e) {
    await followRedirectIfAny(`/events/${slug}/`);
    notFound();
  }
  const now = new Date();
  const upcoming = expandOccurrences([e], now, new Date(now.getTime() + 730 * 86400_000), 7);
  const next = upcoming[0] ?? { ...e, occurrenceStart: e.startAt, occurrenceEnd: e.endAt };
  const past = upcoming.length === 0;
  const recurrence = describeRecurrence(e.recurrence);
  const url = absoluteUrl(eventHref(e));
  const business = e.business && e.business.status === "PUBLISHED" && !e.business.deletedAt ? e.business : null;
  const where = [e.locationName, e.address, e.city].filter(Boolean);
  const mapQuery = [e.locationName, e.address, e.city, e.city ? "OH" : null].filter(Boolean).join(", ");
  const mapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;
  const description = sanitizeRichText(e.description);
  const [saved, settings, more] = await Promise.all([
    isSaved("EVENT", e.id),
    getSettings(),
    getUpcomingOccurrences({ limit: 4, where: { id: { not: e.id }, ...(e.categoryId ? { categoryId: e.categoryId } : {}) } }),
  ]);
  const track = (type: string) => ({ type, businessId: business?.id, targetType: "EVENT", targetId: e.id });

  return (
    <article className="pb-8">
      <TrackView {...track("view_event")} />
      <div className="container-page pt-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "Events", href: "/events/" }, ...(e.category ? [{ label: e.category.name, href: `/events/?category=${e.category.slug}` }] : []), { label: e.title }]} />
      </div>

      <div className="container-page mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:gap-10">
        <div className="min-w-0">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100">
            {e.imageUrl ? <SmartImage src={e.imageUrl} alt="" fill priority sizes="(min-width:1024px) 800px, 100vw" className="object-cover" /> : <ImagePlaceholder label={e.title} />}
            <div className="absolute left-3 top-3 flex gap-1.5">
              {e.isSponsored && <span className="badge-sponsored">{settings.sponsoredLabel}</span>}
              {e.category && <span className="badge bg-white/95 text-navy-900 shadow-sm">{e.category.name}</span>}
            </div>
          </div>

          <header className="mt-6 flex gap-4">
            <div className="hidden sm:block"><DateBadge date={next.occurrenceStart} /></div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{e.title}</h1>
              <p className="mt-2 text-lg text-slate-700">
                {formatDate(next.occurrenceStart, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                <span className="text-slate-400"> · </span>{timeRange(next.occurrenceStart, next.occurrenceEnd, e.allDay)}
              </p>
              {past && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">This event has already taken place.</p>}
            </div>
          </header>

          <div className="mt-6 flex flex-wrap gap-2">
            {e.ticketUrl && /^https?:\/\//i.test(e.ticketUrl) && !past && (
              <TrackedLink href={e.ticketUrl} target="_blank" rel="noopener" track={track("click_ticket")} className="btn-primary"><Ticket className="h-4 w-4" aria-hidden /> {e.isFree ? "Register" : "Get tickets"}</TrackedLink>
            )}
            <SaveButton type="EVENT" targetId={e.id} initial={saved} />
            {!past && (
              <>
                <a href={googleCalendarUrl({ ...e, occurrenceStart: next.occurrenceStart, occurrenceEnd: next.occurrenceEnd }, url)} target="_blank" rel="noopener noreferrer" className="btn-secondary"><CalendarPlus className="h-4 w-4" aria-hidden /> Google Calendar</a>
                <a href={`${eventHref(e)}ics/`} className="btn-secondary" download><Download className="h-4 w-4" aria-hidden /> Apple / Outlook (.ics)</a>
              </>
            )}
          </div>

          {description && (
            <section aria-labelledby="about-event" className="mt-10">
              <h2 id="about-event" className="section-title">About this event</h2>
              <div className={`${PROSE_CLASSES} mt-4 max-w-[70ch] text-slate-800`} dangerouslySetInnerHTML={{ __html: description }} />
            </section>
          )}

          <ShareButtons url={url} title={e.title} className="mt-10 border-t border-slate-200 pt-6" />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Event details">
          <section aria-labelledby="details-title" className="card p-5">
            <h2 id="details-title" className="font-semibold text-navy-900">Event details</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex gap-3">
                <dt><CalendarDays className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Date</span></dt>
                <dd className="text-slate-700">{formatDate(next.occurrenceStart, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</dd>
              </div>
              <div className="flex gap-3">
                <dt><Clock className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Time</span></dt>
                <dd className="text-slate-700">{timeRange(next.occurrenceStart, next.occurrenceEnd, e.allDay)} <span className="text-slate-500">(Eastern)</span></dd>
              </div>
              {recurrence && (
                <div className="flex gap-3">
                  <dt><Repeat className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Repeats</span></dt>
                  <dd className="text-slate-700">{recurrence}</dd>
                </div>
              )}
              {where.length > 0 && (
                <div className="flex gap-3">
                  <dt><MapPin className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Location</span></dt>
                  <dd className="text-slate-700">
                    {e.locationName && <span className="block font-medium text-slate-900">{e.locationName}</span>}
                    {e.address && <span className="block">{e.address}</span>}
                    {e.city && <span className="block">{e.city}, OH</span>}
                    {mapUrl && <TrackedLink href={mapUrl} target="_blank" rel="noopener noreferrer" track={track("click_directions")} className="mt-1 inline-block font-semibold text-brand-700 hover:underline">View map &amp; directions</TrackedLink>}
                  </dd>
                </div>
              )}
              <div className="flex gap-3">
                <dt><Ticket className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Admission</span></dt>
                <dd className="text-slate-700">{e.isFree ? <span className="badge-green">Free</span> : e.price ? e.price : "Paid admission"}</dd>
              </div>
              {(e.organizer || business) && (
                <div className="flex gap-3">
                  <dt><UserRound className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Organizer</span></dt>
                  <dd className="text-slate-700">Hosted by {business ? <Link href={`/business/${business.slug}/`} className="font-semibold text-brand-700 hover:underline">{e.organizer || business.name}</Link> : e.organizer}</dd>
                </div>
              )}
            </dl>
          </section>

          {recurrence && upcoming.length > 1 && (
            <section aria-labelledby="dates-title" className="card p-5">
              <h2 id="dates-title" className="font-semibold text-navy-900">Upcoming dates</h2>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {upcoming.map((o) => (
                  <li key={o.occurrenceStart.toISOString()} className="flex justify-between gap-3 py-2">
                    <span className="text-slate-800">{formatDate(o.occurrenceStart, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <span className="text-slate-500">{e.allDay ? "All day" : formatTime(o.occurrenceStart)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {business && (
            <section aria-labelledby="host-title">
              <h2 id="host-title" className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">Hosted by</h2>
              <BusinessCard b={business} />
            </section>
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section aria-labelledby="more-events" className="container-page mt-16 border-t border-slate-200 pt-10">
          <h2 id="more-events" className="section-title">More {e.category ? e.category.name.toLowerCase() : "upcoming"} events</h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">{more.map((o) => <EventCard key={o.id} e={o} />)}</div>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Event",
          name: e.title,
          url,
          description: stripHtml(e.description) || undefined,
          image: e.imageUrl ? [absoluteUrl(e.imageUrl)] : undefined,
          startDate: next.occurrenceStart.toISOString(),
          endDate: next.occurrenceEnd?.toISOString(),
          eventStatus: "https://schema.org/EventScheduled",
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          location: {
            "@type": "Place",
            name: e.locationName || e.city || "Tuscarawas County, Ohio",
            address: { "@type": "PostalAddress", streetAddress: e.address || undefined, addressLocality: e.city || undefined, addressRegion: "OH", addressCountry: "US" },
          },
          organizer: e.organizer || business ? { "@type": "Organization", name: e.organizer || business!.name, url: business ? absoluteUrl(`/business/${business.slug}/`) : undefined } : undefined,
          isAccessibleForFree: e.isFree,
          offers: e.ticketUrl ? { "@type": "Offer", url: e.ticketUrl, availability: "https://schema.org/InStock", ...(e.isFree ? { price: 0, priceCurrency: "USD" } : {}) } : undefined,
        }}
      />
    </article>
  );
}

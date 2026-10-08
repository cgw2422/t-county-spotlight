import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Clock, Globe, Mail, MapPin, Megaphone, Navigation, Phone, Star } from "lucide-react";
import { db } from "@/lib/db";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { activePromotionWhere } from "@/lib/promotions";
import { articleCardSelect, eventCardSelect, publishedArticleWhere } from "@/lib/queries";
import { expandOccurrences, upcomingEventWhere } from "@/lib/events";
import { businessHref } from "@/lib/links";
import { absoluteUrl, cn, formatDate, stripHtml } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { EventCard } from "@/components/cards/event-card";
import { ArticleCard } from "@/components/cards/article-card";
import { SpecialCard } from "@/components/cards/special-card";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { SaveButton } from "@/components/public/save-button";
import { ShareButtons } from "@/components/public/share-buttons";
import { TrackView, TrackedLink } from "@/components/public/track";
import { buildMetadata } from "@/components/public/seo";
import { followRedirectIfAny, isFollowing, isSaved } from "@/components/public/server";
import { DAY_NAMES, format12, nyNow, openStatus, openingHoursSpec, parseHours } from "@/components/public/hours";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const SOCIAL_LABELS: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", x: "X (Twitter)", twitter: "X (Twitter)", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", pinterest: "Pinterest" };

function load(slug: string) {
  return db.business.findFirst({
    where: { slug: decodeURIComponent(slug).toLowerCase(), status: "PUBLISHED", deletedAt: null },
    include: {
      categories: { select: { id: true, name: true, slug: true }, orderBy: { sortOrder: "asc" } },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
}

function websiteUrl(w: string | null) {
  if (!w) return null;
  const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
  try { return new URL(url); } catch { return null; }
}

function safeSocials(raw: unknown) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v as string))
    .map(([k, v]) => ({ key: k, label: SOCIAL_LABELS[k.toLowerCase()] ?? k, url: v as string }));
}

function directionsUrl(b: { name: string; address: string | null; city: string | null; state: string | null; zip: string | null; latitude: number | null; longitude: number | null }) {
  const addr = [b.address, b.city, [b.state, b.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (addr && b.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${b.name}, ${addr}`)}`;
  if (b.latitude != null && b.longitude != null) return `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await load((await params).slug);
  if (!b) return {};
  const where = b.city ? `${b.city}, Ohio` : "Tuscarawas County, Ohio";
  return buildMetadata({
    title: b.seoTitle || `${b.name} — ${b.categories[0]?.name ? `${b.categories[0].name} in ` : ""}${where}`,
    description: b.seoDescription || b.tagline || stripHtml(b.description) || `${b.name} in ${where}: hours, contact information, specials and events.`,
    path: businessHref(b),
    image: b.coverUrl || b.logoUrl || b.photos[0]?.url,
    type: "profile",
    absoluteTitle: !!b.seoTitle,
  });
}

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;
  const b = await load(slug);
  if (!b) {
    const legacy = await db.business.findFirst({ where: { legacyPath: `/business/${slug}/`, status: "PUBLISHED", deletedAt: null }, select: { slug: true } });
    if (legacy) permanentRedirect(businessHref(legacy));
    await followRedirectIfAny(`/business/${slug}/`);
    notFound();
  }

  const now = new Date();
  const [articles, rawEvents, specials, updates, saved, following] = await Promise.all([
    db.article.findMany({ where: publishedArticleWhere({ businesses: { some: { businessId: b.id } } }), orderBy: { publishedAt: "desc" }, take: 6, select: articleCardSelect }),
    db.event.findMany({ where: { AND: [upcomingEventWhere(now), { businessId: b.id }] }, select: eventCardSelect, take: 50 }),
    db.promotion.findMany({
      where: { ...activePromotionWhere(now), businessId: b.id },
      orderBy: [{ isFeatured: "desc" }, { startsAt: "desc" }],
      select: { id: true, slug: true, title: true, imageUrl: true, endsAt: true, isFeatured: true, isSponsored: true, business: { select: { name: true, logoUrl: true, coverUrl: true } } },
    }),
    db.businessUpdate.findMany({ where: { businessId: b.id, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 5 }),
    isSaved("BUSINESS", b.id),
    isFollowing(b.id),
  ]);
  const seen = new Set<string>();
  const events = expandOccurrences(rawEvents, now, new Date(now.getTime() + 365 * 86400_000))
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    .slice(0, 6);

  const hours = parseHours(b.hours);
  const status = openStatus(hours, now);
  const today = nyNow(now).day;
  const site = websiteUrl(b.website);
  const directions = directionsUrl(b);
  const socials = safeSocials(b.socials);
  const tel = b.phone ? b.phone.replace(/[^\d+]/g, "") : null;
  const showEmail = b.emailPublic && b.email;
  const addressLine2 = [b.city, [b.state, b.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const url = absoluteUrl(businessHref(b));
  const cover = b.coverUrl || b.photos[0]?.url;
  const track = (type: string) => ({ type, businessId: b.id, targetType: "BUSINESS", targetId: b.id });
  const description = sanitizeRichText(b.description);
  const story = sanitizeRichText(b.story);

  return (
    <article>
      <TrackView {...track("view_business")} />
      {/* Cover */}
      <div className="relative h-48 bg-navy-900 sm:h-64 lg:h-80">
        {cover ? (
          <SmartImage src={cover} alt="" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(247,162,75,0.5),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(47,123,240,0.45),transparent_60%),linear-gradient(135deg,#0b1a33,#16325c_55%,#1e4277)]" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-950/10 to-transparent" />
      </div>

      <div className="container-page">
        <header className="relative">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="relative -mt-14 h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-white shadow-lg ring-4 ring-white sm:-mt-16 sm:h-32 sm:w-32">
              {b.logoUrl ? (
                <SmartImage src={b.logoUrl} alt={`${b.name} logo`} fill sizes="128px" className="object-contain p-1" />
              ) : (
                <span aria-hidden className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 to-brand-700 font-display text-5xl font-bold text-white">{b.name.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1 sm:pt-4">
              <Breadcrumbs items={[{ label: "Businesses", href: "/businesses/" }, ...(b.categories[0] ? [{ label: b.categories[0].name, href: `/businesses/?category=${b.categories[0].slug}` }] : []), { label: b.name }]} className="mb-2 hidden sm:block" />
              <div className="flex flex-wrap items-center gap-2">
                {b.isSpotlighted && <span className="badge bg-amber-100 text-amber-900 ring-1 ring-amber-300"><Star className="h-3 w-3 fill-current" aria-hidden /> Editorial Spotlight</span>}
                {status && <span className={status.open ? "badge-green" : "badge-gray"}><Clock className="h-3 w-3" aria-hidden /> {status.label}</span>}
              </div>
              <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{b.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-slate-600">
                {b.categories.map((c, i) => (
                  <span key={c.id}>{i > 0 && <span aria-hidden className="mr-2 text-slate-300">·</span>}<Link href={`/businesses/?category=${c.slug}`} className="hover:text-brand-700 hover:underline">{c.name}</Link></span>
                ))}
                {b.city && <span className="flex items-center gap-1">{b.categories.length > 0 && <span aria-hidden className="mr-1 text-slate-300">·</span>}<MapPin className="h-4 w-4" aria-hidden />{b.city}</span>}
              </p>
              {b.tagline && <p className="mt-2 max-w-2xl text-lg text-slate-700">{b.tagline}</p>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {tel && <TrackedLink href={`tel:${tel}`} track={track("click_phone")} className="btn-primary"><Phone className="h-4 w-4" aria-hidden /> Call</TrackedLink>}
            {site && <TrackedLink href={site.toString()} target="_blank" rel="noopener" track={track("click_website")} className="btn-secondary"><Globe className="h-4 w-4" aria-hidden /> Website</TrackedLink>}
            {directions && <TrackedLink href={directions} target="_blank" rel="noopener noreferrer" track={track("click_directions")} className="btn-secondary"><Navigation className="h-4 w-4" aria-hidden /> Directions</TrackedLink>}
            <SaveButton type="BUSINESS" targetId={b.id} initial={saved} className="w-full" />
            <SaveButton type="BUSINESS_FOLLOW" targetId={b.id} initial={following} className="w-full" />
          </div>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-12">
            {(description || story) && (
              <section aria-labelledby="about-title">
                <h2 id="about-title" className="section-title">About {b.name}</h2>
                {description && <div className={`${PROSE_CLASSES} mt-4 text-slate-800`} dangerouslySetInnerHTML={{ __html: description }} />}
                {story && (
                  <div className="mt-8 rounded-2xl bg-cream p-5 ring-1 ring-amber-200/60 sm:p-8">
                    <h3 className="font-display text-xl font-semibold text-navy-900">Our story</h3>
                    <div className={`${PROSE_CLASSES} mt-3 text-slate-800`} dangerouslySetInnerHTML={{ __html: story }} />
                  </div>
                )}
              </section>
            )}

            {updates.length > 0 && (
              <section aria-labelledby="updates-title">
                <h2 id="updates-title" className="section-title">Announcements</h2>
                <ul className="mt-4 space-y-4">
                  {updates.map((u) => (
                    <li key={u.id} className="card overflow-hidden sm:flex">
                      {u.imageUrl && (
                        <div className="relative aspect-[16/9] shrink-0 bg-slate-100 sm:aspect-auto sm:w-48">
                          <SmartImage src={u.imageUrl} alt="" fill sizes="(min-width:640px) 192px, 100vw" className="object-cover" />
                        </div>
                      )}
                      <div className="p-5">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700"><Megaphone className="h-3.5 w-3.5" aria-hidden /> <time dateTime={u.createdAt.toISOString()}>{formatDate(u.createdAt)}</time></p>
                        <h3 className="mt-1 font-semibold text-navy-900">{u.title}</h3>
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{stripHtml(u.body)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {specials.length > 0 && (
              <section aria-labelledby="specials-title">
                <h2 id="specials-title" className="section-title">Current specials</h2>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{specials.map((p) => <SpecialCard key={p.id} p={p} />)}</div>
              </section>
            )}

            {events.length > 0 && (
              <section aria-labelledby="events-title">
                <h2 id="events-title" className="section-title">Upcoming events</h2>
                <div className="mt-4 grid grid-cols-1 gap-3">{events.map((e) => <EventCard key={e.id} e={e} layout="row" />)}</div>
              </section>
            )}

            {b.photos.length > 0 && (
              <section aria-labelledby="photos-title">
                <h2 id="photos-title" className="section-title">Photos</h2>
                <div className="mt-4"><PhotoGallery photos={b.photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt, caption: p.caption }))} name={b.name} /></div>
              </section>
            )}

            {articles.length > 0 && (
              <section aria-labelledby="stories-title">
                <h2 id="stories-title" className="section-title">In the spotlight</h2>
                <p className="mt-1 text-slate-600">Stories from TCountySpotlight featuring {b.name}.</p>
                <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">{articles.map((a) => <ArticleCard key={a.id} a={a} />)}</div>
              </section>
            )}

            <ShareButtons url={url} title={b.name} />
          </div>

          <aside className="order-first space-y-6 lg:order-none lg:sticky lg:top-24 lg:self-start" aria-label="Business details">
            {hours.length > 0 && (
              <section aria-labelledby="hours-title" className="card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 id="hours-title" className="font-semibold text-navy-900">Hours</h2>
                  {status && <span className={cn("text-sm font-semibold", status.open ? "text-emerald-700" : "text-slate-500")}>{status.open ? "Open now" : "Closed now"}</span>}
                </div>
                <table className="mt-3 w-full text-sm">
                  <caption className="sr-only">Opening hours (Eastern Time)</caption>
                  <tbody>
                    {hours.map((h) => (
                      <tr key={h.day} className={cn(h.day === today && "font-semibold text-navy-900")}>
                        <th scope="row" className="py-1.5 pr-3 text-left font-[inherit]">{DAY_NAMES[h.day]}{h.day === today && <span className="sr-only"> (today)</span>}</th>
                        <td className="py-1.5 text-right text-slate-700">{h.closed ? "Closed" : `${format12(h.open)} – ${format12(h.close)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section aria-labelledby="contact-title" className="card p-5">
              <h2 id="contact-title" className="font-semibold text-navy-900">Contact &amp; location</h2>
              <ul className="mt-3 space-y-3 text-sm">
                {(b.address || addressLine2) && (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <address className="not-italic text-slate-700">
                      {b.address && <>{b.address}<br /></>}{addressLine2}
                      {directions && <><br /><TrackedLink href={directions} target="_blank" rel="noopener noreferrer" track={track("click_directions")} className="font-semibold text-brand-700 hover:underline">Get directions</TrackedLink></>}
                    </address>
                  </li>
                )}
                {b.phone && tel && (
                  <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><TrackedLink href={`tel:${tel}`} track={track("click_phone")} className="text-slate-700 hover:text-brand-700">{b.phone}</TrackedLink></li>
                )}
                {site && (
                  <li className="flex min-w-0 gap-3"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><TrackedLink href={site.toString()} target="_blank" rel="noopener" track={track("click_website")} className="truncate text-brand-700 hover:underline">{site.hostname.replace(/^www\./, "")}</TrackedLink></li>
                )}
                {showEmail && (
                  <li className="flex min-w-0 gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /><a href={`mailto:${b.email}`} className="truncate text-brand-700 hover:underline">{b.email}</a></li>
                )}
              </ul>
              {!b.address && !b.phone && !site && !showEmail && <p className="mt-2 text-sm text-slate-500">Contact details haven&rsquo;t been added yet.</p>}
              {socials.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {socials.map((s) => (
                    <li key={s.key}><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center rounded-full bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200">{s.label}</a></li>
                  ))}
                </ul>
              )}
            </section>

            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
              <p className="font-semibold text-navy-900">Is this your business?</p>
              <p className="mt-1">Claim your listing to update details, post specials and share announcements.</p>
              <Link href={`/list-your-business/?claim=${encodeURIComponent(b.slug)}`} className="mt-3 inline-flex font-semibold text-brand-700 hover:underline">Claim this listing →</Link>
            </div>
          </aside>
        </div>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "@id": `${url}#business`,
          name: b.name,
          url,
          description: stripHtml(b.tagline || b.description) || undefined,
          image: [b.coverUrl, ...b.photos.map((p) => p.url)].filter(Boolean).slice(0, 5).map((u) => absoluteUrl(u!)),
          logo: b.logoUrl ? absoluteUrl(b.logoUrl) : undefined,
          telephone: b.phone || undefined,
          email: showEmail ? b.email : undefined,
          address: b.address || b.city ? {
            "@type": "PostalAddress",
            streetAddress: b.address || undefined,
            addressLocality: b.city || undefined,
            addressRegion: b.state || "OH",
            postalCode: b.zip || undefined,
            addressCountry: "US",
          } : undefined,
          geo: b.latitude != null && b.longitude != null ? { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude } : undefined,
          openingHoursSpecification: hours.length ? openingHoursSpec(hours) : undefined,
          sameAs: [...(site ? [site.toString()] : []), ...socials.map((s) => s.url)],
        }}
      />
    </article>
  );
}

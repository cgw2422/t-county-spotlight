import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Accessibility, Clock, ExternalLink, Globe, HeartHandshake, MonitorPlay, Navigation, Phone, Users } from "lucide-react";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { absoluteUrl, cn, stripHtml } from "@/lib/utils";
import { SERVICE_DAY_NAMES, directionsUrl, externalUrl, format12, nextService, orgHref, readLeaders, readServiceTimes, safeSocials, type ServiceTime } from "@/lib/gives/constants";
import { loadOrgActivity, loadPublicOrg } from "@/lib/gives/public";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { ShareButtons } from "@/components/public/share-buttons";
import { buildMetadata } from "@/components/public/seo";
import { ActivitySections, ContactCard, DonateCard, ProfileHeader } from "@/components/gives/profile-sections";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const SCHEMA_DAY: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await loadPublicOrg((await params).slug);
  if (!o) return {};
  const where = o.city ? `${o.city}, Ohio` : "Tuscarawas County, Ohio";
  const times = readServiceTimes(o.serviceTimes).filter((t) => t.day === "Sun").map((t) => format12(t.time));
  return buildMetadata({
    title: o.seoTitle || `${o.name} — ${o.denomination ? `${o.denomination} church in ` : "Church in "}${where}`,
    description: o.seoDescription || `${o.name} in ${where}.${times.length ? ` Sunday services at ${times.join(", ")}.` : ""} ${o.tagline || o.mission || stripHtml(o.description) || "Service times, ministries and how to plan your visit."}`,
    path: orgHref(o),
    image: o.coverUrl || o.logoUrl,
    type: "profile",
    absoluteTitle: !!o.seoTitle,
  });
}

function ScheduleTable({ rows, caption }: { rows: ServiceTime[]; caption: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{caption}</caption>
      <tbody className="divide-y divide-slate-100">
        {rows.map((t, i) => (
          <tr key={i}>
            <th scope="row" className="py-2 pr-3 text-left font-semibold text-navy-900">{SERVICE_DAY_NAMES[t.day]}</th>
            <td className="py-2 pr-3 tabular-nums text-slate-800">{format12(t.time)}</td>
            <td className="py-2 text-right text-slate-600">{t.label}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function ChurchPage({ params }: Props) {
  const { slug } = await params;
  const o = await loadPublicOrg(slug);
  if (!o) notFound();
  if (o.kind !== "CHURCH") permanentRedirect(orgHref(o));
  const a = await loadOrgActivity(o.id);
  const url = absoluteUrl(orgHref(o));
  const times = readServiceTimes(o.serviceTimes);
  const sunday = times.filter((t) => t.day === "Sun");
  const midweek = times.filter((t) => t.day !== "Sun");
  const next = nextService(times);
  const leaders = readLeaders(o.leadership);
  const description = sanitizeRichText(o.description);
  const impact = sanitizeRichText(o.impact);
  const visit = sanitizeRichText(o.planYourVisit);
  const live = externalUrl(o.livestreamUrl);
  const site = externalUrl(o.website);
  const donate = externalUrl(o.donationUrl);
  const directions = directionsUrl(o);
  const tel = o.phone ? o.phone.replace(/[^\d+]/g, "") : null;
  const socials = safeSocials(o.socials);
  const hasOutreach = a.needs.length + a.wishList.length + a.opps.length + a.updates.length > 0 || !!impact;
  const crumbs = <Breadcrumbs items={[{ label: "Churches", href: "/churches/" }, { label: o.name }]} />;


  return (
    <article>
      <ProfileHeader o={o} crumbs={crumbs}>
        {directions && <a href={directions} target="_blank" rel="noopener noreferrer" className="btn-primary"><Navigation className="h-4 w-4" aria-hidden /> Directions</a>}
        {live && <a href={live.toString()} target="_blank" rel="noopener noreferrer" className="btn-secondary"><MonitorPlay className="h-4 w-4" aria-hidden /> Watch live</a>}
        {tel && <a href={`tel:${tel}`} className="btn-secondary"><Phone className="h-4 w-4" aria-hidden /> Call</a>}
        {site && <a href={site.toString()} target="_blank" rel="noopener" className="btn-secondary"><Globe className="h-4 w-4" aria-hidden /> Website</a>}
        {donate && <a href={donate.toString()} target="_blank" rel="noopener noreferrer" className="btn-accent"><HeartHandshake className="h-4 w-4" aria-hidden /> Give <ExternalLink className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">(external site)</span></a>}
      </ProfileHeader>

      <div className="container-page">
        <div className="mt-10 grid grid-cols-1 gap-10 pb-12 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-12">
            {times.length > 0 && (
              <section aria-labelledby="services-title" className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="services-title" className="flex items-center gap-2 font-display text-2xl font-semibold text-navy-900"><Clock className="h-6 w-6 text-sunset-500" aria-hidden /> Service times</h2>
                  {next && <span className="badge-green">Next: {next.when} at {next.label12}</span>}
                </div>
                <div className={cn("mt-4 grid gap-6", sunday.length > 0 && midweek.length > 0 && "sm:grid-cols-2")}>
                  {sunday.length > 0 && <ScheduleTable rows={sunday} caption="Sunday" />}
                  {midweek.length > 0 && <ScheduleTable rows={midweek} caption="Midweek & other days" />}
                </div>
                {live && <p className="mt-4 text-sm text-slate-600">Can&apos;t make it in person? <a href={live.toString()} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 hover:underline">Watch the livestream</a>.</p>}
                <p className="mt-2 text-xs text-slate-500">Times are Eastern Time and provided by the church. Holiday schedules may differ.</p>
              </section>
            )}

            {(o.mission || description) && (
              <section aria-labelledby="about-title">
                <h2 id="about-title" className="section-title">About {o.name}</h2>
                {o.mission && <p className="mt-4 font-display text-xl leading-snug text-navy-900">{o.mission}</p>}
                {description && <div className={`${PROSE_CLASSES} mt-4 text-slate-800`} dangerouslySetInnerHTML={{ __html: description }} />}
              </section>
            )}

            {(visit || o.accessibility) && (
              <section aria-labelledby="visit-title" className="rounded-2xl bg-cream p-5 ring-1 ring-amber-200/60 sm:p-8">
                <h2 id="visit-title" className="section-title">Plan your visit</h2>
                {visit && <div className={`${PROSE_CLASSES} mt-3 text-slate-800`} dangerouslySetInnerHTML={{ __html: visit }} />}
                {o.accessibility && (
                  <div className="mt-5 flex gap-3 rounded-xl bg-white p-4 ring-1 ring-amber-200/60">
                    <Accessibility className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                    <div><p className="font-semibold text-navy-900">Accessibility</p><p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{o.accessibility}</p></div>
                  </div>
                )}
              </section>
            )}

            {o.ministries.length > 0 && (
              <section aria-labelledby="ministries-title">
                <h2 id="ministries-title" className="section-title">Ministries</h2>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {o.ministries.map((m) => <li key={m} className="rounded-full bg-violet-50 px-3.5 py-1.5 text-sm font-medium text-violet-800 ring-1 ring-violet-200">{m}</li>)}
                </ul>
              </section>
            )}

            {hasOutreach && (
              <div className="space-y-12">
                <div>
                  <p className="eyebrow">Community outreach</p>
                  <h2 className="section-title mt-1">How {o.name} serves the community</h2>
                  {impact && <div className={`${PROSE_CLASSES} mt-4 text-slate-800`} dangerouslySetInnerHTML={{ __html: impact }} />}
                </div>
                <ActivitySections o={o} a={{ ...a, events: [] }} headings={{ needs: "Outreach needs", volunteer: "Serve with us" }} />
              </div>
            )}

            {a.events.length > 0 && <ActivitySections o={{ ...o, wishlistUrl: null }} a={{ ...a, needs: [], wishList: [], opps: [], updates: [] }} />}
            <ShareButtons url={url} title={o.name} />
          </div>

          <aside className="order-first space-y-6 lg:order-none lg:sticky lg:top-24 lg:self-start" aria-label="Church details">
            <ContactCard o={o} />
            {leaders.length > 0 && (
              <section aria-labelledby="leaders-title" className="card p-5">
                <h2 id="leaders-title" className="flex items-center gap-2 font-semibold text-navy-900"><Users className="h-4 w-4 text-slate-400" aria-hidden /> Pastor &amp; leadership</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {leaders.map((l, i) => <li key={i}><span className="font-semibold text-navy-900">{l.name}</span>{l.role && <span className="block text-slate-500">{l.role}</span>}</li>)}
                </ul>
              </section>
            )}
            <DonateCard o={o} />
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
              <p className="font-semibold text-navy-900">Find a church near you</p>
              <p className="mt-1">Browse congregations across Tuscarawas County by town, denomination and service day.</p>
              <Link href="/churches/" className="mt-3 inline-flex font-semibold text-brand-700 hover:underline">All churches →</Link>
            </div>
          </aside>
        </div>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": ["Church", "PlaceOfWorship"],
          "@id": `${url}#church`,
          name: o.name,
          url,
          description: stripHtml(o.mission || o.tagline || o.description) || undefined,
          logo: o.logoUrl ? absoluteUrl(o.logoUrl) : undefined,
          image: o.coverUrl ? absoluteUrl(o.coverUrl) : undefined,
          telephone: o.phone || undefined,
          email: o.emailPublic && o.email ? o.email : undefined,
          address: o.address || o.city ? { "@type": "PostalAddress", streetAddress: o.address || undefined, addressLocality: o.city || undefined, addressRegion: o.state || "OH", postalCode: o.zip || undefined, addressCountry: "US" } : undefined,
          openingHoursSpecification: times.length ? times.map((t) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${SCHEMA_DAY[t.day]}`, opens: t.time, name: t.label || undefined })) : undefined,
          sameAs: [...(site ? [site.toString()] : []), ...(live ? [live.toString()] : []), ...socials.map((s) => s.url)],
        }}
      />
    </article>
  );
}


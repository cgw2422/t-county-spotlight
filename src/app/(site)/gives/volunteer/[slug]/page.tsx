import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ClipboardCheck, ExternalLink, MapPin, Navigation, UserRound, UsersRound } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { absoluteUrl, formatDate, formatTime, stripHtml } from "@/lib/utils";
import { externalUrl, mapsUrl, opportunityHref, orgHref } from "@/lib/gives/constants";
import { activeSignupCounts, openOpportunityWhere, publicOrgWhere, spotsLeft } from "@/lib/gives/queries";
import { KindBadge, VerifiedBadge } from "@/components/gives/badges";
import { VolunteerSignupForm } from "@/components/gives/public-forms";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { ShareButtons } from "@/components/public/share-buttons";
import { buildMetadata } from "@/components/public/seo";
import { SmartImage } from "@/components/ui/smart-image";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch {}
  return db.volunteerOpportunity.findFirst({
    where: { slug: s.toLowerCase(), deletedAt: null, status: { not: "DRAFT" }, organization: publicOrgWhere() },
    include: { organization: { select: { id: true, slug: true, name: true, kind: true, city: true, logoUrl: true, verifiedAt: true, email: true, emailPublic: true, phone: true } } },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await load((await params).slug);
  if (!o) return {};
  return buildMetadata({
    title: `Volunteer: ${o.title} — ${o.organization.name}`,
    description: stripHtml(o.description) || `Volunteer with ${o.organization.name} in Tuscarawas County. Sign up on T-County Gives.`,
    path: opportunityHref(o),
    image: o.organization.logoUrl,
    noindex: o.status !== "PUBLISHED",
  });
}

export default async function VolunteerPage({ params }: Props) {
  const { slug } = await params;
  const v = await load(slug);
  if (!v) notFound();
  const [isOpen, counts, user] = await Promise.all([
    db.volunteerOpportunity.count({ where: openOpportunityWhere({ id: v.id }) }),
    activeSignupCounts([v.id]),
    getCurrentUser(),
  ]);
  const org = v.organization;
  const left = spotsLeft(v.spots, counts.get(v.id) ?? 0);
  const ext = externalUrl(v.externalSignupUrl);
  const description = sanitizeRichText(v.description);
  const where = [v.locationName, v.address, v.city].filter(Boolean).join(", ");
  const url = absoluteUrl(opportunityHref(v));
  const accepting = isOpen > 0 && v.status === "PUBLISHED";
  const sameDay = v.startAt && v.endAt && formatDate(v.startAt) === formatDate(v.endAt);
  const when = v.isOngoing
    ? "Ongoing — flexible schedule"
    : v.startAt
      ? `${formatDate(v.startAt, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · ${formatTime(v.startAt)}${v.endAt ? ` – ${sameDay ? formatTime(v.endAt) : `${formatDate(v.endAt, { month: "short", day: "numeric" })}, ${formatTime(v.endAt)}`}` : ""}`
      : "Date to be announced";

  return (
    <article className="container-page py-6 sm:py-10">
      <Breadcrumbs items={[{ label: "T-County Gives", href: "/gives/" }, { label: "Volunteer", href: "/gives/volunteer/" }, { label: v.title }]} className="mb-5" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <header>
            <p className="eyebrow">Volunteer opportunity</p>
            <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{v.title}</h1>
            <Link href={orgHref(org)} className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 hover:ring-brand-300">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-navy-800">
                {org.logoUrl ? <SmartImage src={org.logoUrl} alt="" fill sizes="48px" className="bg-white object-contain" /> : <span className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-white">{org.name[0]}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold text-navy-900">{org.name} {org.verifiedAt && <VerifiedBadge />}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500"><KindBadge kind={org.kind} />{org.city}</span>
              </span>
            </Link>
          </header>

          <dl className="card grid gap-4 p-5 text-sm sm:grid-cols-2 sm:p-6">
            <div className="flex gap-3"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden /><div><dt className="text-slate-500">When</dt><dd className="font-semibold text-navy-900">{when}</dd></div></div>
            {where && (
              <div className="flex gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden /><div><dt className="text-slate-500">Where</dt><dd className="font-semibold text-navy-900">{where}</dd><dd><a href={mapsUrl(where + (v.city ? ", OH" : ""))} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><Navigation className="h-3.5 w-3.5" aria-hidden /> Directions</a></dd></div></div>
            )}
            {v.spots != null && (
              <div className="flex gap-3"><UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden /><div><dt className="text-slate-500">Spots</dt><dd className="font-semibold text-navy-900">{left! > 0 ? `${left} of ${v.spots} left` : `All ${v.spots} spots filled — waitlist open`}</dd></div></div>
            )}
            {(v.minAge != null || v.ageNotes) && (
              <div className="flex gap-3"><UserRound className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden /><div><dt className="text-slate-500">Age</dt><dd className="font-semibold text-navy-900">{v.minAge != null ? `${v.minAge} and older` : "All ages"}</dd>{v.ageNotes && <dd className="text-slate-600">{v.ageNotes}</dd>}</div></div>
            )}
          </dl>

          {description && (
            <section aria-labelledby="what-title">
              <h2 id="what-title" className="section-title">What you&apos;ll do</h2>
              <div className={`${PROSE_CLASSES} mt-3 text-slate-800`} dangerouslySetInnerHTML={{ __html: description }} />
            </section>
          )}
          {v.requirements && (
            <section aria-labelledby="req-title" className="rounded-2xl bg-cream p-5 ring-1 ring-amber-200/60 sm:p-6">
              <h2 id="req-title" className="flex items-center gap-2 font-display text-xl font-semibold text-navy-900"><ClipboardCheck className="h-5 w-5 text-sunset-600" aria-hidden /> Requirements</h2>
              <p className="mt-2 whitespace-pre-line text-slate-800">{v.requirements}</p>
            </section>
          )}
          <ShareButtons url={url} title={`Volunteer with ${org.name}: ${v.title}`} />
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-labelledby="signup-title">
          <div className="card p-5 sm:p-6">
            {!accepting ? (
              <div className="text-center">
                <h2 id="signup-title" className="font-display text-xl font-semibold text-navy-900">{v.status === "CANCELLED" ? "This opportunity was cancelled" : "Sign-ups are closed"}</h2>
                <p className="mt-2 text-sm text-slate-600">Find other ways to help with {org.name} and organizations across T-County.</p>
                <div className="mt-4 grid gap-2"><Link href={orgHref(org)} className="btn-primary">Visit {org.name}</Link><Link href="/gives/volunteer/" className="btn-secondary">More opportunities</Link></div>
              </div>
            ) : ext ? (
              <>
                <h2 id="signup-title" className="font-display text-2xl font-semibold text-navy-900">Sign up</h2>
                <p className="mt-1 text-sm text-slate-600">{org.name} takes sign-ups on their own website.</p>
                <a href={ext.toString()} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 min-h-12 w-full text-base">Sign up on {ext.hostname.replace(/^www\./, "")} <ExternalLink className="h-4 w-4" aria-hidden /></a>
              </>
            ) : !v.registrationOpen ? (
              <div className="text-center">
                <h2 id="signup-title" className="font-display text-xl font-semibold text-navy-900">Sign-ups are closed</h2>
                <p className="mt-2 text-sm text-slate-600">Contact {org.name} to ask about helping.</p>
                <Link href={orgHref(org)} className="btn-primary mt-4 w-full">Visit {org.name}</Link>
              </div>
            ) : (
              <>
                <h2 id="signup-title" className="font-display text-2xl font-semibold text-navy-900">{left === 0 ? "Join the waitlist" : "Sign up to help"}</h2>
                <p className="mt-1 mb-5 text-sm text-slate-600">We&apos;ll email you a confirmation with all the details.</p>
                <VolunteerSignupForm oppId={v.id} minAge={v.minAge} prefill={{ name: user?.name, email: user?.email }} full={left === 0} />
              </>
            )}
          </div>
        </aside>
      </div>
      {v.startAt && !v.isOngoing && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Event",
            name: `Volunteer: ${v.title}`,
            startDate: v.startAt.toISOString(),
            endDate: v.endAt?.toISOString(),
            eventStatus: v.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
            eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
            location: where ? { "@type": "Place", name: v.locationName || org.name, address: [v.address, v.city, "OH"].filter(Boolean).join(", ") } : undefined,
            organizer: { "@type": "Organization", name: org.name, url: absoluteUrl(orgHref(org)) },
            isAccessibleForFree: true,
            url,
            description: stripHtml(v.description) || undefined,
          }}
        />
      )}
    </article>
  );
}

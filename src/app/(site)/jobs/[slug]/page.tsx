import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, Clock, DollarSign, Mail, MapPin, Send } from "lucide-react";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { businessHref, jobHref } from "@/lib/links";
import { absoluteUrl, formatDate, stripHtml } from "@/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { RichOrPlain } from "@/components/public/rich-text";
import { ShareButtons } from "@/components/public/share-buttons";
import { TrackView, TrackedLink } from "@/components/public/track";
import { buildMetadata } from "@/components/public/seo";
import { followRedirectIfAny } from "@/components/public/server";
import { openJobWhere } from "../data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

function load(slug: string) {
  let s = slug;
  try { s = decodeURIComponent(slug); } catch {}
  return db.job.findFirst({
    where: openJobWhere({ slug: s.toLowerCase() }),
    include: { business: { select: { id: true, slug: true, name: true, logoUrl: true, city: true, address: true, website: true } } },
  });
}

const EMPLOYMENT_TYPES: Record<string, string> = { "full-time": "FULL_TIME", "full time": "FULL_TIME", "part-time": "PART_TIME", "part time": "PART_TIME", seasonal: "TEMPORARY", temporary: "TEMPORARY", contract: "CONTRACTOR", internship: "INTERN", volunteer: "VOLUNTEER" };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const j = await load((await params).slug);
  if (!j) return {};
  const employer = j.business?.name || j.employerName;
  return buildMetadata({
    title: `${j.title}${employer ? ` at ${employer}` : ""}`,
    description: stripHtml(j.description) || `${j.title}${employer ? ` at ${employer}` : ""} — ${j.location || "Tuscarawas County, Ohio"}.`,
    path: jobHref(j),
    image: j.business?.logoUrl,
  });
}

export default async function JobPage({ params }: Props) {
  const { slug } = await params;
  const j = await load(slug);
  if (!j) {
    await followRedirectIfAny(`/jobs/${slug}/`);
    notFound();
  }
  const settings = await getSettings();
  const employer = j.business?.name || j.employerName;
  const url = absoluteUrl(jobHref(j));
  const apply = j.applyUrl && /^https?:\/\//i.test(j.applyUrl) ? j.applyUrl : null;
  const applyEmail = j.applyEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(j.applyEmail) ? j.applyEmail : null;
  const location = j.location || j.business?.city;
  const empType = j.employmentType ? EMPLOYMENT_TYPES[j.employmentType.toLowerCase()] : undefined;

  return (
    <article className="pb-8">
      <TrackView type="view_job" businessId={j.business?.id} targetType="JOB" targetId={j.id} />
      <div className="container-page pt-6 sm:pt-8">
        <Breadcrumbs items={[{ label: "Jobs", href: "/jobs/" }, { label: j.title }]} />
      </div>
      <div className="container-page mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_340px] lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {j.isSponsored && <span className="badge-sponsored">{settings.sponsoredLabel}</span>}
            {j.employmentType && <span className="badge-blue">{j.employmentType}</span>}
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-4xl">{j.title}</h1>
          {employer && <p className="mt-2 text-lg text-slate-600">{j.business ? <Link href={businessHref(j.business)} className="font-semibold text-brand-700 hover:underline">{employer}</Link> : employer}</p>}
          <div className="mt-8 max-w-[70ch]">
            {j.description ? <RichOrPlain text={j.description} /> : <p className="text-slate-600">Contact the employer for full details about this position.</p>}
          </div>
          <ShareButtons url={url} title={`${j.title}${employer ? ` at ${employer}` : ""}`} className="mt-10 border-t border-slate-200 pt-6" />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start" aria-label="Job details">
          <div className="card p-5">
            <dl className="space-y-3 text-sm">
              {location && <div className="flex gap-3"><dt><MapPin className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Location</span></dt><dd className="text-slate-700">{location}</dd></div>}
              {j.employmentType && <div className="flex gap-3"><dt><Clock className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Type</span></dt><dd className="text-slate-700">{j.employmentType}</dd></div>}
              {j.payRange && <div className="flex gap-3"><dt><DollarSign className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Pay</span></dt><dd className="text-slate-700">{j.payRange}</dd></div>}
              <div className="flex gap-3"><dt><CalendarDays className="h-5 w-5 text-slate-400" aria-hidden /><span className="sr-only">Posted</span></dt><dd className="text-slate-700">Posted {formatDate(j.createdAt)}{j.expiresAt && <><br /><span className="text-slate-500">Apply by {formatDate(j.expiresAt)}</span></>}</dd></div>
            </dl>
            <div className="mt-5 grid grid-cols-1 gap-2 border-t border-slate-100 pt-5">
              {apply && <TrackedLink href={apply} target="_blank" rel="noopener" track={{ type: "click_apply", businessId: j.business?.id, targetType: "JOB", targetId: j.id }} className="btn-primary w-full"><Send className="h-4 w-4" aria-hidden /> Apply now</TrackedLink>}
              {applyEmail && <a href={`mailto:${applyEmail}?subject=${encodeURIComponent(`Application: ${j.title}`)}`} className={apply ? "btn-secondary w-full" : "btn-primary w-full"}><Mail className="h-4 w-4" aria-hidden /> Apply by email</a>}
              {!apply && !applyEmail && j.business && <Link href={businessHref(j.business)} className="btn-primary w-full">Contact the employer</Link>}
            </div>
          </div>
          {j.business && (
            <Link href={businessHref(j.business)} className="card card-hover group flex items-center gap-4 p-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {j.business.logoUrl ? <SmartImage src={j.business.logoUrl} alt="" fill sizes="56px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-slate-400"><Building2 className="h-6 w-6" aria-hidden /></span>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-navy-900 group-hover:text-brand-700">{j.business.name}</p>
                <p className="text-sm text-slate-500">View business profile →</p>
              </div>
            </Link>
          )}
        </aside>
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: j.title,
          description: j.description || j.title,
          datePosted: j.createdAt.toISOString(),
          validThrough: j.expiresAt?.toISOString(),
          employmentType: empType,
          hiringOrganization: employer ? { "@type": "Organization", name: employer, sameAs: j.business?.website || undefined, logo: j.business?.logoUrl ? absoluteUrl(j.business.logoUrl) : undefined } : undefined,
          jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", streetAddress: j.business?.address || undefined, addressLocality: location || "Tuscarawas County", addressRegion: "OH", addressCountry: "US" } },
          url,
        }}
      />
    </article>
  );
}

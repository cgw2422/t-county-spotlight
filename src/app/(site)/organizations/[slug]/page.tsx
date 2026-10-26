import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ExternalLink, Globe, HandHelping, HeartHandshake, Navigation, Phone } from "lucide-react";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { absoluteUrl, stripHtml } from "@/lib/utils";
import { directionsUrl, externalUrl, orgHref, safeSocials } from "@/lib/gives/constants";
import { loadOrgActivity, loadPublicOrg } from "@/lib/gives/public";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { ShareButtons } from "@/components/public/share-buttons";
import { buildMetadata } from "@/components/public/seo";
import { ActivitySections, ContactCard, DonateCard, ProfileHeader } from "@/components/gives/profile-sections";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const o = await loadPublicOrg((await params).slug);
  if (!o) return {};
  const where = o.city ? `${o.city}, Ohio` : "Tuscarawas County, Ohio";
  return buildMetadata({
    title: o.seoTitle || `${o.name} — ${o.orgType ? `${o.orgType} in ` : ""}${where}`,
    description: o.seoDescription || o.tagline || o.mission || stripHtml(o.description) || `${o.name} in ${where}: current needs, volunteer opportunities and how to help.`,
    path: orgHref(o),
    image: o.coverUrl || o.logoUrl,
    type: "profile",
    absoluteTitle: !!o.seoTitle,
  });
}

export default async function OrganizationPage({ params }: Props) {
  const { slug } = await params;
  const o = await loadPublicOrg(slug);
  if (!o) notFound();
  if (o.kind === "CHURCH") permanentRedirect(orgHref(o));
  const a = await loadOrgActivity(o.id);
  const url = absoluteUrl(orgHref(o));
  const description = sanitizeRichText(o.description);
  const impact = sanitizeRichText(o.impact);
  const donate = externalUrl(o.donationUrl);
  const site = externalUrl(o.website);
  const directions = directionsUrl(o);
  const tel = o.phone ? o.phone.replace(/[^\d+]/g, "") : null;
  const socials = safeSocials(o.socials);
  const crumbs = <Breadcrumbs items={[{ label: "T-County Gives", href: "/gives/" }, { label: "Organizations", href: "/gives/organizations/" }, { label: o.name }]} />;

  return (
    <article>
      <ProfileHeader o={o} crumbs={crumbs}>
        {donate && <a href={donate.toString()} target="_blank" rel="noopener noreferrer" className="btn-accent col-span-2 min-h-12 text-base sm:col-span-1"><HeartHandshake className="h-5 w-5" aria-hidden /> Donate <ExternalLink className="h-4 w-4" aria-hidden /><span className="sr-only">(external site, opens in a new tab)</span></a>}
        {(a.needs.length > 0 || a.wishList.length > 0) && <a href="#needs-title" className="btn-primary"><HandHelping className="h-4 w-4" aria-hidden /> See needs</a>}
        {a.opps.length > 0 && <a href="#vol-title" className="btn-secondary">Volunteer</a>}
        {tel && <a href={`tel:${tel}`} className="btn-secondary"><Phone className="h-4 w-4" aria-hidden /> Call</a>}
        {site && <a href={site.toString()} target="_blank" rel="noopener" className="btn-secondary"><Globe className="h-4 w-4" aria-hidden /> Website</a>}
        {directions && <a href={directions} target="_blank" rel="noopener noreferrer" className="btn-secondary"><Navigation className="h-4 w-4" aria-hidden /> Directions</a>}
      </ProfileHeader>

      <div className="container-page">
        <div className="mt-10 grid grid-cols-1 gap-10 pb-12 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-12">
            {(o.mission || description) && (
              <section aria-labelledby="about-title">
                <h2 id="about-title" className="section-title">About {o.name}</h2>
                {o.mission && (
                  <blockquote className="mt-4 rounded-2xl bg-cream p-5 ring-1 ring-amber-200/60 sm:p-6">
                    <p className="text-xs font-bold uppercase tracking-wider text-sunset-600">Our mission</p>
                    <p className="mt-2 font-display text-xl leading-snug text-navy-900">{o.mission}</p>
                  </blockquote>
                )}
                {description && <div className={`${PROSE_CLASSES} mt-6 text-slate-800`} dangerouslySetInnerHTML={{ __html: description }} />}
              </section>
            )}
            {impact && (
              <section aria-labelledby="impact-title">
                <h2 id="impact-title" className="section-title">Our impact</h2>
                <div className={`${PROSE_CLASSES} mt-4 text-slate-800`} dangerouslySetInnerHTML={{ __html: impact }} />
              </section>
            )}
            <ActivitySections o={o} a={a} />
            {!o.mission && !description && !impact && !a.needs.length && !a.opps.length && !a.events.length && !a.updates.length && (
              <p className="rounded-2xl bg-slate-50 p-6 text-slate-600 ring-1 ring-slate-200">{o.name} hasn&apos;t shared more details yet. Check back soon.</p>
            )}
            <ShareButtons url={url} title={o.name} />
          </div>
          <aside className="order-first space-y-6 lg:order-none lg:sticky lg:top-24 lg:self-start" aria-label="Organization details">
            <DonateCard o={o} />
            <ContactCard o={o} />
            <div className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600 ring-1 ring-slate-200">
              <p className="font-semibold text-navy-900">Part of T-County Gives</p>
              <p className="mt-1">Find more ways to help nonprofits, churches and community groups across Tuscarawas County.</p>
              <Link href="/gives/" className="mt-3 inline-flex font-semibold text-brand-700 hover:underline">Explore T-County Gives →</Link>
            </div>
          </aside>
        </div>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": o.kind === "NONPROFIT" ? "NGO" : "Organization",
          "@id": `${url}#org`,
          name: o.name,
          url,
          description: stripHtml(o.mission || o.tagline || o.description) || undefined,
          logo: o.logoUrl ? absoluteUrl(o.logoUrl) : undefined,
          image: o.coverUrl ? absoluteUrl(o.coverUrl) : undefined,
          telephone: o.phone || undefined,
          email: o.emailPublic && o.email ? o.email : undefined,
          address: o.address || o.city ? { "@type": "PostalAddress", streetAddress: o.address || undefined, addressLocality: o.city || undefined, addressRegion: o.state || "OH", postalCode: o.zip || undefined, addressCountry: "US" } : undefined,
          areaServed: o.serviceArea || undefined,
          taxID: o.verifiedAt && o.ein ? o.ein : undefined,
          sameAs: [...(site ? [site.toString()] : []), ...socials.map((s) => s.url)],
        }}
      />
    </article>
  );
}

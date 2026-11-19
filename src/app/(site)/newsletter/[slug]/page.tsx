import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/public/json-ld";
import { buildMetadata } from "@/components/public/seo";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { NewsletterCover } from "@/components/ui/newsletter-cover";
import { getSettings } from "@/lib/settings";
import { getBrandAssetUrls } from "@/lib/brand-assets";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { plainName } from "@/lib/newsletter/copy";
import { findVisibleIssue, issueHref, issueNeighbors } from "@/lib/newsletter/issues";
import { RESERVED_ISSUE_SLUGS } from "@/lib/beehiiv/sync";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { absoluteUrl, formatDate, stripHtml, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(raw: string) {
  const slug = decodeURIComponent(raw).toLowerCase();
  // /newsletter/confirm|preferences|unsubscribe|thanks/ are their own routes; never treat them as issues.
  if (RESERVED_ISSUE_SLUGS.has(slug) || !/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  return findVisibleIssue(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [issue, c] = await Promise.all([load((await params).slug), getNewsletterConfig()]);
  if (!issue) return {};
  return buildMetadata({
    title: `${issue.title} — ${c.navLabel}`,
    description: issue.subtitle || truncate(stripHtml(issue.html), 300),
    path: issueHref(issue),
    image: issue.thumbnailUrl,
    type: "article",
    publishedTime: issue.publishedAt,
    modifiedTime: issue.updatedAt,
  });
}

/** One newsletter issue, synced from beehiiv and shown in full on our site (canonical = this URL). */
export default async function NewsletterIssuePage({ params }: Props) {
  const issue = await load((await params).slug);
  if (!issue) notFound();
  const [c, settings, brand, nav] = await Promise.all([getNewsletterConfig(), getSettings(), getBrandAssetUrls(), issueNeighbors(issue.publishedAt, issue.id)]);
  const html = sanitizeRichText(issue.html);
  const url = absoluteUrl(issueHref(issue));
  return (
    <article className="pb-10" data-testid="newsletter-issue" data-content-source={issue.contentSource}>
      <header className="bg-gradient-to-b from-brand-50/70 to-white">
        <div className="container-page max-w-3xl pt-8 pb-6 sm:pt-12">
          <Link href="/newsletter/#past-editions" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden /> All editions</Link>
          <p className="eyebrow mt-3">{c.navLabel} · <time dateTime={issue.publishedAt.toISOString()}>{formatDate(issue.publishedAt)}</time></p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-navy-900 text-balance break-words sm:text-4xl">{issue.title}</h1>
          {issue.subtitle && <p className="mt-3 text-lg text-slate-700">{issue.subtitle}</p>}
        </div>
      </header>
      <div className="container-page max-w-3xl">
        {issue.thumbnailUrl && (
          <div className="mb-8" data-fit="natural"><NewsletterCover src={issue.thumbnailUrl} alt="" /></div>
        )}
        <div className={`${PROSE_CLASSES} min-w-0 overflow-x-auto text-slate-800 [&_img]:h-auto [&_img]:max-w-full [&_table]:max-w-full! [&_table]:w-full!`} data-testid="issue-body" dangerouslySetInnerHTML={{ __html: html }} />

        {(nav.newer || nav.older) && (
          <nav aria-label="More editions" className="mt-10 grid gap-3 sm:grid-cols-2">
            {nav.older ? <Link href={issueHref(nav.older)} className="card card-hover flex min-h-11 items-center gap-2 p-4 text-sm"><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0"><span className="block text-xs text-slate-500">Older edition</span><span className="block truncate font-semibold text-navy-900">{nav.older.title}</span></span></Link> : <span />}
            {nav.newer && <Link href={issueHref(nav.newer)} className="card card-hover flex min-h-11 items-center justify-end gap-2 p-4 text-right text-sm"><span className="min-w-0"><span className="block text-xs text-slate-500">Newer edition</span><span className="block truncate font-semibold text-navy-900">{nav.newer.title}</span></span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden /></Link>}
          </nav>
        )}

        <NewsletterSignup source="newsletter_page" placement="newsletter_issue" variant="inline" className="mt-10" />
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: truncate(issue.title, 110),
          description: issue.subtitle || truncate(stripHtml(issue.html), 300),
          image: issue.thumbnailUrl ? [issue.thumbnailUrl] : undefined,
          datePublished: issue.publishedAt.toISOString(),
          dateModified: issue.updatedAt.toISOString(),
          isPartOf: { "@type": "Periodical", name: plainName(c.name), url: absoluteUrl("/newsletter/") },
          author: { "@type": "Organization", name: settings.siteName },
          publisher: { "@type": "Organization", name: settings.siteName, ...(brand.logo ? { logo: { "@type": "ImageObject", url: absoluteUrl(brand.logo) } } : {}) },
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          url,
        }}
      />
    </article>
  );
}

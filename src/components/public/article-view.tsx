import Link from "next/link";
import { CalendarDays, Clock, MapPin, Star, UserRound } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { ArticleCard } from "@/components/cards/article-card";
import { getSettings } from "@/lib/settings";
import { getBrandAssetUrls } from "@/lib/brand-assets";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { articleHref, businessHref } from "@/lib/links";
import { absoluteUrl, formatDate, stripHtml, truncate } from "@/lib/utils";
import type { ArticleCardData } from "@/components/cards/article-card";
import { Breadcrumbs } from "./breadcrumbs";
import { JsonLd } from "./json-ld";
import { ShareButtons } from "./share-buttons";
import { SaveButton } from "./save-button";
import { TrackView } from "./track";
import { KIND_SECTIONS, type ArticleForView } from "./article-data";
import { NewsletterSignup } from "@/components/newsletter/newsletter-signup";
import { storyImageFit } from "@/lib/story-cards";
import { SpotlightBusinessCard } from "./spotlight-business-card";

function readingMinutes(html: string) {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

/** Full article layout shared by /articles/[slug]/ and migrated WordPress URLs. */
export async function ArticleView({ article: a, related, saved }: { article: ArticleForView; related: ArticleCardData[]; saved: boolean }) {
  const settings = await getSettings();
  const publisherLogo = (await getBrandAssetUrls()).logo;
  const href = articleHref(a);
  const url = absoluteUrl(href);
  const title = stripHtml(a.title);
  const section = KIND_SECTIONS[a.kind] ?? KIND_SECTIONS.GENERAL;
  const author = a.authorName || a.author?.name || null;
  const html = sanitizeRichText(a.content);
  const businesses = a.businesses.map((x) => x.business).filter((b) => b.status === "PUBLISHED" && !b.deletedAt);
  const modified = a.localEditedAt ?? a.wpModifiedAt;
  const showUpdated = modified && a.publishedAt && modified.getTime() - a.publishedAt.getTime() > 86400_000;
  const image = a.featuredImageUrl;

  const jsonLd = (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": a.kind === "NEWS" || a.kind === "ANNOUNCEMENT" ? "NewsArticle" : "Article",
        headline: truncate(title, 110),
        description: a.seoDescription || (a.excerpt ? truncate(stripHtml(a.excerpt), 300) : undefined),
        image: image ? [absoluteUrl(image)] : undefined,
        datePublished: a.publishedAt?.toISOString(),
        dateModified: (modified ?? a.updatedAt).toISOString(),
        author: author ? { "@type": "Person", name: author } : { "@type": "Organization", name: settings.siteName },
        publisher: {
          "@type": "Organization",
          name: settings.siteName,
          ...(publisherLogo ? { logo: { "@type": "ImageObject", url: absoluteUrl(publisherLogo) } } : {}),
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        articleSection: a.categories[0]?.name,
        keywords: a.tags.map((t) => t.name).join(", ") || undefined,
        about: businesses.map((b) => ({ "@type": "LocalBusiness", name: b.name, url: absoluteUrl(businessHref(b)) })),
      }}
    />
  );

  // Business Spotlight with at least one linked public listing → two-column story + "About the Business" sidebar.
  const sidebar = a.kind === "SPOTLIGHT" ? [...businesses].sort((x, y) => x.name.localeCompare(y.name)) : [];
  const spotlightLayout = sidebar.length > 0;
  const imageFit = spotlightLayout && image ? await storyImageFit(image, a.businesses.map((x) => x.business.logoUrl)) : "cover";

  const intro = (
    <>
      <Breadcrumbs items={[{ label: section.label, href: section.href }, { label: truncate(title, 60) }]} />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {a.kind === "SPOTLIGHT" && <span className="badge bg-amber-100 text-amber-900"><Star className="h-3 w-3 fill-current" aria-hidden /> Business Spotlight</span>}
        {a.categories.slice(0, 3).map((c) => (
          <Link key={c.id} href={`/articles/?category=${encodeURIComponent(c.slug)}`} className="eyebrow hover:underline">{c.name}</Link>
        ))}
      </div>
      <h1 className="mt-3 font-display text-3xl font-bold leading-[1.1] text-navy-900 text-balance sm:text-5xl">{title}</h1>
      {a.excerpt && <p className="mt-4 text-lg leading-relaxed text-slate-600 sm:text-xl">{truncate(stripHtml(a.excerpt), 320)}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-sm text-slate-600">
        {author && <span className="flex items-center gap-1.5"><UserRound className="h-4 w-4" aria-hidden /> By <span className="font-semibold text-slate-800">{author}</span></span>}
        {a.publishedAt && (
          <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden /><time dateTime={a.publishedAt.toISOString()}>{formatDate(a.publishedAt)}</time></span>
        )}
        {showUpdated && <span className="text-slate-500">Updated <time dateTime={modified!.toISOString()}>{formatDate(modified)}</time></span>}
        <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden /> {readingMinutes(a.content)} min read</span>
        <span className="ml-auto"><SaveButton type="ARTICLE" targetId={a.id} initial={saved} compact /></span>
      </div>
    </>
  );

  const body = (
    <>
      <div className={`${PROSE_CLASSES} prose-lg text-slate-800`} dangerouslySetInnerHTML={{ __html: html }} />

      {a.tags.length > 0 && (
        <div className="mt-10 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Tags</span>
          {a.tags.map((t) => (
            <Link key={t.id} href={`/articles/?tag=${encodeURIComponent(t.slug)}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200">#{t.name}</Link>
          ))}
        </div>
      )}

      <ShareButtons url={url} title={title} className="mt-8 border-t border-slate-200 pt-6" />
    </>
  );

  if (spotlightLayout) {
    const now = new Date();
    return (
      <article className="pb-8" data-layout="spotlight">
        <TrackView type="view_article" targetType="ARTICLE" targetId={a.id} businessId={businesses[0]?.id} />
        {/*
          One DOM copy of the business card(s). Phones: intro → About the Business → featured image → body.
          lg+: story in columns 1–8, the sidebar spans both rows in columns 9–12 and sticks below the header.
        */}
        <div className="container-page pt-6 sm:pt-10">
          <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-12">
            <header className="min-w-0 lg:col-span-8 lg:col-start-1 lg:row-start-1" data-testid="article-intro">
              <div className="max-w-[44rem]">{intro}</div>
            </header>

            <aside aria-labelledby="about-business-title" data-testid="article-business-sidebar" className="mt-8 min-w-0 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:mt-0">
              <div className="space-y-4 lg:sticky lg:top-24">
                <h2 id="about-business-title" className="eyebrow">{sidebar.length > 1 ? "About the Businesses" : "About the Business"}</h2>
                {sidebar.map((b) => <SpotlightBusinessCard key={b.id} b={b} now={now} />)}
              </div>
            </aside>

            <div className="min-w-0 lg:col-span-8 lg:col-start-1 lg:row-start-2" data-testid="article-main">
              {image && (
                <figure className="mt-8">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100" data-fit={imageFit}>
                    {imageFit === "contain" ? (
                      <div className="absolute inset-0 bg-slate-50 p-6 sm:p-10">
                        <div className="relative h-full w-full">
                          <SmartImage src={image} alt={a.featuredImageAlt || ""} fill priority sizes="(min-width:1280px) 800px, (min-width:1024px) 66vw, 100vw" className="object-contain" />
                        </div>
                      </div>
                    ) : (
                      <SmartImage src={image} alt={a.featuredImageAlt || ""} fill priority sizes="(min-width:1280px) 800px, (min-width:1024px) 66vw, 100vw" className="object-cover" />
                    )}
                  </div>
                </figure>
              )}
              <div className="mt-8 max-w-[44rem] sm:mt-10" data-testid="article-body">
                {body}
                <NewsletterSignup source="article" variant="inline" className="mt-10" />
              </div>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-title" className="container-page mt-16 border-t border-slate-200 pt-10">
            <h2 id="related-title" className="section-title">Keep reading</h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => <ArticleCard key={r.id} a={r} />)}
            </div>
          </section>
        )}

        {jsonLd}
      </article>
    );
  }

  return (
    <article className="pb-8">
      <TrackView type="view_article" targetType="ARTICLE" targetId={a.id} businessId={businesses[0]?.id} />
      <header className="container-page pt-6 sm:pt-10">
        <div className="mx-auto max-w-[44rem]">{intro}</div>
      </header>

      {image && (
        <figure className="container-page mt-8">
          <div className="relative mx-auto aspect-[16/9] max-w-5xl overflow-hidden rounded-2xl bg-slate-100">
            <SmartImage src={image} alt={a.featuredImageAlt || ""} fill priority sizes="(min-width:1100px) 1024px, 100vw" className="object-cover" />
          </div>
        </figure>
      )}

      <div className="container-page mt-8 sm:mt-10">
        <div className="mx-auto max-w-[44rem]">
          {body}
          {businesses.length > 0 && (
            <aside aria-labelledby="featured-biz" className="mt-10 rounded-2xl bg-cream p-5 ring-1 ring-amber-200/60 sm:p-6">
              <h2 id="featured-biz" className="eyebrow">{businesses.length > 1 ? "Businesses in this story" : "Business in this story"}</h2>
              <ul className="mt-4 grid grid-cols-1 gap-4">
                {businesses.map((b) => (
                  <li key={b.id}>
                    <Link href={businessHref(b)} className="group flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-20 sm:w-20">
                        {b.logoUrl || b.coverUrl ? <SmartImage src={(b.logoUrl || b.coverUrl)!} alt="" fill sizes="80px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-navy-800 font-display text-2xl font-bold text-white">{b.name.charAt(0)}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-navy-900 group-hover:text-brand-700">{b.name}</p>
                        {b.categories[0] && <p className="text-sm text-slate-500">{b.categories.map((c) => c.name).slice(0, 2).join(" · ")}</p>}
                        {b.city && <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" aria-hidden />{b.city}</p>}
                      </div>
                      <span className="hidden shrink-0 text-sm font-semibold text-brand-700 sm:block">View profile →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <NewsletterSignup source="article" variant="inline" className="mt-10" />
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="container-page mt-16 border-t border-slate-200 pt-10">
          <h2 id="related-title" className="section-title">Keep reading</h2>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => <ArticleCard key={r.id} a={r} />)}
          </div>
        </section>
      )}

      {jsonLd}
    </article>
  );
}

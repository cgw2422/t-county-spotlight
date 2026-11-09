import Link from "next/link";
import { CalendarDays, Info, MessagesSquare, RefreshCw } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { BRAND } from "@/lib/brand";
import { absoluteUrl, formatDate, stripHtml, truncate } from "@/lib/utils";
import { orderResults, PULSE_DISCLOSURE, pulseHref, pulseResultInclude, resultProfileHref, type PulseCardData } from "@/lib/pulse";
import { SmartImage } from "@/components/ui/smart-image";
import { Breadcrumbs } from "@/components/public/breadcrumbs";
import { JsonLd } from "@/components/public/json-ld";
import { ShareButtons } from "@/components/public/share-buttons";
import { TrackView, TrackedLink } from "@/components/public/track";
import { PulseResults } from "./pulse-results";
import { PulseCard } from "./pulse-card";

export const pulseViewInclude = {
  category: { select: { id: true, name: true, slug: true } },
  results: { include: pulseResultInclude, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.CommunityPulseInclude;

export type PulseViewData = Prisma.CommunityPulseGetPayload<{ include: typeof pulseViewInclude }>;

/** Neutral source wording; Facebook wording only for Facebook discussions. */
export function sourceLine(p: { sourceType: string; sourceLabel: string | null }) {
  switch (p.sourceType) {
    case "FACEBOOK": return p.sourceLabel ? `Based on recommendations from our Facebook community (${p.sourceLabel})` : "Based on recommendations from our Facebook community";
    case "SURVEY": return p.sourceLabel ? `Based on community responses to ${p.sourceLabel}` : "Based on community survey responses";
    case "COMMUNITY_SUBMISSION": return p.sourceLabel ? `Based on community submissions (${p.sourceLabel})` : "Based on community submissions";
    case "EDITORIAL": return p.sourceLabel ? `An editorial feature — ${p.sourceLabel}` : "An editorial feature compiled by T County Connect";
    default: return p.sourceLabel ? `Based on community responses (${p.sourceLabel})` : "Based on community responses";
  }
}

export function PulseView({ p, related, preview = false }: { p: PulseViewData; related: PulseCardData[]; preview?: boolean }) {
  const rows = orderResults(p.results, p.sortMode);
  const url = absoluteUrl(pulseHref(p));
  const intro = sanitizeRichText(p.intro);
  const image = p.featuredImageUrl || p.ogImageUrl;
  const modified = p.resultsUpdatedAt && p.resultsUpdatedAt > p.updatedAt ? p.resultsUpdatedAt : p.resultsUpdatedAt ?? p.updatedAt;
  const heading = p.displayMode === "EDITORIAL_LIST" ? "Community recommendations" : "Most mentioned";
  const archived = p.status === "ARCHIVED";

  return (
    <article className="pb-14">
      {!preview && <TrackView type="view_pulse" targetType="PULSE" targetId={p.id} />}
      <header className="border-b border-slate-200 bg-gradient-to-b from-cream to-white">
        <div className="container-page max-w-4xl py-8 sm:py-12">
          <Breadcrumbs items={[{ label: "Community Pulse", href: "/community-pulse/" }, { label: p.title }]} className="mb-5" />
          <p className="eyebrow flex flex-wrap items-center gap-2">
            <span className="text-sunset-600">Community Pulse</span>
            {p.category && <><span aria-hidden className="text-slate-300">/</span><Link href={`/community-pulse/?category=${p.category.slug}`} className="hover:underline">{p.category.name}</Link></>}
            {archived && <span className="badge-gray normal-case tracking-normal">Archived</span>}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-navy-900 sm:text-4xl lg:text-5xl text-balance">{p.title}</h1>
          {p.description && <p className="mt-4 max-w-3xl text-lg text-slate-600">{p.description}</p>}
          <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
            {p.publishedAt && <div className="flex items-center gap-1.5"><dt className="sr-only">Published</dt><CalendarDays className="h-4 w-4 text-slate-400" aria-hidden /><dd>Published {formatDate(p.publishedAt)}</dd></div>}
            {p.discussionDate && <div className="flex items-center gap-1.5"><dt className="sr-only">Discussion date</dt><MessagesSquare className="h-4 w-4 text-slate-400" aria-hidden /><dd>Discussion {formatDate(p.discussionDate)}</dd></div>}
            {p.resultsUpdatedAt && <div className="flex items-center gap-1.5"><dt className="sr-only">Results last updated</dt><RefreshCw className="h-4 w-4 text-slate-400" aria-hidden /><dd>Results last updated {formatDate(p.resultsUpdatedAt)}</dd></div>}
          </dl>
          {archived && <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">This Community Pulse entry is archived. Results reflect the conversation at the time and are no longer updated.</p>}
        </div>
      </header>

      <div className="container-page max-w-4xl">
        {p.featuredImageUrl && (
          <figure className="relative mt-8 aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100">
            <SmartImage src={p.featuredImageUrl} alt={p.featuredImageAlt ?? ""} fill priority sizes="(min-width: 1024px) 896px, 100vw" className="object-cover" />
          </figure>
        )}

        {intro && <div className={`${PROSE_CLASSES} mt-8`} dangerouslySetInnerHTML={{ __html: intro }} />}

        <aside aria-label="Source" className="mt-8 flex flex-col gap-3 rounded-2xl border border-hillside-200 bg-hillside-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-hillside-700" aria-hidden />
            <p className="font-medium text-navy-900">{sourceLine(p)}</p>
          </div>
          {p.sourceUrl && (
            <TrackedLink href={p.sourceUrl} target="_blank" rel="noopener" className="btn-secondary btn-sm shrink-0 self-start sm:self-auto" track={{ type: "click_pulse_source", targetType: "PULSE", targetId: p.id }}>
              View the original discussion
            </TrackedLink>
          )}
        </aside>

        <section aria-labelledby="pulse-results" className="mt-10">
          <div className="mb-4">
            <h2 id="pulse-results" className="section-title">{heading}</h2>
            <p className="mt-1 text-slate-600">Based on community responses{p.displayMode !== "EDITORIAL_LIST" ? " · counts are mentions, not votes" : ""}.</p>
          </div>
          <PulseResults rows={rows} displayMode={p.displayMode} pulseId={p.id} />
        </section>

        <aside aria-label="About these results" className="mt-8 rounded-2xl border border-slate-200 bg-cream p-4 text-sm text-slate-700 sm:p-5">
          <p className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" aria-hidden /><span>{PULSE_DISCLOSURE}</span></p>
          {p.methodology && <p className="mt-3 whitespace-pre-line border-t border-slate-200 pt-3"><span className="font-semibold text-navy-900">How these results were compiled: </span>{p.methodology}</p>}
        </aside>

        <ShareButtons url={url} title={p.title} className="mt-8" />
      </div>

      {related.length > 0 && (
        <section aria-labelledby="pulse-related" className="container-page mt-14">
          <h2 id="pulse-related" className="section-title">More from Community Pulse</h2>
          <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{related.map((r) => <PulseCard key={r.id} p={r} />)}</div>
        </section>
      )}

      {!preview && (
        <JsonLd
          data={[
            {
              "@context": "https://schema.org",
              "@type": "Article",
              headline: p.title,
              description: truncate(stripHtml(p.seoDescription || p.description || p.intro || ""), 300) || undefined,
              url,
              mainEntityOfPage: url,
              ...(p.publishedAt ? { datePublished: p.publishedAt.toISOString() } : {}),
              dateModified: modified.toISOString(),
              ...(image ? { image: [absoluteUrl(image)] } : {}),
              author: { "@type": "Organization", name: BRAND.name, url: absoluteUrl("/") },
              publisher: { "@type": "Organization", name: BRAND.name, url: absoluteUrl("/") },
              ...(p.category ? { articleSection: p.category.name } : {}),
            },
            ...(rows.length
              ? [{
                  "@context": "https://schema.org",
                  "@type": "ItemList",
                  name: p.title,
                  itemListOrder: p.displayMode === "EDITORIAL_LIST" ? "https://schema.org/ItemListUnordered" : "https://schema.org/ItemListOrderDescending",
                  numberOfItems: rows.length,
                  itemListElement: rows.map((r, i) => {
                    const prof = resultProfileHref(r);
                    const link = prof ? absoluteUrl(prof.href) : r.websiteUrl;
                    return { "@type": "ListItem", position: i + 1, name: r.name, ...(link ? { url: link } : {}) };
                  }),
                }]
              : []),
          ]}
        />
      )}
    </article>
  );
}

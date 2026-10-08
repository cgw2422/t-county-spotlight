import { SmartImage } from "@/components/ui/smart-image";
import { sanitizeRichText } from "@/lib/sanitize";
import { PROSE_CLASSES } from "@/lib/prose";
import { stripHtml, truncate } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";

export type PageForView = { id: string; title: string; content: string; featuredImageUrl?: string | null };

/** Static CMS / migrated WordPress page. */
export function PageView({ page, children }: { page: PageForView; children?: React.ReactNode }) {
  const title = stripHtml(page.title);
  return (
    <article className="pb-8">
      <header className="border-b border-slate-200 bg-gradient-to-b from-cream to-white">
        <div className="container-page py-8 sm:py-12">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs items={[{ label: truncate(title, 60) }]} />
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight text-navy-900 text-balance sm:text-5xl">{title}</h1>
          </div>
        </div>
      </header>
      {page.featuredImageUrl && (
        <div className="container-page mt-8">
          <div className="relative mx-auto aspect-[21/9] max-w-5xl overflow-hidden rounded-2xl bg-slate-100">
            <SmartImage src={page.featuredImageUrl} alt="" fill priority sizes="(min-width:1100px) 1024px, 100vw" className="object-cover" />
          </div>
        </div>
      )}
      <div className="container-page mt-8 sm:mt-10">
        <div className="mx-auto max-w-[70ch]">
          <div className={`${PROSE_CLASSES} text-slate-800`} dangerouslySetInnerHTML={{ __html: sanitizeRichText(page.content) }} />
          {children}
        </div>
      </div>
    </article>
  );
}

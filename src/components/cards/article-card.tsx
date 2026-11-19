import Link from "next/link";
import { SmartImage } from "@/components/ui/smart-image";
import { ImagePlaceholder } from "@/components/ui/placeholder";
import { articleHref } from "@/lib/links";
import { cn, formatDate, stripHtml, truncate } from "@/lib/utils";
import { isNewsletterArticle, NEWSLETTER_FIT, NEWSLETTER_FRAME } from "@/components/ui/newsletter-cover";

export type ArticleCardData = {
  id: string; slug: string; title: string; excerpt?: string | null; featuredImageUrl?: string | null; featuredImageAlt?: string | null;
  publishedAt?: Date | null; legacyPath?: string | null; kind?: string; categories?: { name: string }[];
  /** Set for articles imported from beehiiv (newsletter posts): their covers are shown whole, never cropped. */
  beehiivPostId?: string | null;
};

export function ArticleCard({ a, variant = "default" }: { a: ArticleCardData; variant?: "default" | "feature" | "compact" }) {
  const href = articleHref(a);
  const title = stripHtml(a.title);
  const cat = a.categories?.[0]?.name ?? (a.kind === "SPOTLIGHT" ? "Business Spotlight" : null);
  const newsletter = isNewsletterArticle(a);
  if (variant === "compact") {
    return (
      <Link href={href} className="group flex gap-3">
        <div className={cn("relative h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100", newsletter && NEWSLETTER_FRAME)}>
          {a.featuredImageUrl ? <SmartImage src={a.featuredImageUrl} alt="" fill sizes="112px" className={newsletter ? NEWSLETTER_FIT : "object-cover"} /> : <ImagePlaceholder />}
        </div>
        <div className="min-w-0">
          {cat && <p className="eyebrow">{cat}</p>}
          <h3 className="line-clamp-2 font-semibold leading-snug text-navy-900 group-hover:text-brand-700">{title}</h3>
          {a.publishedAt && <p className="mt-1 text-xs text-slate-500">{formatDate(a.publishedAt)}</p>}
        </div>
      </Link>
    );
  }
  const feature = variant === "feature";
  return (
    <Link href={href} className="card card-hover group flex flex-col overflow-hidden">
      <div className={cn("relative overflow-hidden bg-slate-100", feature ? "aspect-[16/9]" : "aspect-[3/2]", newsletter && NEWSLETTER_FRAME)} data-fit={newsletter ? "contain" : "cover"}>
        {a.featuredImageUrl ? (
          <SmartImage src={a.featuredImageUrl} alt={a.featuredImageAlt || ""} fill sizes={feature ? "(min-width:1024px) 50vw, 100vw" : "(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"} className={newsletter ? NEWSLETTER_FIT : "object-cover transition duration-500 group-hover:scale-105"} />
        ) : <ImagePlaceholder label={title} />}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {cat && <p className="eyebrow">{cat}</p>}
        <h3 className={`mt-1 font-display font-semibold leading-snug text-navy-900 group-hover:text-brand-700 ${feature ? "text-2xl" : "text-lg"}`}>{title}</h3>
        {a.excerpt && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{truncate(stripHtml(a.excerpt), 200)}</p>}
        {a.publishedAt && <p className="mt-auto pt-3 text-xs text-slate-500">{formatDate(a.publishedAt)}</p>}
      </div>
    </Link>
  );
}

import { getImageProps } from "next/image";
import { cn } from "@/lib/utils";

/** Newsletter (beehiiv) articles carry a beehiiv post id; their covers are graphics with text, so they're never cropped. */
export const isNewsletterArticle = (a: { beehiivPostId?: string | null }) => !!a.beehiivPostId;

/** Classes for a newsletter cover inside an existing fixed card frame: whole image, centered, neutral letterbox. */
export const NEWSLETTER_FIT = "object-contain object-center";
export const NEWSLETTER_FRAME = "bg-slate-100";

/**
 * Full newsletter cover at its original aspect ratio, scaled down to the content width
 * (never stretched or upscaled). One resized source, so the natural size is the real pixel size.
 */
export function NewsletterCover({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const unoptimized = src.endsWith(".svg") || src.startsWith("data:");
  const { props } = getImageProps({ src, alt, width: 1600, height: 1600, unoptimized });
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={alt} decoding="async" loading="eager" fetchPriority="high" data-testid="newsletter-cover"
      className={cn("mx-auto block h-auto w-auto max-w-full rounded-2xl", className)} />
  );
}

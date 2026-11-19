import Image, { getImageProps } from "next/image";
import type { CSSProperties } from "react";
import type { ImageDims } from "@/lib/media-dims";
import { EventImageViewer } from "./event-image-viewer";

/**
 * Event detail image shown whole, in its own proportions (event flyers often carry text at the edges).
 * Centered on a neutral panel and scaled down to the column width and `--flyer-max-h`
 * (60vh on phones, 70vh on desktop, never over 640px); never stretched past its intrinsic size.
 *  - Known size (Media record): explicit width = min(column, intrinsic width, max-height × ratio); responsive srcset.
 *  - Unknown size: the browser's natural size, capped by max-width / max-height (one ≤1920px variant).
 */
export function EventFlyer({ src, title, dims }: { src: string; title: string; dims: ImageDims | null }) {
  const unoptimized = src.endsWith(".svg") || src.startsWith("data:");
  let img;
  if (dims) {
    const ratio = Math.round((dims.width / dims.height) * 10000) / 10000;
    const style: CSSProperties = { width: `min(100%, ${dims.width}px, calc(var(--flyer-max-h) * ${ratio}))`, height: "auto" };
    img = (
      <Image src={src} alt="" width={dims.width} height={dims.height} preload unoptimized={unoptimized}
        sizes="(min-width:1024px) 800px, 100vw" className="mx-auto block" style={style} data-testid="event-image" />
    );
  } else {
    // Single source (no density srcset) so the natural size is the real pixel size, capped at 1920px wide.
    const { props } = getImageProps({ src, alt: "", width: 960, height: 960, unoptimized });
    // eslint-disable-next-line @next/next/no-img-element
    img = <img src={props.src} alt="" decoding="async" loading="eager" fetchPriority="high" className="mx-auto block h-auto w-auto max-w-full" style={{ maxHeight: "var(--flyer-max-h)" }} data-testid="event-image" />;
  }
  return (
    <div className="[--flyer-max-h:min(60vh,640px)] lg:[--flyer-max-h:min(70vh,640px)]">
      <EventImageViewer src={src} title={title} frameClassName="overflow-hidden rounded-2xl bg-slate-100">{img}</EventImageViewer>
    </div>
  );
}

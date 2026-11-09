import { getImageProps } from "next/image";
import { preload } from "react-dom";

/** Homepage hero appearance (managed in Admin → Homepage appearance). */
export type HeroAppearance = {
  imageUrl?: string | null;
  /** Alt text; empty = decorative (the default for a background photo). */
  imageAlt?: string | null;
  /** Optional separate image for phones/tablets (below `lg`). */
  mobileImageUrl?: string | null;
  /** Focal points, 0–100 (50/50 = center). */
  desktopFocusX?: number; desktopFocusY?: number;
  mobileFocusX?: number; mobileFocusY?: number;
  /** Navy overlay strength, 0–100. */
  overlay?: number;
};

export const HERO_DEFAULTS = { desktopFocusX: 50, desktopFocusY: 50, mobileFocusX: 50, mobileFocusY: 50, overlay: 55 } as const;

/** Recommended source sizes (shown in the admin help text). */
export const HERO_IMAGE_HELP = {
  desktop: "Recommended: 2400 × 1200 px or larger (2:1), landscape. Keep the subject away from the left side, where the headline sits.",
  mobile: "Optional. Recommended: 1200 × 1500 px (4:5), portrait. Used on phones and tablets instead of the desktop image.",
};

const pct = (v: unknown, def: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : def;
};

/** Fills defaults and clamps numbers. Safe on client and server. */
export function normalizeHeroAppearance(a?: HeroAppearance | null) {
  return {
    imageUrl: a?.imageUrl || null,
    imageAlt: (a?.imageAlt ?? "").trim(),
    mobileImageUrl: a?.mobileImageUrl || null,
    desktopFocusX: pct(a?.desktopFocusX, HERO_DEFAULTS.desktopFocusX),
    desktopFocusY: pct(a?.desktopFocusY, HERO_DEFAULTS.desktopFocusY),
    mobileFocusX: pct(a?.mobileFocusX, HERO_DEFAULTS.mobileFocusX),
    mobileFocusY: pct(a?.mobileFocusY, HERO_DEFAULTS.mobileFocusY),
    overlay: pct(a?.overlay, HERO_DEFAULTS.overlay),
  };
}

const QUALITY = 75; // Next 16 default `images.qualities` allowlist is [75]
const unopt = (src: string) => src.endsWith(".svg") || src.startsWith("data:");

/**
 * Hero background: the admin-chosen image (full-bleed, object-fit cover,
 * per-breakpoint focal point) under a navy overlay plus a left-to-right
 * readability gradient — or the default brand gradient when no image is set.
 *
 * A separate mobile image is served with a native <picture> (art direction via
 * getImageProps) so the browser downloads only the image for the current
 * breakpoint; both are preloaded with media queries.
 */
export function HeroBackground({ appearance }: { appearance?: HeroAppearance | null }) {
  const a = normalizeHeroAppearance(appearance);
  if (!a.imageUrl) {
    return (
      <>
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(255,133,8,0.55),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,125,20,0.45),transparent_60%),linear-gradient(135deg,#061527,#0b2340_55%,#13305a)]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/85 via-navy-950/55 to-navy-950/10" />
      </>
    );
  }

  const posStyle = {
    "--hero-pos-m": `${a.mobileFocusX}% ${a.mobileFocusY}%`,
    "--hero-pos-d": `${a.desktopFocusX}% ${a.desktopFocusY}%`,
  } as React.CSSProperties;
  const posClass = "h-full w-full object-cover object-[var(--hero-pos-m)] lg:object-[var(--hero-pos-d)]";
  const decorative = !a.imageAlt;
  const mobileSrc = a.mobileImageUrl && a.mobileImageUrl !== a.imageUrl ? a.mobileImageUrl : null;
  const LG = "(min-width: 1024px)";

  let img: React.ReactNode;
  if (!mobileSrc) {
    const { props } = getImageProps({ src: a.imageUrl, alt: a.imageAlt, fill: true, sizes: "100vw", quality: QUALITY, unoptimized: unopt(a.imageUrl) });
    preload(props.src, { as: "image", fetchPriority: "high", imageSrcSet: props.srcSet, imageSizes: props.sizes });
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    img = <img {...props} loading="eager" fetchPriority="high" decoding="async" className={posClass} style={{ ...props.style, ...posStyle }} aria-hidden={decorative || undefined} />;
  } else {
    const d = getImageProps({ src: a.imageUrl, alt: a.imageAlt, fill: true, sizes: "100vw", quality: QUALITY, unoptimized: unopt(a.imageUrl) }).props;
    const m = getImageProps({ src: mobileSrc, alt: a.imageAlt, fill: true, sizes: "100vw", quality: QUALITY, unoptimized: unopt(mobileSrc) }).props;
    preload(d.src, { as: "image", fetchPriority: "high", imageSrcSet: d.srcSet, imageSizes: d.sizes, media: LG });
    preload(m.src, { as: "image", fetchPriority: "high", imageSrcSet: m.srcSet, imageSizes: m.sizes, media: "(max-width: 1023.98px)" });
    img = (
      <picture>
        <source media={LG} srcSet={d.srcSet ?? d.src} sizes={d.sizes} />
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img {...m} loading="eager" fetchPriority="high" decoding="async" className={posClass} style={{ ...m.style, ...posStyle }} aria-hidden={decorative || undefined} />
      </picture>
    );
  }

  return (
    <>
      <div className="absolute inset-0 -z-10 overflow-hidden bg-navy-900">{img}</div>
      {/* navy overlay, strength set by the admin */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-navy-900" style={{ opacity: a.overlay / 100 }} />
      {/* subtle left-to-right gradient keeps the headline readable over busy photos */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/70 via-navy-950/30 to-transparent" />
    </>
  );
}

import { SmartImage } from "@/components/ui/smart-image";

/** Published homepage hero appearance (managed in Admin → Homepage appearance). */
export type HeroAppearance = {
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  desktopFocusX?: number; desktopFocusY?: number;
  mobileFocusX?: number; mobileFocusY?: number;
  /** Navy overlay strength, 0–100. */
  overlay?: number;
};

/**
 * Hero background: the admin-chosen image (full-bleed, object-fit cover) with
 * a navy overlay, or the default brand gradient when no image is set.
 * PLACEHOLDER — the hero-appearance work replaces this with focal points,
 * separate mobile image and overlay control.
 */
export function HeroBackground({ appearance }: { appearance?: HeroAppearance | null }) {
  const img = appearance?.imageUrl;
  return (
    <>
      {img ? (
        <SmartImage src={img} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(255,133,8,0.55),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,125,20,0.45),transparent_60%),linear-gradient(135deg,#061527,#0b2340_55%,#13305a)]" />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/85 via-navy-950/55 to-navy-950/10" />
    </>
  );
}

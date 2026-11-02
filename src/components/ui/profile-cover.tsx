import { SmartImage } from "@/components/ui/smart-image";
import { coverPosition } from "@/lib/cover";

/**
 * Responsive profile cover banner shared by business, nonprofit and church
 * profiles. Phones and tablets get a fixed, comfortable banner height; large
 * screens use the 3.2:1 standard (capped so it never dominates the page).
 * The image always fills with object-fit: cover — never stretched — and is
 * positioned at the owner's chosen focal point (centered by default).
 * next/image serves resized WebP variants for each screen size; the original
 * upload is kept untouched in storage.
 */
export function ProfileCover({ src, focusX, focusY }: { src?: string | null; focusX?: number | null; focusY?: number | null }) {
  return (
    <div className="relative h-44 w-full overflow-hidden bg-navy-900 sm:h-56 md:h-64 lg:h-auto lg:max-h-[520px] lg:aspect-[16/5]">
      {src ? (
        <SmartImage
          src={src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: coverPosition(focusX, focusY) }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,133,8,0.5),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(56,125,20,0.45),transparent_60%),linear-gradient(135deg,#061527,#0b2340_55%,#13305a)]" />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-navy-950/70 via-navy-950/10 to-transparent" />
    </div>
  );
}

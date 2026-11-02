/** Profile cover photo standard (businesses, nonprofits, churches). */
export const COVER_RECOMMENDED = { width: 1920, height: 600, label: "1920 × 600 px (3.2:1)" };

export const COVER_HELP =
  "Recommended size: 1920 × 600 px (3.2:1). Larger photos are fine — they're resized and optimized automatically. Keep text and logos out of the cover; your logo is uploaded separately.";

/** Clamp a focal-point percentage to 0–100; anything invalid falls back to center (50). */
export function clampFocus(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** CSS object-position for a focal point (defaults to centered). */
export function coverPosition(x?: number | null, y?: number | null) {
  return `${clampFocus(x ?? 50)}% ${clampFocus(y ?? 50)}%`;
}

/** Read coverFocusX / coverFocusY from a submitted form. */
export function focusFromForm(fd: FormData) {
  return { coverFocusX: clampFocus(fd.get("coverFocusX") ?? 50), coverFocusY: clampFocus(fd.get("coverFocusY") ?? 50) };
}

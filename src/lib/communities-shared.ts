/**
 * Community pages ("Explore Your Community"): pure helpers safe for client code.
 * Slugs follow the My T County scheme (slugify of the canonical community name).
 */
import { COMMUNITIES, communityName, communitySlug } from "./my-t-county-shared";

export { COMMUNITIES };

/** /communities/{slug}/ for a known community (name or slug, any case); null when unknown. */
export function communityHref(value: string | null | undefined): string | null {
  const slug = communitySlug(value);
  return slug ? `/communities/${slug}/` : null;
}

/** Canonical community record for a URL slug (exact slug match only). */
export function communityBySlug(slug: string | null | undefined) {
  if (!slug) return null;
  const c = COMMUNITIES.find((x) => x.slug === slug);
  return c && communityName(c.name) ? c : null;
}

/** Google Maps search link (no API key, no embed). */
export function mapsSearchUrl(parts: (string | null | undefined)[]) {
  const q = [...parts.filter((p): p is string => !!p && !!p.trim()), "OH"].join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

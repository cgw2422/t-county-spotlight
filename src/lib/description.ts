/**
 * Plain-text length used for "About your business" limits (HTML tags and
 * entities don't count). Pure — safe to import from client components so the
 * live counter matches the server check exactly.
 */
export function descriptionLength(html: string | null | undefined) {
  return (html ?? "").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().length;
}

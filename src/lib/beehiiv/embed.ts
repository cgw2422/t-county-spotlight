// Client-safe: validation for beehiiv's embedded subscribe form URL. No server imports.

/** The only hosts beehiiv serves embedded subscribe forms from. */
export const BEEHIIV_EMBED_HOSTS = ["embeds.beehiiv.com", "subscribe-forms.beehiiv.com"] as const;

/**
 * Accepts the form's URL, or the whole embed code beehiiv gives you (we only
 * take the iframe's src — any <script> in the pasted code is ignored, never stored).
 * Returns the normalized https URL, or null when it isn't a beehiiv form URL.
 */
export function normalizeBeehiivEmbedUrl(input: string | null | undefined): string | null {
  let raw = (input ?? "").trim();
  if (!raw) return null;
  if (raw.length > 4000) return null;
  if (/</.test(raw)) {
    // Pasted embed code: pull the src out of the first <iframe>.
    const m = raw.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!m) return null;
    raw = m[1].trim().replace(/&amp;/g, "&");
  }
  if (raw.length > 500) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password || u.port) return null;
  if (!(BEEHIIV_EMBED_HOSTS as readonly string[]).includes(u.hostname.toLowerCase())) return null;
  // Form id path, e.g. /0f1e2d3c-…  (letters, digits, dashes; optional trailing slash)
  if (!/^\/[A-Za-z0-9-]{8,80}\/?$/.test(u.pathname)) return null;
  // Only simple display options in the query (e.g. ?slim=true); nothing else.
  for (const [k, v] of u.searchParams) {
    if (!/^[A-Za-z_]{1,30}$/.test(k) || !/^[A-Za-z0-9_-]{0,40}$/.test(v)) return null;
  }
  u.hash = "";
  return `https://${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
}

/** beehiiv's "slim" embed is a single-line form (email + button). */
export function isSlimEmbed(url: string) {
  try {
    return new URL(url).searchParams.get("slim") === "true";
  } catch {
    return false;
  }
}

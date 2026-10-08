/**
 * Validates the WordPress base URL an admin types in. In production, private
 * and loopback hosts are refused so the importer cannot be pointed at
 * internal services (SSRF). Local fixtures are allowed in development only.
 */
export function checkWordPressUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return { ok: false, error: "Enter a full URL such as https://tcountyspotlight.com" }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, error: "Only http(s) URLs are supported." };
  if (u.username || u.password) return { ok: false, error: "Do not put credentials in the URL; use WP_USERNAME / WP_APP_PASSWORD." };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isPrivate =
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "::1" || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host) || !host.includes(".") && !host.includes(":");
  if (isPrivate && process.env.NODE_ENV === "production") return { ok: false, error: "Private or local addresses are not allowed." };
  return { ok: true, url: `${u.origin}${u.pathname.replace(/\/+$/, "")}` };
}

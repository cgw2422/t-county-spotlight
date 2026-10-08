/** Canonical public URLs. Migrated records keep their original WordPress path. */
export function articleHref(a: { slug: string; legacyPath?: string | null }) {
  return a.legacyPath || `/articles/${a.slug}/`;
}
export function businessHref(b: { slug: string }) {
  return `/business/${b.slug}/`;
}
export function eventHref(e: { slug: string }) {
  return `/events/${e.slug}/`;
}
export function specialHref(p: { slug: string }) {
  return `/specials/${p.slug}/`;
}
export function pageHref(p: { slug: string; legacyPath?: string | null }) {
  return p.legacyPath || `/${p.slug}/`;
}
export function jobHref(j: { slug: string }) {
  return `/jobs/${j.slug}/`;
}
export function normalizePath(p: string) {
  let path = p.split("#")[0].split("?")[0];
  try { path = decodeURI(path); } catch {}
  if (!path.startsWith("/")) path = "/" + path;
  if (!path.endsWith("/") && !/\.[a-z0-9]{2,5}$/i.test(path)) path += "/";
  return path.replace(/\/{2,}/g, "/").toLowerCase();
}

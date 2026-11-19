/** Client-safe helpers for the admin Newsletter Events tool. */

/** Stable signature of the inputs that shape the preview (server and client compute it the same way). */
export function previewSignature(s: { from: string; to: string; excluded: string[]; featured: string | null; title: string; subtitle: string; intro: string }) {
  return JSON.stringify([s.from, s.to, [...s.excluded].sort(), s.featured ?? "", s.title, s.subtitle, s.intro]);
}

export type ToolState = { from: string; to: string; excluded: string[]; featured: string | null; title: string; subtitle: string; intro: string; archiveTag: boolean };

/** The tool's state as a URL query, so a reload or a failed draft keeps the selection. */
export function toolQuery(s: ToolState, opts: { preview?: boolean } = {}) {
  const q = new URLSearchParams();
  q.set("from", s.from);
  q.set("to", s.to);
  if (s.excluded.length) q.set("ex", s.excluded.join(","));
  if (s.featured) q.set("feat", s.featured);
  if (s.title) q.set("title", s.title);
  if (s.subtitle) q.set("subtitle", s.subtitle);
  q.set("intro", s.intro);
  if (!s.archiveTag) q.set("tag", "0");
  if (opts.preview) q.set("preview", "1");
  return q.toString();
}

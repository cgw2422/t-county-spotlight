import { articleHref } from "./links";

/** Client-safe part of `spotlights.ts`: turns the `spotlightArticlesSelect()` rows into the badge link. */
export type SpotlightLink = { href: string; title: string };
export type SpotlightRows = { article: { title: string; slug: string; legacyPath: string | null } }[] | undefined | null;

export function spotlightFrom(rows: SpotlightRows): SpotlightLink | null {
  const a = rows?.[0]?.article;
  return a ? { href: articleHref(a), title: a.title } : null;
}

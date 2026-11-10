/**
 * New & Coming Soon: pure helpers shared by server and client code (no DB).
 * An "opening" is a BusinessUpdate with kind != GENERAL.
 */
import { formatDate } from "./utils";

export const OPENING_KINDS = ["COMING_SOON", "RECENTLY_OPENED", "RELOCATING", "EXPANDING"] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];
export type UpdateKind = OpeningKind | "GENERAL";

export const OPENING_LABELS: Record<OpeningKind, string> = {
  COMING_SOON: "Coming Soon",
  RECENTLY_OPENED: "Recently Opened",
  RELOCATING: "Relocating",
  EXPANDING: "Expanding",
};

/** URL slugs for the /new/?status= filter. */
export const OPENING_SLUGS: Record<OpeningKind, string> = {
  COMING_SOON: "coming-soon",
  RECENTLY_OPENED: "recently-opened",
  RELOCATING: "relocating",
  EXPANDING: "expanding",
};

export const OPENING_BADGE: Record<OpeningKind, string> = {
  COMING_SOON: "badge-orange",
  RECENTLY_OPENED: "badge-green",
  RELOCATING: "badge-blue",
  EXPANDING: "badge-amber",
};

/** Options for the owner dashboard "This is a…" select. */
export const OWNER_UPDATE_KIND_OPTIONS: { value: UpdateKind; label: string }[] = [
  { value: "GENERAL", label: "General update" },
  { value: "COMING_SOON", label: "Coming soon" },
  { value: "RECENTLY_OPENED", label: "Now open" },
  { value: "RELOCATING", label: "Relocating" },
  { value: "EXPANDING", label: "Expanding" },
];

export function isOpeningKind(v: unknown): v is OpeningKind {
  return typeof v === "string" && (OPENING_KINDS as readonly string[]).includes(v);
}

export function openingKindFromSlug(slug: string | null | undefined): OpeningKind | null {
  if (!slug) return null;
  return (Object.entries(OPENING_SLUGS).find(([, s]) => s === slug)?.[0] as OpeningKind | undefined) ?? null;
}

/** Entries move from the main list to "Earlier" this many days after the effective (or publish) date. */
export const OPENING_ARCHIVE_DAYS = 120;
/** Default homepage placement length when staff leave "featured until" empty. */
export const OPENING_FEATURED_DAYS = 30;

type DateFields = { effectiveDate: Date | null; dateNote: string | null };

/**
 * Date display rule: show the announced date only if one was entered, else the
 * free-text note ("Spring 2027"), else nothing. Never invent a date.
 */
export function openingDateText(o: DateFields): string | null {
  if (o.effectiveDate) return formatDate(o.effectiveDate);
  const note = o.dateNote?.trim();
  return note || null;
}

/** Short lead-in for the date line, e.g. "Opening" / "Opened". */
export function openingDatePrefix(kind: OpeningKind, effectiveDate: Date | null): string {
  const past = !!effectiveDate && effectiveDate.getTime() <= Date.now();
  switch (kind) {
    case "COMING_SOON": return past ? "Opened" : "Opening";
    case "RECENTLY_OPENED": return "Opened";
    case "RELOCATING": return past ? "Moved" : "Moving";
    case "EXPANDING": return past ? "Expanded" : "Expanding";
  }
}

type AgeFields = { kind: string; effectiveDate: Date | null; publishedAt: Date | null; createdAt?: Date };

/**
 * Whether an entry belongs in the "Earlier" archive section.
 * - Recently Opened / Relocating / Expanding: 120 days after the effective date
 *   (or the publish date when no date was announced).
 * - Coming Soon: only once an announced opening date is more than 120 days past
 *   (an undated "coming soon" stays current until staff update it).
 */
export function isArchivedOpening(o: AgeFields, now = new Date()): boolean {
  const cutoff = now.getTime() - OPENING_ARCHIVE_DAYS * 86400_000;
  if (o.kind === "COMING_SOON") return !!o.effectiveDate && o.effectiveDate.getTime() < cutoff;
  const ref = o.effectiveDate ?? o.publishedAt ?? o.createdAt ?? null;
  return !!ref && ref.getTime() < cutoff;
}

/** Display name: connected listing name, else the name typed for an unlisted business, else the title. */
export function openingName(o: { title: string; businessName: string | null; business?: { name: string } | null }) {
  return o.business?.name || o.businessName?.trim() || o.title;
}

export function openingHref(o: { id: string }) {
  return `/new/${o.id}/`;
}

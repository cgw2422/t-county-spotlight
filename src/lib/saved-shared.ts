/**
 * Saved items — constants and types that are safe to import from client code.
 * Server-side resolution lives in `src/lib/saved.ts`.
 */

export const SAVED_KINDS = ["EVENT", "BUSINESS", "PROMOTION", "GARAGE_SALE", "ARTICLE", "PULSE", "ORGANIZATION"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export function isSavedKind(v: unknown): v is SavedKind {
  return typeof v === "string" && (SAVED_KINDS as readonly string[]).includes(v);
}

/** Maximum saved items kept on a device, accepted by the resolve endpoint, or merged at once. */
export const SAVED_MAX = 200;

/** localStorage key for guest saves: `{ type, targetId, savedAt }[]`. */
export const LOCAL_SAVED_KEY = "tct_saved_v1";
/** Set once a guest has seen the "Saved on this device" hint. */
export const LOCAL_SAVED_HINT_KEY = "tct_saved_hint_v1";

/** Section order and headings on the Saved page. */
export const SAVED_SECTIONS: { type: SavedKind; title: string; slug: string }[] = [
  { type: "EVENT", title: "Events", slug: "events" },
  { type: "BUSINESS", title: "Businesses", slug: "businesses" },
  { type: "PROMOTION", title: "Specials", slug: "specials" },
  { type: "GARAGE_SALE", title: "Garage sales", slug: "garage-sales" },
  { type: "ARTICLE", title: "Articles", slug: "articles" },
  { type: "PULSE", title: "Community Pulse", slug: "community-pulse" },
  { type: "ORGANIZATION", title: "Nonprofits & churches", slug: "nonprofits" },
];

/** A saved item resolved to public, display-ready fields only (safe to send to the browser). */
export type ResolvedSaved = {
  type: SavedKind;
  targetId: string;
  /** SavedItem row id for members (used by the remove action); null for device saves. */
  savedId: string | null;
  savedAt: string | null;
  /** False when the item was deleted, unpublished or is otherwise no longer public. */
  available: boolean;
  /** True when the event/sale/special is over (still public, but in the past). */
  ended: boolean;
  /** "Ended", "Expired" or "No longer available" when set. */
  statusLabel: string | null;
  title: string;
  href: string | null;
  image: string | null;
  /** e.g. "Sat, Nov 14 · 9 AM" or "Ends Dec 1". */
  dateLabel: string | null;
  location: string | null;
  /** Small badge such as "Food truck", "Church", "Recurring". */
  badge: string | null;
  /** Extra line, e.g. the next food truck stop. */
  detail: string | null;
  /** Sort key (ms): upcoming date for events/sales, saved time otherwise. */
  sortAt: number;
};

export type LocalSavedEntry = { type: SavedKind; targetId: string; savedAt: string };

/**
 * T County Gives — community (city) and "ways to help" helpers shared by the
 * Gives pages, community pages, the homepage and unified search.
 *
 * Pure (no DB access, no "server-only") so both server and client code can
 * import it. Prisma `where` fragments are plain objects.
 */
import type { Prisma } from "@/generated/prisma/client";
import { toDateInput, fromDateInput } from "./utils";

const ci = (city: string) => ({ equals: city.trim(), mode: "insensitive" as const });

/**
 * Needs in `city`: the need's own `city` when set, otherwise the organization's
 * city. Returns a single `{ OR }` fragment — combine it with other conditions
 * through `AND` (e.g. `openNeedWhere(needCityWhere("Dover"))`), never by spreading
 * it next to another `OR`.
 */
export function needCityWhere(city: string): Prisma.CommunityNeedWhereInput {
  return {
    OR: [
      { city: ci(city) },
      { OR: [{ city: null }, { city: "" }], organization: { city: ci(city) } },
    ],
  };
}

/** Volunteer opportunities in `city`: the opportunity's own city, otherwise the organization's. Same `AND` rule as `needCityWhere`. */
export function opportunityCityWhere(city: string): Prisma.VolunteerOpportunityWhereInput {
  return {
    OR: [
      { city: ci(city) },
      { OR: [{ city: null }, { city: "" }], organization: { city: ci(city) } },
    ],
  };
}

/** Display/filter city for a need or opportunity (own city, else the organization's). */
export function givesCity(x: { city?: string | null; organization?: { city?: string | null } | null }): string | null {
  return x.city?.trim() || x.organization?.city?.trim() || null;
}

/** Start of today in America/New_York. A need whose deadline is before this is expired. */
export function startOfTodayNY(now = new Date()): Date {
  return fromDateInput(`${toDateInput(now).slice(0, 10)}T00:00`) ?? new Date(now.getTime() - 24 * 3600_000);
}

/** Days until a deadline/end (NY calendar days; 0 = today). */
export function daysUntil(d: Date | string | null | undefined, now = new Date()): number | null {
  if (!d) return null;
  const a = Date.parse(`${toDateInput(now).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toDateInput(new Date(d)).slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400_000);
}

/** "Ends soon": the deadline / end date is today or within the next 7 days. */
export const ENDS_SOON_DAYS = 7;
export function endsSoon(d: Date | string | null | undefined, now = new Date()) {
  const n = daysUntil(d, now);
  return n != null && n >= 0 && n <= ENDS_SOON_DAYS;
}
export function endsSoonLabel(d: Date | string | null | undefined, now = new Date()) {
  const n = daysUntil(d, now);
  if (n == null || n < 0 || n > ENDS_SOON_DAYS) return null;
  return n === 0 ? "Ends today" : n === 1 ? "Ends tomorrow" : `Ends in ${n} days`;
}

// ───────── Resident-friendly "ways to help" groupings ─────────

/** `volunteer` lists VolunteerOpportunity rows (plus VOLUNTEERS needs); the rest are CommunityNeed categories. */
export const HELP_TYPES = [
  { key: "volunteer", label: "Volunteer opportunities", short: "Volunteer", categories: ["VOLUNTEERS"] },
  { key: "food", label: "Food pantry needs", short: "Food pantry", categories: ["FOOD"] },
  { key: "clothing", label: "Clothing drives", short: "Clothing", categories: ["CLOTHING"] },
  { key: "supplies", label: "Supply requests", short: "Supplies", categories: ["SUPPLIES", "EQUIPMENT", "HYGIENE", "SCHOOL"] },
  { key: "fundraiser", label: "Fundraisers", short: "Fundraisers", categories: ["FUNDRAISER"] },
  { key: "outreach", label: "Community outreach", short: "Outreach", categories: ["OUTREACH"] },
] as const;
export type HelpTypeKey = (typeof HELP_TYPES)[number]["key"];

export function helpType(key: string | null | undefined) {
  return HELP_TYPES.find((t) => t.key === key) ?? null;
}

/** Group key for a need category (OTHER has no group; it shows under "All"). */
export function helpTypeOfCategory(category: string): HelpTypeKey | null {
  return HELP_TYPES.find((t) => (t.categories as readonly string[]).includes(category))?.key ?? null;
}

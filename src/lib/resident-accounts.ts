/**
 * Free resident accounts ("My T County"): shared copy and the `source` vocabulary
 * used by /register/ links and the aggregate registration funnel.
 * Pure data and helpers only — safe to import from client components.
 */

export const MY_T_COUNTY_NAME = "My T County";
export const MY_T_COUNTY_TAGLINE = "Your T County. Your Way.";
export const MY_T_COUNTY_PITCH =
  "Create a free account to save your favorite places, recommend local businesses, follow your community, and keep track of what's happening around Tuscarawas County.";

export const REGISTER_HEADLINE = "Get Connected to T County.";
export const REGISTER_SUBHEAD =
  "Join your community for free. Discover local events, recommend businesses, save favorites, and personalize your T County experience.";

/** Where a "Create free account" click came from (aggregate analytics only). */
export const REGISTER_SOURCES = ["recommend", "save", "event", "my_t_county", "homepage", "header", "other"] as const;
export type RegisterSource = (typeof REGISTER_SOURCES)[number];

export const REGISTER_SOURCE_LABELS: Record<RegisterSource, string> = {
  recommend: "Recommend a business",
  save: "Save button hint",
  event: "Event reminder",
  my_t_county: "My T County page",
  homepage: "Homepage section",
  header: "Menu / sign-in page",
  other: "Other / direct",
};

export function parseRegisterSource(v: unknown): RegisterSource {
  return typeof v === "string" && (REGISTER_SOURCES as readonly string[]).includes(v) ? (v as RegisterSource) : "other";
}

/** `/register/?source=…&next=…` (next must already be a same-site path). */
export function registerHref(source: RegisterSource, next?: string | null) {
  const p = new URLSearchParams({ source });
  if (next) p.set("next", next);
  return `/register/?${p.toString()}`;
}

/** `/login/?next=…` with the same `source` carried to the "Create a free account" link. */
export function loginHref(next?: string | null, source?: RegisterSource) {
  const p = new URLSearchParams();
  if (next) p.set("next", next);
  if (source && source !== "other") p.set("source", source);
  const s = p.toString();
  return `/login/${s ? `?${s}` : ""}`;
}

/** Benefits that work today (shown on the logged-out My T County page). Never list a feature that doesn't exist. */
export const RESIDENT_BENEFITS = [
  { key: "save", title: "Save your favorites", text: "Keep businesses, events, garage sales and specials in one place, synced on every device." },
  { key: "recommend", title: "Recommend local businesses", text: "Give a thumbs-up to the places you'd tell a neighbor about." },
  { key: "community", title: "Follow your community", text: "Pick your home town and nearby communities so what's local shows up first." },
  { key: "reminders", title: "Optional email reminders", text: "Get a reminder the day before an event you saved, or a weekend summary. Off unless you turn it on." },
  { key: "follow", title: "Follow businesses", text: "Keep the local businesses you follow together in your account." },
] as const;

/** Client-side signal names (window events) shared by the save/recommend buttons and the install prompt. */
export const SAVED_CHANGE_SIGNAL = "tct:saved";
export const ENGAGED_SIGNAL = "tct:engaged";
/** localStorage flag: this device has saved or recommended something (a "meaningful use" for the install invitation). */
export const ENGAGED_KEY = "tct_engaged";

/** Client only: records a meaningful action (save / recommend) on this device. Never sent anywhere. */
export function markEngaged() {
  try { window.localStorage.setItem(ENGAGED_KEY, String(Date.now())); } catch {}
  try { window.dispatchEvent(new Event(ENGAGED_SIGNAL)); } catch {}
}

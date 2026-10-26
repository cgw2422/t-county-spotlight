/** Labels, links and small pure helpers for T-County Gives (safe in client + server code). */

export const GIVES_TAGLINE = "Find a Cause. Meet a Need. Make a Difference.";

export const ORG_KINDS = ["NONPROFIT", "CHURCH", "COMMUNITY_GROUP"] as const;
export type OrgKindValue = (typeof ORG_KINDS)[number];
export const KIND_LABEL: Record<string, string> = { NONPROFIT: "Nonprofit", CHURCH: "Church", COMMUNITY_GROUP: "Community group" };
export const KIND_PLURAL: Record<string, string> = { NONPROFIT: "Nonprofits", CHURCH: "Churches", COMMUNITY_GROUP: "Community groups" };
export const KIND_PARAM: Record<string, OrgKindValue> = { nonprofit: "NONPROFIT", church: "CHURCH", community: "COMMUNITY_GROUP" };
export const KIND_TO_PARAM: Record<string, string> = { NONPROFIT: "nonprofit", CHURCH: "church", COMMUNITY_GROUP: "community" };

export const ORG_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending review", APPROVED: "Approved", REJECTED: "Not approved", SUSPENDED: "Suspended", ARCHIVED: "Archived",
};

export const ORG_ROLES = ["OWNER", "ADMIN", "EDITOR"] as const;
export type OrgRoleValue = (typeof ORG_ROLES)[number];
export const ROLE_RANK: Record<OrgRoleValue, number> = { EDITOR: 1, ADMIN: 2, OWNER: 3 };
export const ORG_ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", EDITOR: "Editor" };
export const ORG_ROLE_HELP: Record<string, string> = {
  OWNER: "Full control, including the team",
  ADMIN: "Can manage everything and add team members",
  EDITOR: "Can edit the profile, needs, volunteer opportunities and updates",
};

export const NEED_CATEGORIES = ["VOLUNTEERS", "SUPPLIES", "FOOD", "CLOTHING", "EQUIPMENT", "HYGIENE", "SCHOOL", "OTHER"] as const;
export const NEED_CATEGORY_LABEL: Record<string, string> = {
  VOLUNTEERS: "Volunteers", SUPPLIES: "Supplies", FOOD: "Food", CLOTHING: "Clothing", EQUIPMENT: "Equipment",
  HYGIENE: "Hygiene items", SCHOOL: "School supplies", OTHER: "Other",
};
export const NEED_URGENCIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const URGENCY_LABEL: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
export const URGENCY_BADGE: Record<string, string> = { LOW: "badge-gray", MEDIUM: "badge-blue", HIGH: "badge-orange", CRITICAL: "badge-red" };
export const NEED_STATUSES = ["DRAFT", "OPEN", "PARTIALLY_FULFILLED", "FULFILLED", "CLOSED"] as const;
export const NEED_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft (hidden)", OPEN: "Open", PARTIALLY_FULFILLED: "Partially met", FULFILLED: "Fulfilled", CLOSED: "Closed",
};
export const PLEDGE_STATUS_LABEL: Record<string, string> = {
  PLEDGED: "Pledged — not yet received", RECEIVED: "Received", PARTIALLY_RECEIVED: "Partly received", CANCELLED: "Cancelled",
};

export const OPPORTUNITY_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED"] as const;
export const OPPORTUNITY_STATUS_LABEL: Record<string, string> = { DRAFT: "Draft (hidden)", PUBLISHED: "Published", CLOSED: "Sign-ups closed", CANCELLED: "Cancelled" };
export const SIGNUP_STATUSES = ["REGISTERED", "CONFIRMED", "WAITLISTED", "CANCELLED", "ATTENDED", "NO_SHOW"] as const;
export const SIGNUP_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Registered", CONFIRMED: "Confirmed", WAITLISTED: "Waitlisted", CANCELLED: "Cancelled", ATTENDED: "Attended", NO_SHOW: "No-show",
};
export const SIGNUP_BADGE: Record<string, string> = {
  REGISTERED: "badge-blue", CONFIRMED: "badge-green", WAITLISTED: "badge-amber", CANCELLED: "badge-gray", ATTENDED: "badge-green", NO_SHOW: "badge-red",
};
/** Signups that hold a spot. */
export const ACTIVE_SIGNUP_STATUSES = ["REGISTERED", "CONFIRMED"] as const;

export const SOCIAL_KEYS = [
  { key: "facebook", label: "Facebook" }, { key: "instagram", label: "Instagram" }, { key: "x", label: "X (Twitter)" },
  { key: "youtube", label: "YouTube" }, { key: "tiktok", label: "TikTok" }, { key: "linkedin", label: "LinkedIn" },
] as const;

export const SERVICE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const SERVICE_DAY_NAMES: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

export type ServiceTime = { day: string; time: string; label: string };
export type Leader = { name: string; role: string };

export function readServiceTimes(raw: unknown): ServiceTime[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ day: String(r.day ?? ""), time: String(r.time ?? ""), label: String(r.label ?? "") }))
    .filter((r) => (SERVICE_DAYS as readonly string[]).includes(r.day) && /^\d{2}:\d{2}$/.test(r.time))
    .sort((a, b) => SERVICE_DAYS.indexOf(a.day as never) - SERVICE_DAYS.indexOf(b.day as never) || a.time.localeCompare(b.time));
}

export function readLeaders(raw: unknown): Leader[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ name: String(r.name ?? "").trim(), role: String(r.role ?? "").trim() }))
    .filter((r) => r.name);
}

export function format12(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${ampm}` : `${hh} ${ampm}`;
}

/** Next service occurrence from `now` (America/New_York wall clock). */
export function nextService(times: ServiceTime[], now = new Date()) {
  if (!times.length) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hh = (parts.find((p) => p.type === "hour")?.value ?? "00").replace("24", "00");
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const today = SERVICE_DAYS.indexOf(wd as never);
  const nowT = `${hh}:${mm}`;
  let best: { s: ServiceTime; offset: number } | null = null;
  for (const s of times) {
    let offset = (SERVICE_DAYS.indexOf(s.day as never) - today + 7) % 7;
    if (offset === 0 && s.time <= nowT) offset = 7;
    if (!best || offset < best.offset || (offset === best.offset && s.time < best.s.time)) best = { s, offset };
  }
  if (!best) return null;
  const when = best.offset === 0 ? "Today" : best.offset === 1 ? "Tomorrow" : SERVICE_DAY_NAMES[best.s.day];
  return { ...best.s, when, label12: format12(best.s.time) };
}

// ───────── links ─────────
export function orgHref(o: { slug: string; kind?: string | null }) {
  return o.kind === "CHURCH" ? `/churches/${o.slug}/` : `/organizations/${o.slug}/`;
}
export function needHref(n: { slug: string }) {
  return `/gives/needs/${n.slug}/`;
}
export function opportunityHref(o: { slug: string }) {
  return `/gives/volunteer/${o.slug}/`;
}

export function safeSocials(raw: unknown) {
  if (!raw || typeof raw !== "object") return [];
  const labels = Object.fromEntries(SOCIAL_KEYS.map((s) => [s.key, s.label])) as Record<string, string>;
  return Object.entries(raw as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && /^https?:\/\//i.test(v as string))
    .map(([k, v]) => ({ key: k, label: labels[k] ?? k, url: v as string }));
}

export function externalUrl(w: string | null | undefined) {
  if (!w) return null;
  const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

export function directionsUrl(o: { name: string; address?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  if (!o.address) return null;
  const addr = [o.address, o.city, [o.state, o.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${o.name}, ${addr}`)}`;
}

export function mapsUrl(q: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

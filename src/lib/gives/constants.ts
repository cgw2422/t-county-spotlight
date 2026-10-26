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

// ───────── Ownership & claims ─────────
export const OWNERSHIP_LABEL: Record<string, string> = { UNCLAIMED: "Unclaimed", CLAIM_PENDING: "Claim pending", CLAIMED: "Claimed" };
export const OWNERSHIP_BADGE: Record<string, string> = { UNCLAIMED: "badge-gray", CLAIM_PENDING: "badge-amber", CLAIMED: "badge-green" };
export const ORG_SOURCE_LABEL: Record<string, string> = { admin: "Added by staff", import: "CSV import", self_registered: "Self-registered" };
export const CLAIM_STATUS_LABEL: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };
export const CLAIM_STATUS_BADGE: Record<string, string> = { PENDING: "badge-amber", APPROVED: "badge-green", REJECTED: "badge-red", WITHDRAWN: "badge-gray" };
export const CLAIM_ROLES = ["Pastor/Minister", "Executive Director", "Staff member", "Board member", "Volunteer coordinator", "Other"] as const;
export const CLAIM_VERIFY_METHODS = [
  { value: "org_email", label: "Email at the organization's domain" },
  { value: "phone_callback", label: "Call the organization's public phone number" },
  { value: "document", label: "Documentation (letter on letterhead, IRS determination letter…)" },
  { value: "other", label: "Other" },
] as const;
export const CLAIM_VERIFY_LABEL: Record<string, string> = Object.fromEntries(CLAIM_VERIFY_METHODS.map((m) => [m.value, m.label]));
export function claimHref(o: { slug: string }) {
  return `/gives/claim/${o.slug}/`;
}

const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com", "yandex.com",
  "pm.me", "hotmail.co.uk", "yahoo.co.uk", "att.net", "sbcglobal.net", "comcast.net", "verizon.net", "frontier.com", "frontiernet.net", "charter.net", "spectrum.net", "roadrunner.com", "rr.com",
]);

/** Approximate registrable domain ("www.dover.k12.oh.us" → "k12.oh.us" is avoided for 2-letter ccTLD second levels). */
export function registrableDomain(host: string) {
  const parts = host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (tld.length === 2 && ["co", "com", "org", "net", "gov", "edu", "ac", "k12", "or", "ne"].includes(sld)) return parts.slice(-3).join(".");
  if (tld === "us" && parts.length >= 4) return parts.slice(-4).join("."); // e.g. dover.k12.oh.us
  return parts.slice(-2).join(".");
}

/** Website host without "www.", or null. */
export function websiteHost(w: string | null | undefined) {
  return externalUrl(w)?.hostname.toLowerCase().replace(/^www\./, "") || null;
}

/** True when the email's domain belongs to the organization's website domain (free mail providers never match). */
export function emailMatchesWebsite(email: string, website: string | null | undefined) {
  const host = websiteHost(website);
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!host || !domain || isPersonalEmailDomain(email)) return false;
  return registrableDomain(domain) === registrableDomain(host);
}

// ───────── Listing provenance (staff-maintained listings) ─────────
export const IMAGE_RIGHTS = [
  { value: "provided_by_org", label: "Provided by the organization" },
  { value: "licensed", label: "Licensed" },
  { value: "own_photo", label: "Our own photo" },
  { value: "public_domain_cc", label: "Public domain or CC with attribution" },
  { value: "other", label: "Other" },
] as const;
export const IMAGE_RIGHTS_LABEL: Record<string, string> = Object.fromEntries(IMAGE_RIGHTS.map((r) => [r.value, r.label]));
/** imageRights is stored as "<key>" or "<key>: <note>". */
export function readImageRights(raw: string | null | undefined) {
  if (!raw) return { key: "", note: "" };
  const i = raw.indexOf(":");
  const key = (i < 0 ? raw : raw.slice(0, i)).trim();
  const note = i < 0 ? "" : raw.slice(i + 1).trim();
  if (IMAGE_RIGHTS_LABEL[key]) return { key, note };
  return { key: "other", note: raw.trim() };
}
/** Listings whose information hasn't been checked for this long count as stale. */
export const STALE_AFTER_DAYS = 365;

/** Personal mailbox providers — never sufficient on their own to prove affiliation. */
export function isPersonalEmailDomain(email: string) {
  const d = email.split("@")[1]?.toLowerCase().trim() ?? "";
  return FREE_EMAIL_PROVIDERS.has(d) || /(^|\.)(gmail|yahoo|outlook|hotmail|icloud|aol|proton|protonmail|live|msn)\./.test(d);
}

/** What a reviewer actually did to verify a claim (stored in the claim's reviewNote). */
export const CLAIM_REVIEW_CHECKS: Record<string, string> = {
  domain_email: "Organization-domain email confirmed",
  phone_call: "Called the organization's public phone number",
  documentation: "Documentation reviewed",
  other: "Other",
};

/** Why a claim's email evidence is weak on its own (approval then needs an override note). */
export function claimRiskReasons(c: { email: string; emailVerifiedAt: Date | null; emailDomainMatches: boolean }) {
  const reasons: string[] = [];
  if (!c.emailVerifiedAt) reasons.push("the organization email is not confirmed");
  if (isPersonalEmailDomain(c.email)) reasons.push("it uses a personal email provider");
  else if (!c.emailDomainMatches) reasons.push("the email domain doesn't match the listing's website");
  return reasons;
}
export function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400_000);
}

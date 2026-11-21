/**
 * "Recommend a Business" — shared, dependency-free rules (used by the public form, server actions, admin and tests).
 * Not the thumbs-up "community recommendations" of listings that already exist.
 */

export const LEAD_STATUSES = ["NEW", "REVIEWING", "CONTACTED", "ADDED", "DECLINED"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { NEW: "New", REVIEWING: "Reviewing", CONTACTED: "Contacted", ADDED: "Added", DECLINED: "Declined" };

export const LEAD_LIMITS = { name: 150, city: 80, website: 300, category: 80, reason: 1000, firstName: 60, email: 200, maxLinksInReason: 2 } as const;

export const RECOMMEND_PATH = "/recommend-a-business/";
export const ADD_YOUR_BUSINESS_PATH = "/add-your-business/";
export const ADD_YOUR_BUSINESS_URL = "https://tcountyconnect.com/add-your-business/";
export const INVITATION_MESSAGE =
  `Hey! I came across T County Connect, a new website helping people discover local businesses and events around Tuscarawas County. Thought you might want to get your business listed! ${ADD_YOUR_BUSINESS_URL}`;
export const RECOMMEND_CONFIRMATION =
  "Thanks for helping us connect Tuscarawas County! We've received your recommendation and will work on getting this business added to T County Connect.";

/** sms: link with the body prefilled. "?&body=" opens the composer on both iOS and Android. */
export const smsHref = (body: string) => `sms:?&body=${encodeURIComponent(body)}`;
/** Facebook's standard share dialog for a URL. */
export const facebookShareHref = (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

const NAME_NOISE = new Set(["the", "llc", "inc", "incorporated", "co", "company", "corp", "corporation", "ltd", "limited", "pllc", "llp"]);

/** Business name for grouping: case, punctuation, "&"/"and", apostrophes and legal suffixes don't matter. */
export function normalizeBusinessName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NAME_NOISE.has(w))
    .join(" ")
    .trim();
}

/** Town for grouping (already canonicalized to a community name when it matches one). */
export function normalizeTown(city: string) {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export const leadMatchKey = (name: string, city: string) => `${normalizeBusinessName(name)}|${normalizeTown(city)}`;

/** Accepts "example.com", "www.facebook.com/joesdiner" or a full http(s) URL. Returns a normalized https?:// URL or null. */
export function normalizeWebsite(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/\s/.test(v)) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : /^[a-z][a-z0-9+.-]*:/i.test(v) ? null : `https://${v}`;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    if (u.username || u.password) return null;
    return u.toString().slice(0, 300);
  } catch {
    return null;
  }
}

/** Grouping key for a website: the host, or facebook.com/<page> for Facebook pages. */
export function websiteKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
    if (host === "facebook.com" || host === "fb.com" || host === "fb.me") {
      const seg = u.pathname.split("/").filter(Boolean);
      if (!seg.length) return null;
      if (seg[0] === "profile.php") { const id = u.searchParams.get("id"); return id ? `facebook.com/id/${id}` : null; }
      if (seg[0] === "people" && seg[2]) return `facebook.com/id/${seg[2]}`;
      if (seg[0] === "pages" && seg.length >= 2) return `facebook.com/${seg[seg.length - 1].toLowerCase()}`;
      return `facebook.com/${seg[0].toLowerCase()}`;
    }
    if (host === "instagram.com") {
      const seg = u.pathname.split("/").filter(Boolean);
      return seg[0] ? `instagram.com/${seg[0].toLowerCase()}` : null;
    }
    // Generic hosts that aren't the business's own site never group recommendations together.
    if (/(^|\.)(google\.com|goo\.gl|yelp\.com|linktr\.ee|bit\.ly|tcountyconnect\.com|tcountyspotlight\.com)$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

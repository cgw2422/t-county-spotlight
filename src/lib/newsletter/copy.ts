// Client-safe constants and copy helpers for the T County Connect newsletter (no server imports).
// There is no separate newsletter brand: it is simply the T County Connect newsletter.
// The name, signup heading, supporting line, button and nav label are plain-text settings
// in Admin → Newsletter → Settings (the "newsletter" Setting row); these are the fallbacks.
// Subscribers, consent records and preferences are unchanged by a rename.

/** Fallback name; prose reads "the T County Connect newsletter". */
export const DEFAULT_NEWSLETTER_NAME = "T County Connect";
export const NEWSLETTER_NAME = DEFAULT_NEWSLETTER_NAME;
/** Navigation label and /newsletter/ page title. */
export const DEFAULT_NAV_LABEL = "Newsletter";
/** Signup card heading (homepage hero and every signup card). */
export const DEFAULT_SIGNUP_HEADING = "Get T County Connect in your inbox";
export const DEFAULT_SIGNUP_TAGLINE = "Local stories, weekend plans, and what's new across Tuscarawas County.";
/** Built-in form button. (beehiiv's own button text is set inside beehiiv.) */
export const DEFAULT_SIGNUP_BUTTON = "Sign me up";
/** Previous default headline; homepage sections still carrying it use the signup heading instead. */
export const LEGACY_SIGNUP_HEADLINE = "Love Local. Stay in the Loop.";
export const SIGNUP_DISCLAIMER = "Free to subscribe. Unsubscribe anytime.";
export const PRIVACY_PATH = "/newsletter/#privacy";

/** Mid-sentence form: "the T County Connect newsletter". */
export function theName(name: string) {
  const n = name.trim() || DEFAULT_NEWSLETTER_NAME;
  return /newsletter$/i.test(n) ? (/^the\s/i.test(n) ? n : `the ${n}`) : `the ${n} newsletter`;
}
/** Title-ish form without the article: "T County Connect newsletter". */
export function plainName(name: string) {
  return theName(name).replace(/^the\s+/i, "");
}
/** Sentence-start form: "The T County Connect newsletter". */
export function TheName(name: string) {
  const t = theName(name);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export type NewsletterTextSettings = { name?: string; heading?: string; tagline?: string; button?: string; navLabel?: string };

export type NewsletterCopy = {
  /** "T County Connect" */
  name: string;
  /** "Newsletter" */
  navLabel: string;
  /** "Get T County Connect in your inbox" */
  heading: string;
  tagline: string;
  /** "Sign me up" */
  button: string;
  consentText: string;
  registerOptInLabel: string;
  registerConsentText: string;
  frequencyNote: string;
};

/** Every piece of signup/consent wording, from the (editable) settings with fallbacks. */
export function newsletterCopy(t: NewsletterTextSettings = {}): NewsletterCopy {
  const name = t.name?.trim() || DEFAULT_NEWSLETTER_NAME;
  const heading = t.heading?.trim() || DEFAULT_SIGNUP_HEADING;
  const tagline = t.tagline?.trim() || DEFAULT_SIGNUP_TAGLINE;
  const button = t.button?.trim() || DEFAULT_SIGNUP_BUTTON;
  const navLabel = t.navLabel?.trim() || DEFAULT_NAV_LABEL;
  const registerOptInLabel = `Send me ${theName(name)} (free)`;
  return {
    name, navLabel, heading, tagline, button,
    /** The exact wording a person sees when they subscribe. Stored with each signup as proof of consent. */
    consentText: `${heading} ${tagline} [${button}] ${SIGNUP_DISCLAIMER} How we use your email: ${PRIVACY_PATH}`,
    registerOptInLabel,
    registerConsentText: `[x] ${registerOptInLabel}. ${tagline} ${SIGNUP_DISCLAIMER} We'll email you a link to confirm first. How we use your email: ${PRIVACY_PATH}`,
    frequencyNote: `${TheName(name)} arrives about once a week, with an occasional special edition for big local happenings.`,
  };
}

const DEFAULT_COPY = newsletterCopy();
// Back-compat constants (defaults). UI and emails use newsletterCopy(settings) via getNewsletterConfig().
export const SIGNUP_HEADLINE = DEFAULT_COPY.heading;
export const SIGNUP_DESCRIPTION = DEFAULT_COPY.tagline;
export const SIGNUP_BUTTON = DEFAULT_COPY.button;
export const SIGNUP_BUTTON_LABEL = DEFAULT_COPY.button;
export const CONSENT_TEXT = DEFAULT_COPY.consentText;

/** Neutral reply for every signup, whatever the address's status (never reveals whether someone is subscribed). */
export const SIGNUP_NEUTRAL_MESSAGE =
  "Check your inbox! If this address isn't subscribed yet, we've sent a link to confirm your subscription. It expires in 48 hours.";

export const SIGNUP_SOURCES = ["homepage", "footer", "article", "event", "pwa", "newsletter_page", "account", "admin_invite", "register"] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];
/** Sources the public signup form accepts ("register" is only set by the account registration form). */
export const PUBLIC_SIGNUP_SOURCES = SIGNUP_SOURCES.filter((s) => s !== "admin_invite" && s !== "register");

/** Optional, unchecked-by-default checkbox on /register/ (built-in provider only). Its exact wording is stored as consent. */
export const REGISTER_OPT_IN_LABEL = DEFAULT_COPY.registerOptInLabel;
export const REGISTER_CONSENT_TEXT = DEFAULT_COPY.registerConsentText;

export const SOURCE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  footer: "Footer",
  article: "Article",
  event: "Event page",
  pwa: "App (Explore)",
  newsletter_page: "Newsletter page",
  account: "Account",
  admin_invite: "Admin invite",
  register: "Account registration",
};

export const TOPICS = [
  { key: "events", label: "Local events", help: "Festivals, fairs, concerts and what's on this week." },
  { key: "stories", label: "Community stories", help: "News and stories from around the county." },
  { key: "spotlights", label: "Business spotlights", help: "Meet the people behind local businesses." },
  { key: "specials", label: "Local specials", help: "Deals and offers from local businesses (may include sponsored content)." },
  { key: "gives", label: "T County Gives", help: "Community needs and local nonprofits." },
] as const;
export type TopicKey = (typeof TOPICS)[number]["key"];
export type Preferences = Record<TopicKey, boolean>;

export function readPreferences(v: unknown): Preferences {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(TOPICS.map((t) => [t.key, o[t.key] !== false])) as Preferences;
}

export const FREQUENCY_NOTE = DEFAULT_COPY.frequencyNote;

export const NEWSLETTER_PROVIDERS = ["builtin", "beehiiv"] as const;
export type NewsletterProvider = (typeof NEWSLETTER_PROVIDERS)[number];
/** Where beehiiv's subscribe form should send people after they sign up. */
export const THANKS_PATH = "/newsletter/thanks/";

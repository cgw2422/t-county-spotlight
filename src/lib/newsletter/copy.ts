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
export const SIGNUP_DISCLAIMER = "Free to join. Unsubscribe anytime.";
/** Line under the native (beehiiv) signup form. Editable in Admin → Newsletter → Settings. */
export const DEFAULT_SIGNUP_FOOTNOTE = "Free to join. Unsubscribe anytime.";
/** Visible label of the email field. */
export const SIGNUP_FIELD_LABEL = "Email address";
export const PRIVACY_PATH = "/newsletter/#privacy";

/** Optional newsletter checkbox on /register/ and the homepage My T County signup (both providers). */
export const REGISTER_NEWSLETTER_LABEL = "Email me the T County Connect newsletter.";
/** Built-in provider: shown after registration when that box was ticked; never claims a subscription. */
export const REGISTER_NEWSLETTER_NOTE = "If you asked for the newsletter, check your inbox for a confirmation from T County Connect.";
/** beehiiv provider: shown after registration when the box was ticked and beehiiv made the address active. */
export const REGISTER_NEWSLETTER_SUBSCRIBED = "You're subscribed to the T County Connect newsletter. Look for a welcome email.";
/** Shown after registration when the box was ticked but the newsletter signup failed (account still created). Followed by a link to SUBSCRIBE_PATH. */
export const REGISTER_NEWSLETTER_FAILED = "Your account is ready, but the newsletter signup didn't go through. You can try again at";

/** Shareable, public newsletter signup page (no account needed). /newsletter/ stays the archive. */
export const SUBSCRIBE_PATH = "/newsletter/subscribe/";
/** Fixed copy of /newsletter/subscribe/ (also its share preview). */
export const SUBSCRIBE_PAGE = {
  heading: "Get T County Connect in your inbox",
  description: "Local stories, weekend plans, and what's new across Tuscarawas County.",
  button: "Sign me up",
  footnote: "Free to join. Unsubscribe anytime.",
  archiveLink: "Read past issues",
  nextHeading: "Want to make T County Connect yours?",
  nextText: "Create a free account to save places, keep track of favorites, give local businesses a thumbs up, and choose the community you want to follow.",
  nextButton: "Create a free account",
} as const;

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

export type NewsletterTextSettings = { name?: string; heading?: string; tagline?: string; button?: string; navLabel?: string; footnote?: string };

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
  /** "Free to join. Unsubscribe anytime." (native beehiiv form) */
  footnote: string;
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
  const footnote = t.footnote?.trim() || DEFAULT_SIGNUP_FOOTNOTE;
  const registerOptInLabel = `Send me ${theName(name)} (free)`;
  return {
    name, navLabel, heading, tagline, button, footnote,
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

export const SIGNUP_SOURCES = ["homepage", "footer", "article", "event", "pwa", "newsletter_page", "subscribe_page", "account", "admin_invite", "register"] as const;
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
  subscribe_page: "Subscribe page",
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
/** Former redirect target of beehiiv's embedded form. Kept as a page for old links; the native form never redirects. */
export const THANKS_PATH = "/newsletter/thanks/";

/**
 * Native signup form placements (sent to beehiiv as utm_campaign). The browser
 * sends one of these; the server re-checks it against this list.
 */
export const SIGNUP_PLACEMENTS = ["subscribe_page", "homepage_hero", "homepage", "newsletter_page", "newsletter_issue", "footer", "article", "event", "explore", "account"] as const;
export type SignupPlacement = (typeof SIGNUP_PLACEMENTS)[number];

/**
 * What the native form says after beehiiv answers (single opt-in + welcome email). Never reveals more than this.
 *   subscribed: new address, beehiiv says active (welcome email requested)
 *   already:    by_email lookup found an active subscription (nothing sent)
 *   finishing:  beehiiv still "validating" after one short re-check (never claims subscribed)
 *   pending:    unexpected with double_opt_override "off" (a confirmation email went out)
 *   neutral:    inactive / unsubscribed / invalid / needs_attention (never reactivated)
 */
export const BEEHIIV_SIGNUP_MESSAGES = {
  subscribed: "You're subscribed! Look for a welcome email from T County Connect.",
  already: "You're already subscribed. Look for the next issue from T County Connect.",
  finishing: "Thanks — we're finishing your signup. Look for a welcome email from T County Connect shortly.",
  pending: "Almost done — check your inbox to confirm your subscription.",
  neutral: "Thanks. If this address can receive our newsletter, you'll hear from us soon. If you unsubscribed before, use the link in a past issue to rejoin.",
  retry: "We couldn't sign you up just now. Please try again in a minute.",
  invalidEmail: "Please enter a valid email address.",
  tooMany: "Too many signup attempts. Please try again in a few minutes.",
} as const;

/** Signup outcomes after which the subscribe page may offer a free account (signed-out visitors only). */
export const SUCCESS_OUTCOMES = ["subscribed", "already"] as const;

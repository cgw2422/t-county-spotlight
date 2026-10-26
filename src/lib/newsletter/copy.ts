// Client-safe constants for the T-County Weekly newsletter (no server imports).

export const NEWSLETTER_NAME = "T-County Weekly";
export const SIGNUP_HEADLINE = "Love Local. Stay in the Loop.";
export const SIGNUP_DESCRIPTION =
  "Get local events, community stories, business spotlights, and things to do around Tuscarawas County delivered to your inbox.";
export const SIGNUP_BUTTON = "Get the T-County Weekly";
export const SIGNUP_DISCLAIMER = "Free to subscribe. Unsubscribe anytime.";
export const PRIVACY_PATH = "/newsletter/#privacy";

/** The exact wording a person sees when they subscribe. Stored with each signup as proof of consent. */
export const CONSENT_TEXT = `${SIGNUP_HEADLINE} ${SIGNUP_DESCRIPTION} [${SIGNUP_BUTTON}] ${SIGNUP_DISCLAIMER} How we use your email: ${PRIVACY_PATH}`;

/** Neutral reply for every signup, whatever the address's status (never reveals whether someone is subscribed). */
export const SIGNUP_NEUTRAL_MESSAGE =
  "Check your inbox! If this address isn't subscribed yet, we've sent a link to confirm your subscription. It expires in 48 hours.";

export const SIGNUP_SOURCES = ["homepage", "footer", "article", "event", "pwa", "newsletter_page", "account", "admin_invite"] as const;
export type SignupSource = (typeof SIGNUP_SOURCES)[number];
export const PUBLIC_SIGNUP_SOURCES = SIGNUP_SOURCES.filter((s) => s !== "admin_invite");

export const SOURCE_LABELS: Record<string, string> = {
  homepage: "Homepage",
  footer: "Footer",
  article: "Article",
  event: "Event page",
  pwa: "App (Explore)",
  newsletter_page: "Newsletter page",
  account: "Account",
  admin_invite: "Admin invite",
};

export const TOPICS = [
  { key: "events", label: "Local events", help: "Festivals, fairs, concerts and what's on this week." },
  { key: "stories", label: "Community stories", help: "News and stories from around the county." },
  { key: "spotlights", label: "Business spotlights", help: "Meet the people behind local businesses." },
  { key: "specials", label: "Local specials", help: "Deals and offers from local businesses (may include sponsored content)." },
  { key: "gives", label: "T-County Gives", help: "Community needs and local nonprofits." },
] as const;
export type TopicKey = (typeof TOPICS)[number]["key"];
export type Preferences = Record<TopicKey, boolean>;

export function readPreferences(v: unknown): Preferences {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(TOPICS.map((t) => [t.key, o[t.key] !== false])) as Preferences;
}

export const FREQUENCY_NOTE = "The T-County Weekly arrives about once a week, with an occasional special edition for big local happenings.";

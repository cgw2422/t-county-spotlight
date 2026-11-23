/**
 * Newsletter designer — content model (stored as NewsletterDesign.content JSON). Pure TS, shared by the editor
 * (client), the server actions and the renderer. The header and footer are fixed parts of the template; every
 * other section is optional and reorderable.
 */

export type SectionType = "intro" | "featured" | "sponsor" | "weather" | "events" | "articles" | "spotlight" | "promo" | "custom" | "toc" | "joke" | "poll";

/**
 * Text fields marked "rich" accept the editor's formatting (paragraphs, bold, italic, underline, links, lists);
 * older plain-text values still render (line breaks kept). There are no length or count limits beyond a high
 * technical ceiling; the editor warns when an issue gets big enough for Gmail to clip it.
 */
/** A story card: copied from a T County Connect article (still editable) or entered by hand. `description` is rich. */
export type StoryItem = { id: string; articleId?: string | null; title: string; description: string; imageUrl: string; url: string };
/** Entered by hand only — events are never added automatically. */
export type EventItem = { id: string; title: string; date: string; time: string; location: string; description: string; imageUrl: string; url: string };
/**
 * One line of "In This T County Connect Issue". `sectionId` is the section id, or "sectionId:itemId" for one story
 * in More stories. `label` null = follow the content automatically (e.g. the featured article's headline);
 * a string = your own wording.
 */
export type TocEntry = { sectionId: string; label: string | null };
/** A line the overview builds from the issue's content. */
export type TocItem = { key: string; label: string };
/** A native beehiiv poll chosen from your publication (inserted as a real beehiiv poll block in the draft). */
export type PollRef = { id: string; name: string; question: string; choices: string[] };
export type SpotlightBusiness = { businessId?: string | null; name: string; imageUrl: string; text: string; url: string };

export type Section =
  | { id: string; type: "intro"; enabled: boolean; heading: string; html: string; signature: string }
  | { id: string; type: "featured"; enabled: boolean; heading: string; story: StoryItem | null; ctaLabel: string }
  | { id: string; type: "sponsor"; enabled: boolean }
  | { id: string; type: "weather"; enabled: boolean; heading: string }
  | { id: string; type: "events"; enabled: boolean; heading: string; items: EventItem[] }
  | { id: string; type: "articles"; enabled: boolean; heading: string; items: StoryItem[] }
  | { id: string; type: "spotlight"; enabled: boolean; heading: string; business: SpotlightBusiness | null }
  | { id: string; type: "promo"; enabled: boolean; heading: string; text: string; ctaLabel: string; ctaUrl: string }
  /** Anything else: your own heading, text, image and button. Add as many as you like. */
  /** Overview of the issue. Entries follow the included sections automatically; you can reword and reorder them. */
  | { id: string; type: "toc"; enabled: boolean; heading: string; entries: TocEntry[] }
  /** Written by you for each issue — never generated or fetched. */
  | { id: string; type: "joke"; enabled: boolean; heading: string; intro: string; setup: string; punchline: string }
  | { id: string; type: "poll"; enabled: boolean; heading: string; intro: string; poll: PollRef | null }
  | { id: string; type: "custom"; enabled: boolean; heading: string; title: string; html: string; imageUrl: string; imageLink: string; ctaLabel: string; ctaUrl: string };

export type DesignContent = { version: 1; sections: Section[] };

export const SECTION_INFO: Record<SectionType, { label: string; help: string }> = {
  intro: { label: "Personal introduction", help: "A note from you at the top of the issue." },
  featured: { label: "Featured article", help: "One big story with a large image." },
  sponsor: { label: "Sponsor (beehiiv ad)", help: "Marks where your beehiiv Ad Network ad goes. You add the ad in beehiiv." },
  weather: { label: "Local weather", help: "3-day forecast for New Philadelphia from the weather feed." },
  events: { label: "Upcoming events", help: "Events you add by hand." },
  articles: { label: "More stories", help: "Additional articles with thumbnails." },
  spotlight: { label: "Business Spotlight", help: "One local business to feature." },
  promo: { label: "Explore T County Connect", help: "Invite readers to the website." },
  custom: { label: "Custom section", help: "Your own heading, text, image and button." },
  toc: { label: "In This T County Connect Issue", help: "A compact overview of what's in this issue." },
  joke: { label: "Daily Dad Joke", help: "Your joke: setup and punchline." },
  poll: { label: "Community Poll", help: "A native beehiiv poll (voting and results stay in beehiiv)." },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** The reusable template: the sections every new issue starts with (in this order). */
export function defaultContent(): DesignContent {
  return {
    version: 1,
    sections: [
      { id: uid(), type: "intro", enabled: true, heading: "", html: "<p>Hi neighbors,</p><p>Here&#39;s what&#39;s happening around Tuscarawas County this week.</p>", signature: "Cody, T County Connect" },
      { id: uid(), type: "toc", enabled: true, heading: "In This T County Connect Issue", entries: [] },
      { id: uid(), type: "featured", enabled: true, heading: "Top Story", story: null, ctaLabel: "Read More" },
      { id: uid(), type: "sponsor", enabled: true },
      { id: uid(), type: "weather", enabled: true, heading: "Your 3-Day Forecast" },
      { id: uid(), type: "events", enabled: true, heading: "Upcoming Events", items: [] },
      { id: uid(), type: "articles", enabled: true, heading: "More From T County Connect", items: [] },
      { id: uid(), type: "spotlight", enabled: true, heading: "Business Spotlight", business: null },
      { id: uid(), type: "joke", enabled: true, heading: "Daily Dad Joke", intro: "", setup: "", punchline: "" },
      { id: uid(), type: "poll", enabled: true, heading: "Community Poll", intro: "", poll: null },
      {
        id: uid(), type: "promo", enabled: true, heading: "Explore More on T County Connect",
        text: "Find local businesses, upcoming events, churches, nonprofits and community resources across Tuscarawas County, all in one place.",
        ctaLabel: "Visit TCountyConnect.com", ctaUrl: "https://tcountyconnect.com/",
      },
    ],
  };
}

export const emptyStory = (): StoryItem => ({ id: uid(), articleId: null, title: "", description: "", imageUrl: "", url: "" });
export const emptyEvent = (): EventItem => ({ id: uid(), title: "", date: "", time: "", location: "", description: "", imageUrl: "", url: "" });
export const emptyBusiness = (): SpotlightBusiness => ({ businessId: null, name: "", imageUrl: "", text: "", url: "" });

/** Sections you can add to an issue (any number of each, except one weather section is plenty). */
export const ADDABLE: SectionType[] = ["custom", "featured", "articles", "events", "spotlight", "joke", "poll", "sponsor", "promo", "toc", "intro", "weather"];

/** A fresh section of `type`, ready to fill in. */
export function newSection(type: SectionType): Section {
  const id = uid();
  switch (type) {
    case "intro": return { id, type, enabled: true, heading: "", html: "", signature: "" };
    case "featured": return { id, type, enabled: true, heading: "Featured", story: null, ctaLabel: "Read More" };
    case "sponsor": return { id, type, enabled: true };
    case "weather": return { id, type, enabled: true, heading: "Your 3-Day Forecast" };
    case "events": return { id, type, enabled: true, heading: "Upcoming Events", items: [] };
    case "articles": return { id, type, enabled: true, heading: "More Stories", items: [] };
    case "spotlight": return { id, type, enabled: true, heading: "Business Spotlight", business: null };
    case "promo": return { id, type, enabled: true, heading: "", text: "", ctaLabel: "", ctaUrl: "" };
    case "custom": return { id, type, enabled: true, heading: "", title: "", html: "", imageUrl: "", imageLink: "", ctaLabel: "", ctaUrl: "" };
    case "toc": return { id, type, enabled: true, heading: "In This T County Connect Issue", entries: [] };
    case "joke": return { id, type, enabled: true, heading: "Daily Dad Joke", intro: "", setup: "", punchline: "" };
    case "poll": return { id, type, enabled: true, heading: "Community Poll", intro: "", poll: null };
  }
}

/**
 * Overview lines built from what's in the issue: the featured article's headline, one line per story title in
 * More stories, the business name in the Business Spotlight, and each other section's own heading.
 */
export function tocDefaults(s: Section): TocItem[] {
  const line = (emoji: string, t: string) => `${emoji} ${t.trim()}`;
  switch (s.type) {
    case "featured": return s.story?.title.trim() ? [{ key: s.id, label: line("📰", s.story.title) }] : [];
    case "articles": return s.items.filter((i) => i.title.trim()).map((i) => ({ key: `${s.id}:${i.id}`, label: line("🗞️", i.title) }));
    case "events": return [{ key: s.id, label: line("📅", s.heading.trim() || "Upcoming Events") }];
    case "weather": return [{ key: s.id, label: line("☀️", s.heading.trim() || "Your 3-Day Forecast") }];
    case "spotlight": {
      const h = s.heading.trim() || "Business Spotlight";
      return s.business?.name.trim() ? [{ key: s.id, label: line("🏪", `${h}: ${s.business.name}`) }] : [];
    }
    case "joke": return [{ key: s.id, label: line("😄", s.heading.trim() || "Daily Dad Joke") }];
    case "poll": return [{ key: s.id, label: line("📊", s.heading.trim() || "Community Poll") }];
    case "custom": {
      const t = s.title.trim() || s.heading.trim();
      return t ? [{ key: s.id, label: line("📌", t) }] : [];
    }
    case "promo": return s.heading.trim() || s.text.trim() ? [{ key: s.id, label: line("🔎", s.heading.trim() || "Explore T County Connect") }] : [];
    default: return []; // the introduction, sponsor ad and the overview itself aren't listed
  }
}

/** What a switched-on section still needs before it shows up in the email (and so in the overview). */
export function tocPendingHint(s: Section): string | null {
  switch (s.type) {
    case "featured": return "📰 Featured article — appears once you choose an article";
    case "articles": return `🗞️ ${s.heading.trim() || "More stories"} — appears once you add a story`;
    case "events": return `📅 ${s.heading.trim() || "Upcoming Events"} — appears once you add an event`;
    case "spotlight": return `🏪 ${s.heading.trim() || "Business Spotlight"} — appears once you choose a business`;
    case "joke": return `😄 ${s.heading.trim() || "Daily Dad Joke"} — appears once the setup and punchline are filled in`;
    case "poll": return `📊 ${s.heading.trim() || "Community Poll"} — appears once you choose a beehiiv poll`;
    case "custom": return "📌 Custom section — appears once it has a headline or text";
    case "promo": return "🔎 Explore T County Connect — appears once it has a heading or message";
    default: return null;
  }
}

/** Generic wording earlier versions saved for every line; treated as "follow the content" now. */
export const LEGACY_TOC_LABELS = new Set(["📰 Local Headlines", "🗞️ More Local Stories", "📅 Upcoming Events Around T County", "☀️ Your Local Weather Forecast", "🏪 Business Spotlight", "😄 Daily Dad Joke", "📊 Community Poll"]);

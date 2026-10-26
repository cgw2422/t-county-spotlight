// Newsletter content model (stored in Newsletter.content). Client-safe: types + pure helpers only.

export type NLItem = {
  id: string;
  refType?: "event" | "article" | "promotion" | "need" | "organization" | "custom";
  refId?: string;
  title: string;
  text?: string;
  url?: string;
  imageUrl?: string;
  imageAlt?: string;
  /** Small line above the title, e.g. "Sat, Nov 1 · Dover". */
  meta?: string;
  /** Paid placement — always labeled in the email. */
  sponsored?: boolean;
};

export const SECTION_KEYS = ["events", "spotlights", "specials", "needs", "nonprofits"] as const;
export type NLSectionKey = (typeof SECTION_KEYS)[number];

export type NLSection = { key: NLSectionKey; title: string; enabled: boolean; items: NLItem[] };

export type NewsletterContent = {
  intro: string; // sanitized HTML
  sections: NLSection[];
  outro: string; // sanitized HTML
};

export const SECTION_DEFAULTS: Record<NLSectionKey, { title: string; help: string; ref: NonNullable<NLItem["refType"]> }> = {
  events: { title: "Upcoming events", help: "Published events in the next 14 days.", ref: "event" },
  spotlights: { title: "Business spotlights", help: "Latest Business Spotlight stories.", ref: "article" },
  specials: { title: "Local specials", help: "Active, approved specials from local businesses.", ref: "promotion" },
  needs: { title: "Community needs", help: "Open needs from approved organizations (most urgent first).", ref: "need" },
  nonprofits: { title: "Featured nonprofits", help: "Approved organizations, featured first.", ref: "organization" },
};

export function emptyContent(): NewsletterContent {
  return {
    intro: "",
    sections: SECTION_KEYS.map((key) => ({ key, title: SECTION_DEFAULTS[key].title, enabled: true, items: [] })),
    outro: "",
  };
}

/** Coerces untrusted JSON into a well-formed content object (all strings, bounded). */
export function normalizeContent(raw: unknown): NewsletterContent {
  const base = emptyContent();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const sections = Array.isArray(o.sections) ? (o.sections as Record<string, unknown>[]) : [];
  return {
    intro: str(o.intro, 50_000),
    outro: str(o.outro, 50_000),
    sections: SECTION_KEYS.map((key) => {
      const s = sections.find((x) => x && x.key === key);
      const items = s && Array.isArray(s.items) ? (s.items as Record<string, unknown>[]) : [];
      return {
        key,
        title: str(s?.title, 120) || SECTION_DEFAULTS[key].title,
        enabled: s ? s.enabled !== false : true,
        items: items.slice(0, 30).filter((i) => i && typeof i === "object").map((i, n) => ({
          id: str(i.id, 60) || `${key}-${n}`,
          refType: (["event", "article", "promotion", "need", "organization", "custom"].includes(String(i.refType)) ? i.refType : "custom") as NLItem["refType"],
          refId: str(i.refId, 60) || undefined,
          title: str(i.title, 200),
          text: str(i.text, 600) || undefined,
          url: str(i.url, 2000) || undefined,
          imageUrl: str(i.imageUrl, 2000) || undefined,
          imageAlt: str(i.imageAlt, 200) || undefined,
          meta: str(i.meta, 160) || undefined,
          sponsored: i.sponsored === true,
        })).filter((i) => i.title.trim()),
      };
    }),
  };
}

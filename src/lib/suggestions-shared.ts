/**
 * Resident suggestions ("Share something"): constants safe for client code.
 * Server helpers live in `src/lib/suggestions.ts`.
 */

export const SUGGESTION_KINDS = ["BUSINESS_OPENING", "COMMUNITY_UPDATE", "ATTRACTION", "VOLUNTEER", "OTHER"] as const;
export type SuggestionKindValue = (typeof SUGGESTION_KINDS)[number];

export const SUGGESTION_KIND_INFO: Record<SuggestionKindValue, {
  label: string; heading: string; intro: string; titleLabel: string; titlePlaceholder: string; detailsPlaceholder: string; dateLabel: string; dateHelp?: string;
}> = {
  BUSINESS_OPENING: {
    label: "New business opening",
    heading: "Tell us about a new business opening",
    intro: "Heard about a business coming soon, just opened, moving or expanding in Tuscarawas County? Let us know and our team will verify it.",
    titleLabel: "Business name",
    titlePlaceholder: "e.g. Main Street Bakery",
    detailsPlaceholder: "What kind of business is it, where is it, and how did you hear about it?",
    dateLabel: "Opening date if announced",
    dateHelp: "Only if the business has announced it. Leave blank if you're not sure.",
  },
  COMMUNITY_UPDATE: {
    label: "Community update",
    heading: "Share a community update",
    intro: "Road work, a new park feature, a milestone, a closure or other news neighbors should know about.",
    titleLabel: "Headline",
    titlePlaceholder: "e.g. Park pavilion reopens after repairs",
    detailsPlaceholder: "What's happening, where, and where did you hear about it?",
    dateLabel: "Date (if there is one)",
  },
  ATTRACTION: {
    label: "Local attraction or thing to do",
    heading: "Suggest a local attraction or thing to do",
    intro: "A trail, park, museum, scenic spot or family activity in Tuscarawas County that more people should know about.",
    titleLabel: "Name of the place or activity",
    titlePlaceholder: "e.g. A riverside walking trail",
    detailsPlaceholder: "What makes it worth a visit? Hours, cost, good for families?",
    dateLabel: "Date (for seasonal activities)",
  },
  VOLUNTEER: {
    label: "Volunteer opportunity",
    heading: "Share a volunteer opportunity",
    intro: "Organizations can post volunteer opportunities themselves by registering for a free T County Gives page. Not registered? You can still suggest one here.",
    titleLabel: "Opportunity",
    titlePlaceholder: "e.g. Food pantry needs Saturday helpers",
    detailsPlaceholder: "Who is organizing it, what help is needed, and how to sign up.",
    dateLabel: "Date (if there is one)",
  },
  OTHER: {
    label: "Other suggestion",
    heading: "Share something with T County",
    intro: "Anything else you think belongs on T County Connect.",
    titleLabel: "Title",
    titlePlaceholder: "",
    detailsPlaceholder: "Tell us more.",
    dateLabel: "Date (if there is one)",
  },
};

export function suggestionKindLabel(kind: string) {
  return SUGGESTION_KIND_INFO[kind as SuggestionKindValue]?.label ?? "Suggestion";
}

export function isSuggestionKind(v: unknown): v is SuggestionKindValue {
  return typeof v === "string" && (SUGGESTION_KINDS as readonly string[]).includes(v);
}

export const SUGGESTION_LIMITS = {
  maxPhotos: 4,
  maxLinksInDetails: 2,
  minSecondsOnForm: 4,
};

export const SUGGESTION_STATUS_COPY: Record<string, { label: string; cls: string; text: string }> = {
  PENDING: { label: "Waiting for review", cls: "badge-amber", text: "Our team will review your suggestion. Nothing is published until we've checked it." },
  APPROVED: { label: "Approved", cls: "badge-green", text: "Thanks! Our team approved your suggestion. If we publish something from it, we'll let you know by email." },
  REJECTED: { label: "Not approved", cls: "badge-red", text: "We couldn't use this suggestion as it is. You can edit it below and resubmit." },
  WITHDRAWN: { label: "Withdrawn", cls: "badge-gray", text: "You withdrew this suggestion." },
};

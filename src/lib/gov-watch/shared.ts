/**
 * Government Watch — labels and value lists shared by the admin UI, the collector, the AI analysis and the
 * (not yet launched) public section. Pure TS: safe in client components.
 */

export const GOV_TYPES = ["county", "city", "village", "township", "school_board", "other_board"] as const;
export type GovType = (typeof GOV_TYPES)[number];
export const GOV_TYPE_LABEL: Record<GovType, string> = {
  county: "County", city: "City", village: "Village", township: "Township", school_board: "School board", other_board: "Other public board",
};

export const COLLECTION_METHODS = ["web_page", "web_platform", "email", "manual", "facebook_only", "unknown"] as const;
export const COLLECTION_METHOD_LABEL: Record<(typeof COLLECTION_METHODS)[number], string> = {
  web_page: "Website page (checked daily)", web_platform: "Meeting platform (checked daily)", email: "Emailed to the records inbox",
  manual: "Manual upload", facebook_only: "Facebook only (manual)", unknown: "Unknown — needs review",
};

export const VERIFICATION = ["verified", "needs_review", "unavailable"] as const;
export const VERIFICATION_LABEL: Record<(typeof VERIFICATION)[number], string> = {
  verified: "Verified", needs_review: "Needs review", unavailable: "Not available online",
};

export const DOC_TYPES = ["minutes", "agenda", "packet", "ordinance", "resolution", "notice", "budget", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_TYPE_LABEL: Record<DocType, string> = {
  minutes: "Minutes", agenda: "Agenda", packet: "Meeting packet", ordinance: "Ordinance", resolution: "Resolution", notice: "Public notice", budget: "Budget / financial", other: "Other document",
};

export const FILE_TYPES = ["pdf", "docx", "doc", "html", "image", "text"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const CATEGORIES = ["decision", "vote", "spending", "roads", "rates", "zoning", "business", "grant", "improvement", "ordinance", "meeting", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  decision: "Important decision", vote: "Vote result", spending: "Government spending", roads: "Roads, construction & closures",
  rates: "Tax & utility rates", zoning: "Zoning & development", business: "New business", grant: "Grants & funding",
  improvement: "Community improvement", ordinance: "New ordinance / resolution", meeting: "Upcoming public meeting", other: "Other",
};

/** Proposed vs discussed vs officially approved — never blurred. */
export const ACTION_STATUSES = ["approved", "rejected", "proposed", "discussed", "tabled", "scheduled", "informational"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  approved: "Officially approved", rejected: "Voted down", proposed: "Proposed (not yet approved)", discussed: "Discussed only",
  tabled: "Tabled / postponed", scheduled: "Scheduled", informational: "Report / information",
};
export const ACTION_STATUS_BADGE: Record<ActionStatus, string> = {
  approved: "badge-green", rejected: "badge-red", proposed: "badge-amber", discussed: "badge-blue", tabled: "badge-gray", scheduled: "badge-blue", informational: "badge-gray",
};

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
export const PRIORITY_BADGE: Record<Priority, string> = { high: "badge-red", medium: "badge-amber", low: "badge-gray" };

export const FINDING_REVIEW = ["new", "reviewed", "ignored", "published"] as const;
export type FindingReview = (typeof FINDING_REVIEW)[number];
export const FINDING_REVIEW_LABEL: Record<FindingReview, string> = { new: "New", reviewed: "Reviewed", ignored: "Ignored", published: "Published" };

export const DOC_REVIEW = ["awaiting_review", "reviewed", "ignored"] as const;
export const DOC_REVIEW_LABEL: Record<(typeof DOC_REVIEW)[number], string> = { awaiting_review: "Awaiting review", reviewed: "Reviewed", ignored: "Ignored" };

export const DOC_STATUS_LABEL: Record<string, string> = {
  new: "Waiting for analysis", analyzing: "Analyzing", analyzed: "Analyzed", failed: "Analysis failed", skipped: "Not analyzed",
};

export const isOneOf = <T extends string>(list: readonly T[], v: string | null | undefined): v is T => !!v && (list as readonly string[]).includes(v);

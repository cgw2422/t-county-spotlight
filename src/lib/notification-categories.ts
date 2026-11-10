/** Notification categories members can opt in to (email preferences + push). */
export const NOTIFICATION_CATEGORIES = [
  { key: "business_announcements", label: "Announcements from businesses I follow", help: "New updates and specials from the businesses you follow." },
  { key: "community_events", label: "Upcoming community events", help: "A heads-up about notable events around the county." },
  { key: "weekend_guides", label: "Weekend guides", help: "Our pick of things to do each weekend." },
  { key: "event_reminders", label: "Reminders for events I saved", help: "A reminder shortly before an event you saved." },
  { key: "community_updates", label: "Important community updates", help: "Rare, important notices for Tuscarawas County." },
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]["key"];

export const NOTIFICATION_KEYS = NOTIFICATION_CATEGORIES.map((c) => c.key) as NotificationCategory[];

/**
 * Planned email updates (Phase 4). Nothing sends these yet: members can opt in
 * ahead of time and they start only once each update is available. Always off
 * by default; never promotional.
 */
export const PLANNED_EMAIL_UPDATES = [
  { key: "weekend_summary", label: "Weekend summary", help: "A short email on Thursday or Friday with what’s happening this weekend in your communities." },
  { key: "saved_event_reminders", label: "Saved event reminders", help: "An email the day before an event you saved." },
  { key: "new_in_my_communities", label: "New in my communities", help: "Newly listed events, food truck stops and garage sales in the communities you picked on My T County." },
] as const;

export type PlannedEmailUpdate = (typeof PLANNED_EMAIL_UPDATES)[number]["key"];

export const PLANNED_EMAIL_KEYS = PLANNED_EMAIL_UPDATES.map((c) => c.key) as PlannedEmailUpdate[];

export type NotificationPrefs = { categories: Record<NotificationCategory, boolean>; planned: Record<PlannedEmailUpdate, boolean> };

/** Defaults: only "important community updates" is on; nothing promotional without opt-in. */
export function readNotificationPrefs(raw: unknown): NotificationPrefs {
  const src = (raw && typeof raw === "object" && "categories" in raw ? (raw as { categories: Record<string, unknown> }).categories : {}) ?? {};
  const categories = {} as Record<NotificationCategory, boolean>;
  for (const k of NOTIFICATION_KEYS) categories[k] = typeof src[k] === "boolean" ? (src[k] as boolean) : k === "community_updates";
  const plannedSrc = (raw && typeof raw === "object" && "planned" in raw ? (raw as { planned: Record<string, unknown> }).planned : {}) ?? {};
  const planned = {} as Record<PlannedEmailUpdate, boolean>;
  for (const k of PLANNED_EMAIL_KEYS) planned[k] = plannedSrc[k] === true; // opt-in only
  return { categories, planned };
}

export function enabledCategories(prefs: NotificationPrefs): NotificationCategory[] {
  return NOTIFICATION_KEYS.filter((k) => prefs.categories[k]);
}

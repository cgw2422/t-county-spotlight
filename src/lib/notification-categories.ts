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

export type NotificationPrefs = { categories: Record<NotificationCategory, boolean> };

/** Defaults: only "important community updates" is on; nothing promotional without opt-in. */
export function readNotificationPrefs(raw: unknown): NotificationPrefs {
  const src = (raw && typeof raw === "object" && "categories" in raw ? (raw as { categories: Record<string, unknown> }).categories : {}) ?? {};
  const categories = {} as Record<NotificationCategory, boolean>;
  for (const k of NOTIFICATION_KEYS) categories[k] = typeof src[k] === "boolean" ? (src[k] as boolean) : k === "community_updates";
  return { categories };
}

export function enabledCategories(prefs: NotificationPrefs): NotificationCategory[] {
  return NOTIFICATION_KEYS.filter((k) => prefs.categories[k]);
}

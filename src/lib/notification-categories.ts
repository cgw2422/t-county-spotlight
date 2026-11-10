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
 * Email updates for members (sent by /api/cron/, see src/lib/notifications/).
 * Opt-in only and always off by default; never promotional. Stored under
 * `notificationPrefs.planned` (the key predates these emails going live).
 */
export const EMAIL_UPDATES = [
  {
    key: "weekend_summary",
    label: "Weekend summary",
    help: "Arrives Thursday afternoon (or by Friday morning): this weekend’s events, food trucks, garage sales and local specials — your communities first, then highlights around the county. Skipped when there’s nothing to share.",
  },
  {
    key: "saved_event_reminders",
    label: "Saved event reminders",
    help: "The day before an event you saved (sent between 8 am and 8 pm). Several events on the same day come in one email. Skipped if the event is no longer listed.",
  },
  {
    key: "new_in_my_communities",
    label: "New in my communities",
    help: "Monday morning: events, food truck stops, garage sales, openings and ways to help newly listed in the last week in the communities you picked on My T County. Skipped when nothing is new.",
  },
] as const;

export type EmailUpdateKey = (typeof EMAIL_UPDATES)[number]["key"];
export const EMAIL_UPDATE_KEYS = EMAIL_UPDATES.map((c) => c.key) as EmailUpdateKey[];

export function isEmailUpdateKey(v: unknown): v is EmailUpdateKey {
  return typeof v === "string" && (EMAIL_UPDATE_KEYS as string[]).includes(v);
}

export function emailUpdateLabel(key: EmailUpdateKey) {
  return EMAIL_UPDATES.find((u) => u.key === key)!.label;
}

/** @deprecated Former names from before these emails were sent; kept for existing imports. */
export const PLANNED_EMAIL_UPDATES = EMAIL_UPDATES;
export type PlannedEmailUpdate = EmailUpdateKey;
export const PLANNED_EMAIL_KEYS = EMAIL_UPDATE_KEYS;

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

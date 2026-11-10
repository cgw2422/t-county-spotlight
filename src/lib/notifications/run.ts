import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { sendMessage } from "@/lib/email";
import { broadcastProvider } from "@/lib/newsletter/provider";
import { expandOccurrences, weekendWindow } from "@/lib/events";
import { eventCardSelect } from "@/lib/queries";
import { eventHref } from "@/lib/links";
import { formatDate, formatTime, toDateInput } from "@/lib/utils";
import { addDaysKey, endOfNyDay, nyDateKey, startOfNyDay } from "@/components/public/dates";
import { cleanCommunities, communityName } from "@/lib/my-t-county-shared";
import { EMAIL_UPDATE_KEYS, readNotificationPrefs, type EmailUpdateKey } from "@/lib/notification-categories";
import { fetchLocalItems, inCommunities, mixItems, type LocalItem, type LocalItemType } from "./items";
import { buildUpdateEmail, type EmailGroup } from "./emails";

/**
 * Opt-in member email updates, driven by /api/cron/ (hourly):
 *   weekend_summary        Thu 3 pm – Fri 11 am (New York), once per weekend   refKey = Saturday "YYYY-MM-DD"
 *   saved_event_reminders  8 am – 8 pm the day before an occurrence            refKey = "EVENT:<id>:<date>" (+ "DAY:<date>" = one email per day)
 *   new_in_my_communities  Monday 7 am – noon, items listed in the last 7 days  refKey = Monday "YYYY-MM-DD"
 *
 * Idempotency: a NotificationDelivery row is created BEFORE sending; its unique
 * (recipient, kind, refKey) key is the lock, so cron re-runs and concurrent
 * runs can never send the same update twice. Provider errors mark the row
 * "failed" (not retried). Each run is capped; the rest continue next run.
 * Every function takes an optional `now` so windows can be tested.
 */

export const DEFAULT_MAX_PER_RUN = 200;
const LAST_RUN_KEY = "notifications.lastRun";

// ───────────── New York clock + send windows ─────────────

export function nyClock(now = new Date()) {
  const s = toDateInput(now); // "YYYY-MM-DDTHH:MM" in New York
  const key = s.slice(0, 10);
  return { key, hour: Number(s.slice(11, 13)), weekday: new Date(`${key}T00:00:00Z`).getUTCDay() };
}

/** Saturday's date key when the weekend summary may go out (Thu 15:00 – Fri 10:59), else null. */
export function weekendSummaryDue(now = new Date()): string | null {
  const c = nyClock(now);
  if (c.weekday === 4 && c.hour >= 15) return addDaysKey(c.key, 2);
  if (c.weekday === 5 && c.hour < 11) return addDaysKey(c.key, 1);
  return null;
}

/** Tomorrow's date key while reminders may go out (8:00 – 19:59), else null. */
export function reminderDue(now = new Date()): string | null {
  const c = nyClock(now);
  return c.hour >= 8 && c.hour < 20 ? addDaysKey(c.key, 1) : null;
}

/** Monday's date key during the Monday-morning window (7:00 – 11:59), else null. */
export function newInCommunitiesDue(now = new Date()): string | null {
  const c = nyClock(now);
  return c.weekday === 1 && c.hour >= 7 && c.hour < 12 ? c.key : null;
}

// ───────────── Members ─────────────

const memberSelect = { id: true, email: true, name: true, firstName: true, homeCommunity: true, extraCommunities: true, notificationPrefs: true } satisfies Prisma.UserSelect;
export type Member = Prisma.UserGetPayload<{ select: typeof memberSelect }>;

/** Home community first, then additional communities (validated names). */
export function memberCommunities(u: { homeCommunity: string | null; extraCommunities: string[] }) {
  const home = communityName(u.homeCommunity);
  return [...(home ? [home] : []), ...cleanCommunities(u.extraCommunities, home)];
}

function communityLabel(c: string[]) {
  if (!c.length) return "T County";
  if (c.length === 1) return c[0];
  if (c.length === 2) return `${c[0]} and ${c[1]}`;
  return "your communities";
}

/** Active, verified members who opted in to `kind`, minus suppressed addresses. */
async function optedInMembers(kind: EmailUpdateKey, onlyIds?: string[]): Promise<Member[]> {
  const rows = await db.user.findMany({
    where: {
      status: "ACTIVE", emailVerifiedAt: { not: null },
      notificationPrefs: { path: ["planned", kind], equals: true },
      ...(onlyIds ? { id: { in: onlyIds } } : {}),
    },
    select: memberSelect, orderBy: { id: "asc" },
  });
  const opted = rows.filter((r) => readNotificationPrefs(r.notificationPrefs).planned[kind]);
  const suppressed = await suppressedEmails(opted.map((r) => r.email));
  return opted.filter((r) => !suppressed.has(r.email.toLowerCase()));
}

async function suppressedEmails(emails: string[]) {
  const out = new Set<string>();
  const lower = [...new Set(emails.map((e) => e.toLowerCase()))];
  for (let i = 0; i < lower.length; i += 1000) {
    const rows = await db.emailSuppression.findMany({ where: { email: { in: lower.slice(i, i + 1000) } }, select: { email: true } });
    rows.forEach((r) => out.add(r.email.toLowerCase()));
  }
  return out;
}

// ───────────── Delivery rows (the lock) ─────────────

/** Creates the delivery row; null when it already exists (sent earlier or by a concurrent run). */
async function claim(recipient: string, kind: EmailUpdateKey, refKey: string): Promise<string | null> {
  try {
    const row = await db.notificationDelivery.create({ data: { recipient, kind, refKey, status: "sent" }, select: { id: true } });
    return row.id;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}

type Outcome = "sent" | "failed" | "logged";

async function deliver(to: string, rowIds: string[], build: () => ReturnType<typeof buildUpdateEmail>): Promise<Outcome> {
  try {
    const m = await build();
    const r = await sendMessage({ to, subject: m.subject, html: m.html, text: m.text, headers: m.headers, tags: m.tags });
    if (r.delivered) return "sent";
    const logged = r.provider === "log";
    await db.notificationDelivery.updateMany({
      where: { id: { in: rowIds } },
      data: logged ? { status: "skipped", error: "No email provider configured — written to the server log only" } : { status: "failed", error: (r.error ?? "Send failed").slice(0, 500) },
    });
    return logged ? "logged" : "failed";
  } catch (e) {
    await db.notificationDelivery.updateMany({ where: { id: { in: rowIds } }, data: { status: "failed", error: String((e as Error).message ?? e).slice(0, 500) } });
    return "failed";
  }
}

// ───────────── Content ─────────────

const WEEKEND_TYPES: LocalItemType[] = ["event", "food_truck", "garage_sale", "special"];
const NEW_TYPES: LocalItemType[] = ["event", "food_truck", "garage_sale", "opening", "need", "volunteer"];

export type UpdateContent = { groups: EmailGroup[]; total: number };

function weekendRange(now: Date) {
  const c = nyClock(now);
  // Thursday: look ahead to Friday–Sunday. weekendWindow() handles Fri–Sun itself.
  return weekendWindow(c.weekday === 4 ? startOfNyDay(addDaysKey(c.key, 1)) : now);
}

/** This weekend: the member's communities first, then countywide highlights. */
export async function weekendContent(communities: string[], now = new Date()): Promise<UpdateContent> {
  const w = weekendRange(now);
  const start = w.start < now ? now : w.start;
  const [local, county] = await Promise.all([
    communities.length ? fetchLocalItems({ communities, start, end: w.end, now, types: WEEKEND_TYPES, take: 6 }) : null,
    fetchLocalItems({ communities: null, start, end: w.end, now, types: WEEKEND_TYPES, take: 8 }),
  ]);
  const groups: EmailGroup[] = [];
  const localItems = local ? mixItems(local, WEEKEND_TYPES, 8) : [];
  if (localItems.length) groups.push({ heading: `This weekend in ${communityLabel(communities)}`, items: localItems, showType: true });
  const taken = new Set(localItems.map((i) => i.key));
  const rest = Object.fromEntries(WEEKEND_TYPES.map((t) => [t, county[t].filter((i) => !taken.has(i.key) && !inCommunities([i], communities).length)]));
  const countyItems = mixItems(rest, WEEKEND_TYPES, communities.length ? 5 : 10);
  if (countyItems.length) groups.push({ heading: communities.length ? "Around T County" : "This weekend around T County", items: countyItems, showType: true });
  return { groups, total: localItems.length + countyItems.length };
}

const NEW_HEADINGS: [string, LocalItemType[]][] = [
  ["New events", ["event"]],
  ["New food truck stops", ["food_truck"]],
  ["New garage sales", ["garage_sale"]],
  ["New & coming soon", ["opening"]],
  ["New ways to help", ["need", "volunteer"]],
];

/** Items newly listed in the last 7 days in the member's communities. */
export async function newInCommunitiesContent(communities: string[], now = new Date()): Promise<UpdateContent> {
  if (!communities.length) return { groups: [], total: 0 };
  const since = new Date(now.getTime() - 7 * 86400_000);
  const items = await fetchLocalItems({ communities, start: now, end: new Date(now.getTime() + 180 * 86400_000), createdSince: since, now, types: NEW_TYPES, take: 5 });
  const groups = NEW_HEADINGS.map(([heading, types]) => ({ heading, items: inCommunities(types.flatMap((t) => items[t]), communities).slice(0, 5) })).filter((g) => g.items.length);
  return { groups, total: groups.reduce((n, g) => n + g.items.length, 0) };
}

type DueReminder = { eventId: string; start: number; item: LocalItem };

async function savedEventOccurrences(userIds: string[], from: Date, to: Date, onlyStartDay?: string) {
  const saved = userIds.length ? await db.savedItem.findMany({ where: { userId: { in: userIds }, type: "EVENT" }, select: { userId: true, targetId: true } }) : [];
  const ids = [...new Set(saved.map((s) => s.targetId))];
  const events = ids.length ? await db.event.findMany({ where: { id: { in: ids }, status: "PUBLISHED", deletedAt: null }, select: eventCardSelect }) : [];
  const first = new Map<string, DueReminder>();
  for (const o of expandOccurrences(events, from, to)) {
    if (first.has(o.id) || o.occurrenceStart < from) continue;
    if (onlyStartDay && nyDateKey(o.occurrenceStart) !== onlyStartDay) continue;
    first.set(o.id, {
      eventId: o.id,
      start: o.occurrenceStart.getTime(),
      item: {
        key: `event:${o.id}`, type: "event", title: o.title, url: eventHref(o), city: o.city,
        meta: [formatDate(o.occurrenceStart, { weekday: "short", month: "short", day: "numeric" }), o.allDay ? "All day" : formatTime(o.occurrenceStart), o.locationName, o.city].filter(Boolean).join(" · "),
      },
    });
  }
  const byUser = new Map<string, DueReminder[]>();
  for (const s of saved) {
    const d = first.get(s.targetId);
    if (!d) continue;
    const list = byUser.get(s.userId) ?? [];
    list.push(d);
    byUser.set(s.userId, list);
  }
  for (const list of byUser.values()) list.sort((a, b) => a.start - b.start);
  return byUser;
}

// ───────────── Email builders ─────────────

function weekendEmail(m: Member, communities: string[], c: UpdateContent, now: Date, note?: string) {
  const w = weekendRange(now);
  const range = `${formatDate(w.start < now ? now : w.start, { weekday: "short", month: "short", day: "numeric" })} – ${formatDate(w.end, { weekday: "short", month: "short", day: "numeric" })}`;
  return buildUpdateEmail({
    kind: "weekend_summary", userId: m.id, name: m.firstName || m.name,
    subject: `This weekend in ${communityLabel(communities)}`,
    title: "Your T County weekend",
    intro: `Here’s what’s on for ${range}${communities.length ? `, starting with ${communityLabel(communities)}` : ""}. Times and details can change — check each listing before you go.`,
    groups: c.groups, button: { label: "See everything this weekend", path: "/things-to-do/" }, note,
  });
}

function remindersEmail(m: Member, items: LocalItem[], note?: string) {
  return buildUpdateEmail({
    kind: "saved_event_reminders", userId: m.id, name: m.firstName || m.name,
    subject: items.length === 1 ? `Tomorrow: ${items[0].title}` : `Tomorrow: ${items.length} events you saved`,
    title: items.length === 1 ? "Your saved event is tomorrow" : "Your saved events are tomorrow",
    intro: "A quick reminder about what you saved on T County Connect. Please check the listing for any last-minute changes.",
    groups: [{ heading: items.length === 1 ? "Saved event" : "Saved events", items }],
    button: { label: "Open my saved items", path: "/saved/" }, note,
  });
}

function newInEmail(m: Member, communities: string[], c: UpdateContent, note?: string) {
  return buildUpdateEmail({
    kind: "new_in_my_communities", userId: m.id, name: m.firstName || m.name,
    subject: `New in ${communityLabel(communities)} this week`,
    title: `New in ${communityLabel(communities)}`,
    intro: `Newly listed on T County Connect in the last 7 days in ${communities.join(", ")}.`,
    groups: c.groups, button: { label: "Open My T County", path: "/my-t-county/" }, note,
  });
}

// ───────────── Runner ─────────────

export type KindResult = { due: boolean; refKey?: string; candidates: number; sent: number; failed: number; logged: number; empty: number; alreadyDone: number; deferred: number; noCommunities?: number };

const blank = (due: boolean, refKey?: string): KindResult => ({ due, refKey, candidates: 0, sent: 0, failed: 0, logged: 0, empty: 0, alreadyDone: 0, deferred: 0 });

function tally(r: KindResult, o: Outcome) {
  if (o === "sent") r.sent++;
  else if (o === "failed") r.failed++;
  else r.logged++;
}

async function runWeekly(kind: "weekend_summary" | "new_in_my_communities", refKey: string | null, now: Date, budget: { left: number }) {
  if (!refKey) return blank(false);
  const r = blank(true, refKey);
  const members = await optedInMembers(kind);
  r.candidates = members.length;
  const done = new Set((await db.notificationDelivery.findMany({ where: { kind, refKey, recipient: { in: members.map((m) => m.id) } }, select: { recipient: true } })).map((d) => d.recipient));
  const cache = new Map<string, Promise<UpdateContent>>();
  for (const m of members) {
    if (done.has(m.id)) { r.alreadyDone++; continue; }
    const comms = memberCommunities(m);
    if (kind === "new_in_my_communities" && !comms.length) { r.noCommunities = (r.noCommunities ?? 0) + 1; continue; }
    if (budget.left <= 0) { r.deferred++; continue; }
    const key = comms.join("|");
    if (!cache.has(key)) cache.set(key, kind === "weekend_summary" ? weekendContent(comms, now) : newInCommunitiesContent(comms, now));
    const content = await cache.get(key)!;
    if (!content.total) { r.empty++; continue; }
    const id = await claim(m.id, kind, refKey);
    if (!id) { r.alreadyDone++; continue; }
    budget.left--;
    tally(r, await deliver(m.email, [id], () => (kind === "weekend_summary" ? weekendEmail(m, comms, content, now) : newInEmail(m, comms, content))));
  }
  return r;
}

async function runReminders(now: Date, budget: { left: number }) {
  const tomorrow = reminderDue(now);
  if (!tomorrow) return blank(false);
  const kind = "saved_event_reminders" as const;
  const r = blank(true, `DAY:${tomorrow}`);
  const members = await optedInMembers(kind);
  const due = await savedEventOccurrences(members.map((m) => m.id), startOfNyDay(tomorrow), endOfNyDay(tomorrow), tomorrow);
  const withDue = members.filter((m) => due.get(m.id)?.length);
  r.candidates = withDue.length;
  const dayKey = `DAY:${tomorrow}`;
  const done = new Set((await db.notificationDelivery.findMany({ where: { kind, refKey: dayKey, recipient: { in: withDue.map((m) => m.id) } }, select: { recipient: true } })).map((d) => d.recipient));
  for (const m of withDue) {
    if (done.has(m.id)) { r.alreadyDone++; continue; }
    if (budget.left <= 0) { r.deferred++; continue; }
    // One email per member per day: the DAY row is the lock; EVENT rows record each reminder.
    const dayId = await claim(m.id, kind, dayKey);
    if (!dayId) { r.alreadyDone++; continue; }
    const rowIds = [dayId];
    const items: LocalItem[] = [];
    for (const d of due.get(m.id)!) {
      const id = await claim(m.id, kind, `EVENT:${d.eventId}:${tomorrow}`);
      if (id) { rowIds.push(id); items.push(d.item); }
    }
    if (!items.length) {
      await db.notificationDelivery.update({ where: { id: dayId }, data: { status: "skipped", error: "Already reminded" } });
      r.alreadyDone++;
      continue;
    }
    budget.left--;
    tally(r, await deliver(m.email, rowIds, () => remindersEmail(m, items)));
  }
  return r;
}

export type RunResult = { ok: boolean; time: string; stoppedReason?: string; maxPerRun: number } & Partial<Record<EmailUpdateKey, KindResult>>;

/** Called by /api/cron/. Safe to call as often as you like. */
export async function processEmailUpdates(opts: { now?: Date; maxPerRun?: number; kinds?: EmailUpdateKey[] } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const maxPerRun = opts.maxPerRun ?? DEFAULT_MAX_PER_RUN;
  const out: RunResult = { ok: true, time: now.toISOString(), maxPerRun };
  if (!broadcastProvider() && process.env.NODE_ENV === "production") {
    out.ok = false;
    out.stoppedReason = "No email provider is configured (set RESEND_API_KEY or SMTP_HOST).";
  } else {
    const kinds = opts.kinds ?? EMAIL_UPDATE_KEYS;
    const budget = { left: maxPerRun };
    // Time-sensitive reminders first.
    if (kinds.includes("saved_event_reminders")) out.saved_event_reminders = await runReminders(now, budget);
    if (kinds.includes("weekend_summary")) out.weekend_summary = await runWeekly("weekend_summary", weekendSummaryDue(now), now, budget);
    if (kinds.includes("new_in_my_communities")) out.new_in_my_communities = await runWeekly("new_in_my_communities", newInCommunitiesDue(now), now, budget);
  }
  const value = JSON.parse(JSON.stringify({ ...out, ranAt: new Date().toISOString() })) as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { key: LAST_RUN_KEY }, create: { key: LAST_RUN_KEY, value }, update: { value } });
  return out;
}

// ───────────── Admin: test send + status ─────────────

/** Sends one update to a staff member's own address, ignoring windows and opt-in. Recorded as refKey "test:<timestamp>". */
export async function sendTestUpdate(kind: EmailUpdateKey, user: { id: string; email: string; name: string | null; firstName: string | null; homeCommunity: string | null; extraCommunities: string[] }, now = new Date()) {
  const m: Member = { ...user, notificationPrefs: null };
  const comms = memberCommunities(m);
  const emptyNote = "Test send: there’s nothing to show for this right now, so a real email would be skipped.";
  let build: () => ReturnType<typeof buildUpdateEmail>;
  if (kind === "saved_event_reminders") {
    const due = await savedEventOccurrences([m.id], now, new Date(now.getTime() + 7 * 86400_000));
    const items = (due.get(m.id) ?? []).map((d) => d.item);
    build = () => remindersEmail(m, items, items.length ? "Test send: real reminders only include events happening tomorrow (these are your saved events in the next 7 days)." : emptyNote);
  } else if (kind === "weekend_summary") {
    const c = await weekendContent(comms, now);
    build = () => weekendEmail(m, comms, c, now, c.total ? "Test send." : emptyNote);
  } else {
    const c = await newInCommunitiesContent(comms, now);
    build = () => newInEmail(m, comms, c, !comms.length ? "Test send: you haven’t picked a community on My T County, so a real email would be skipped." : c.total ? "Test send." : emptyNote);
  }
  const refKey = `test:${now.getTime()}`;
  const id = await claim(m.id, kind, refKey);
  if (!id) return { ok: false as const, outcome: "duplicate" as const };
  const original = build;
  const outcome = await deliver(m.email, [id], async () => {
    const e = await original();
    return { ...e, subject: `[TEST] ${e.subject}` };
  });
  return { ok: outcome !== "failed", outcome };
}

export async function emailUpdateStatus(days = 7) {
  const since = new Date(Date.now() - days * 86400_000);
  const [groups, lastRun, optedIn] = await Promise.all([
    db.notificationDelivery.groupBy({
      by: ["kind", "status"], _count: { _all: true },
      // One row per email: skip per-event reminder rows and staff test sends.
      where: { createdAt: { gte: since }, NOT: [{ refKey: { startsWith: "test:" } }, { refKey: { startsWith: "EVENT:" } }] },
    }),
    db.setting.findUnique({ where: { key: LAST_RUN_KEY } }),
    Promise.all(EMAIL_UPDATE_KEYS.map((k) => db.user.count({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, notificationPrefs: { path: ["planned", k], equals: true } } }))),
  ]);
  const count = (kind: string, status: string) => groups.find((g) => g.kind === kind && g.status === status)?._count._all ?? 0;
  const last = (lastRun?.value ?? null) as (RunResult & { ranAt?: string }) | null;
  return {
    kinds: EMAIL_UPDATE_KEYS.map((k, i) => ({ kind: k, optedIn: optedIn[i], sent: count(k, "sent"), failed: count(k, "failed"), skipped: count(k, "skipped") })),
    lastRunAt: last?.ranAt ?? null,
    lastRunError: last && !last.ok ? last.stoppedReason ?? null : null,
  };
}

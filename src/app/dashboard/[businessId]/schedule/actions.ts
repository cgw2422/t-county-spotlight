"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { isStaff, requireBusinessAccess } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizePlain } from "@/lib/sanitize";
import { fromDateInput } from "@/lib/utils";
import { FOOD_TRUCK_LIMITS as L, addDaysKey, canConfirm, nyDateKey, weekdayOfKey } from "@/lib/food-trucks";
import { echoValues, type FormState } from "@/components/dashboard/fields";

/**
 * Food truck schedule actions. Shared by the owner dashboard and the admin
 * Food trucks page: requireBusinessAccess lets owners/managers of THIS listing
 * (and staff, as an override) in. Not Premium-gated.
 */

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function truckAccess(fd: FormData) {
  const { user, business } = await requireBusinessAccess(str(fd, "businessId"));
  return { user, business, ok: business.isFoodTruck };
}
const NOT_TRUCK = "Scheduling is only available for listings marked as food trucks.";

function refresh(business: { id: string; slug: string }) {
  revalidatePath(`/dashboard/${business.id}/schedule/`);
  revalidatePath(`/admin/food-trucks/${business.id}/`);
  revalidatePath("/admin/food-trucks/");
  revalidatePath("/food-trucks/");
  revalidatePath(`/business/${business.slug}/`);
  revalidatePath("/");
}

const placeSchema = z.object({
  locationName: z.string().min(1, "Please enter where you'll be (for example “Tuscora Park”).").max(L.locationName),
  address: z.string().max(L.address),
  city: z.string().max(L.city),
  notes: z.string().max(L.notes),
});

function readPlace(fd: FormData) {
  const cityRaw = str(fd, "city");
  return placeSchema.safeParse({
    locationName: sanitizePlain(str(fd, "locationName"), L.locationName),
    address: sanitizePlain(str(fd, "address"), L.address),
    city: sanitizePlain(cityRaw === "__other" ? str(fd, "cityOther") : cityRaw, L.city),
    notes: sanitizePlain(str(fd, "notes"), L.notes),
  });
}

/** New York date + times → instants. An end time at/before the start means it runs past midnight. */
function buildTimes(date: string, startTime: string, endTime: string): { startAt: Date; endAt: Date } | { error: string; field: string } {
  if (!DATE_RE.test(date)) return { error: "Please pick a date.", field: "date" };
  if (!TIME_RE.test(startTime)) return { error: "Please enter a start time.", field: "startTime" };
  if (!TIME_RE.test(endTime)) return { error: "Please enter an end time.", field: "endTime" };
  const startAt = fromDateInput(`${date}T${startTime}`);
  if (!startAt || nyDateKey(startAt) !== date) return { error: "Please pick a valid date.", field: "date" };
  let endAt = fromDateInput(`${date}T${endTime}`)!;
  if (endAt <= startAt) endAt = fromDateInput(`${addDaysKey(date, 1)}T${endTime}`)!;
  if (!(endAt > startAt)) return { error: "The end time must be after the start time.", field: "endTime" };
  if (endAt.getTime() - startAt.getTime() > L.maxDurationHours * 3600_000) return { error: `A stop can be at most ${L.maxDurationHours} hours long.`, field: "endTime" };
  return { startAt, endAt };
}

function checkWhen(startAt: Date, endAt: Date, now: Date): { error: string; field: string } | null {
  if (endAt <= now) return { error: "That stop has already ended. Please pick a future date or time.", field: "date" };
  if (startAt.getTime() > now.getTime() + L.maxDaysAhead * 86400_000) return { error: "Stops can be scheduled up to one year ahead.", field: "date" };
  return null;
}

async function underCap(businessId: string, adding: number) {
  const n = await db.foodTruckStop.count({ where: { businessId, status: "SCHEDULED", endAt: { gt: new Date() } } });
  return n + adding <= L.maxUpcomingPerTruck;
}

// ───────────── Single stop: add / edit ─────────────

export async function saveStopAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business, ok } = await truckAccess(fd);
  if (!ok) return { error: NOT_TRUCK };
  const values = echoValues(fd);
  const stopId = str(fd, "stopId");
  const existing = stopId ? await db.foodTruckStop.findFirst({ where: { id: stopId, businessId: business.id } }) : null;
  if (stopId && !existing) return { error: "That stop wasn't found." };

  const times = buildTimes(str(fd, "date"), str(fd, "startTime"), str(fd, "endTime"));
  if ("error" in times) return { values, error: times.error, fieldErrors: { [times.field]: times.error } };
  const now = new Date();
  const when = checkWhen(times.startAt, times.endAt, now);
  if (when) return { values, error: when.error, fieldErrors: { [when.field]: when.error } };
  const place = readPlace(fd);
  if (!place.success) {
    const i = place.error.issues[0];
    return { values, error: i?.message ?? "Please check the form.", fieldErrors: { [String(i?.path[0] ?? "locationName")]: i?.message ?? "Required" } };
  }
  const p = place.data;
  const data = { startAt: times.startAt, endAt: times.endAt, locationName: p.locationName, address: p.address || null, city: p.city || null, notes: p.notes || null };

  if (existing) {
    const moved = existing.startAt.getTime() !== data.startAt.getTime() || existing.endAt.getTime() !== data.endAt.getTime()
      || existing.locationName !== data.locationName || existing.address !== data.address || existing.city !== data.city;
    // A confirmation was for the old time/place — changing either clears it.
    await db.foodTruckStop.update({ where: { id: existing.id }, data: { ...data, ...(moved ? { confirmedAt: null } : {}) } });
    await audit(user.id, "foodtruck.stop_update", "FoodTruckStop", existing.id, { businessId: business.id, startAt: data.startAt.toISOString(), locationName: data.locationName, clearedConfirmation: moved && !!existing.confirmedAt });
    refresh(business);
    return { ok: true, message: "Stop updated." };
  }

  if (!isStaff(user) && !rateLimit(`foodtruck:create:${user.id}`, 40, 3600_000).ok) return { values, error: "You've added a lot of stops in a short time. Please wait a bit and try again." };
  if (!(await underCap(business.id, 1))) return { values, error: `You can have up to ${L.maxUpcomingPerTruck} upcoming stops.` };
  const stop = await db.foodTruckStop.create({ data: { ...data, businessId: business.id, createdById: user.id } });
  await audit(user.id, "foodtruck.stop_create", "FoodTruckStop", stop.id, { businessId: business.id, startAt: data.startAt.toISOString(), locationName: data.locationName });
  refresh(business);
  return { ok: true, message: `Stop added for ${data.locationName}.` };
}

// ───────────── Weekly schedule → individual stops ─────────────

export async function createSeriesAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business, ok } = await truckAccess(fd);
  if (!ok) return { error: NOT_TRUCK };
  const values = echoValues(fd);
  const days = [...new Set(fd.getAll("weekdays").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
  if (!days.length) return { values, error: "Please pick at least one day of the week.", fieldErrors: { weekdays: "Pick at least one day" } };
  const from = str(fd, "fromDate");
  const weeks = Number(str(fd, "weeks"));
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > L.maxSeriesWeeks) return { values, error: `Please choose between 1 and ${L.maxSeriesWeeks} weeks.`, fieldErrors: { weeks: "1–12" } };
  const startTime = str(fd, "startTime"), endTime = str(fd, "endTime");
  const first = buildTimes(from, startTime, endTime);
  if ("error" in first) return { values, error: first.error, fieldErrors: { [first.field === "date" ? "fromDate" : first.field]: first.error } };
  const place = readPlace(fd);
  if (!place.success) {
    const i = place.error.issues[0];
    return { values, error: i?.message ?? "Please check the form.", fieldErrors: { [String(i?.path[0] ?? "locationName")]: i?.message ?? "Required" } };
  }
  const p = place.data;
  const now = new Date();
  const stops: { startAt: Date; endAt: Date }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = addDaysKey(from, i);
    if (!days.includes(weekdayOfKey(key))) continue;
    const t = buildTimes(key, startTime, endTime);
    if ("error" in t || t.endAt <= now) continue;
    stops.push(t);
  }
  if (!stops.length) return { values, error: "Those days and dates don't produce any upcoming stops." };
  if (stops.length > L.maxSeriesStops) return { values, error: `That would create ${stops.length} stops. Please add at most ${L.maxSeriesStops} at once (fewer weeks or days).` };
  const lastWhen = checkWhen(stops[stops.length - 1].startAt, stops[stops.length - 1].endAt, now);
  if (lastWhen) return { values, error: lastWhen.error, fieldErrors: { fromDate: lastWhen.error } };
  if (!isStaff(user) && !rateLimit(`foodtruck:series:${user.id}`, 10, 3600_000).ok) return { values, error: "You've added several weekly schedules in a short time. Please wait a bit and try again." };
  if (!(await underCap(business.id, stops.length))) return { values, error: `You can have up to ${L.maxUpcomingPerTruck} upcoming stops.` };

  const seriesId = crypto.randomUUID();
  await db.foodTruckStop.createMany({
    data: stops.map((s) => ({
      ...s, businessId: business.id, seriesId, createdById: user.id,
      locationName: p.locationName, address: p.address || null, city: p.city || null, notes: p.notes || null,
    })),
  });
  await audit(user.id, "foodtruck.series_create", "Business", business.id, { seriesId, stops: stops.length, weekdays: days, weeks, locationName: p.locationName });
  refresh(business);
  return { ok: true, message: `Added ${stops.length} weekly stop${stops.length === 1 ? "" : "s"} at ${p.locationName}.` };
}

// ───────────── Cancel / restore / confirm ─────────────

const OPS = ["cancel", "restore", "confirm", "unconfirm", "cancelSeries"] as const;

export async function stopOpAction(_p: FormState, fd: FormData): Promise<FormState> {
  const { user, business, ok } = await truckAccess(fd);
  if (!ok) return { error: NOT_TRUCK };
  const op = z.enum(OPS).safeParse(str(fd, "op"));
  if (!op.success) return { error: "Unknown action." };
  const stop = await db.foodTruckStop.findFirst({ where: { id: str(fd, "stopId"), businessId: business.id } });
  if (!stop) return { error: "That stop wasn't found." };
  const now = new Date();
  let message = "";
  switch (op.data) {
    case "cancel":
      if (stop.status === "CANCELLED") return { message: "That stop is already cancelled." };
      await db.foodTruckStop.update({ where: { id: stop.id }, data: { status: "CANCELLED", cancelledAt: now, confirmedAt: null } });
      message = "Stop cancelled. It's no longer shown publicly.";
      break;
    case "restore":
      if (stop.endAt <= now) return { error: "That stop has already ended." };
      await db.foodTruckStop.update({ where: { id: stop.id }, data: { status: "SCHEDULED", cancelledAt: null } });
      message = "Stop restored.";
      break;
    case "confirm":
      if (!canConfirm(stop, now)) return { error: "You can confirm a stop on the day it happens, before it ends." };
      await db.foodTruckStop.update({ where: { id: stop.id }, data: { confirmedAt: now } });
      message = "Thanks! The stop now shows “Confirmed by the truck”.";
      break;
    case "unconfirm":
      await db.foodTruckStop.update({ where: { id: stop.id }, data: { confirmedAt: null } });
      message = "Confirmation removed.";
      break;
    case "cancelSeries": {
      if (!stop.seriesId) return { error: "That stop isn't part of a weekly schedule." };
      const r = await db.foodTruckStop.updateMany({
        where: { businessId: business.id, seriesId: stop.seriesId, status: "SCHEDULED", startAt: { gte: stop.startAt } },
        data: { status: "CANCELLED", cancelledAt: now, confirmedAt: null },
      });
      message = `Cancelled ${r.count} stop${r.count === 1 ? "" : "s"} in this weekly schedule.`;
      break;
    }
  }
  await audit(user.id, `foodtruck.stop_${op.data === "cancelSeries" ? "series_cancel" : op.data}`, "FoodTruckStop", stop.id, { businessId: business.id, seriesId: stop.seriesId });
  refresh(business);
  return { ok: true, message };
}

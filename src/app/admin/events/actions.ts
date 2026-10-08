"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { absoluteUrl, fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { Prisma } from "@/generated/prisma/client";
import { getAll, isUniqueError, parseForm, uniqueSlug, zBool, zInt, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "REJECTED", "UNPUBLISHED", "ARCHIVED"] as const;

const schema = z.object({
  id: z.string().optional(),
  title: zReq("Title", 200),
  slug: zSlugOpt,
  description: z.string().max(200_000).optional().transform((v) => v || null),
  imageUrl: zUrlOpt,
  startAt: zReq("Start date"),
  endAt: z.string().optional(),
  allDay: zBool,
  freq: z.enum(["", "DAILY", "WEEKLY", "MONTHLY"]).default(""),
  interval: zInt(1, 1, 52),
  until: z.string().optional(),
  locationName: zOpt(200),
  address: zOpt(300),
  city: zOpt(100),
  cityOther: zOpt(100),
  organizer: zOpt(200),
  categoryId: zOpt(50),
  ticketUrl: zUrlOpt,
  isFree: zBool,
  price: zOpt(60),
  status: z.enum(STATUSES).default("PUBLISHED"),
  isFeatured: zBool,
  isSponsored: zBool,
});

export async function saveEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const existing = d.id ? await db.event.findUnique({ where: { id: d.id } }) : null;
  if (d.id && !existing) return { error: "Event not found." };

  const startAt = fromDateInput(d.startAt);
  if (!startAt) return { error: "Enter a valid start date and time." };
  const endAt = fromDateInput(d.endAt);
  if (endAt && endAt < startAt) return { error: "End time must be after the start time." };
  const until = fromDateInput(d.until);
  if (d.freq && until && until < startAt) return { error: "Repeat-until date must be after the start." };
  const recurrence = d.freq ? { freq: d.freq, interval: d.interval, ...(until ? { until: until.toISOString() } : {}) } : null;

  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.title), async (s) => !!(await db.event.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } })));
  else if (await db.event.findFirst({ where: { slug, NOT: { id: d.id ?? "" } }, select: { id: true } })) return { error: `The slug “${slug}” is already used by another event.` };

  const businessId = getAll(fd, "business")[0] ?? null;
  const data = {
    title: d.title, slug, description: d.description, imageUrl: d.imageUrl, startAt, endAt, allDay: d.allDay,
    recurrence: recurrence ?? Prisma.DbNull, locationName: d.locationName, address: d.address,
    city: d.city === "__other" ? d.cityOther : d.city, organizer: d.organizer, ticketUrl: d.ticketUrl,
    isFree: d.isFree, price: d.isFree ? null : d.price, status: d.status, isFeatured: d.isFeatured, isSponsored: d.isSponsored,
    businessId, categoryId: d.categoryId,
  };
  let id = d.id;
  try {
    if (existing) await db.event.update({ where: { id: existing.id }, data });
    else id = (await db.event.create({ data: { ...data, submittedById: user.id } })).id;
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }
  const changed = existing && existing.status !== d.status;
  await audit(user.id, !existing ? "event.create" : changed ? `event.${d.status === "PUBLISHED" ? "publish" : d.status.toLowerCase()}` : "event.update", "Event", id, { title: d.title, status: d.status });
  revalidatePath("/admin/events");
  revalidatePath("/", "layout");
  if (!existing) redirect(`/admin/events/${id}/?created=1`);
  return { ok: true, message: "Event saved." };
}

export async function setEventStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(STATUSES), reason: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const { id, status, reason } = p.data;
  if (status === "REJECTED" && !reason) return { error: "Add a reason so the submitter knows why." };
  const e = await db.event.findUnique({ where: { id }, include: { submittedBy: { select: { email: true } } } });
  if (!e) return { error: "Event not found." };
  await db.event.update({ where: { id }, data: { status, rejectionReason: status === "REJECTED" ? reason : null } });
  const verb = status === "PUBLISHED" ? (e.status === "PENDING" ? "approve" : "publish") : status === "REJECTED" ? "reject" : status.toLowerCase();
  await audit(user.id, `event.${verb}`, "Event", id, { title: e.title, reason });
  const to = e.submitterEmail || (e.submittedById && e.submittedById !== user.id ? e.submittedBy?.email : null);
  if (to && e.status === "PENDING" && (status === "PUBLISHED" || status === "REJECTED")) {
    await sendEmail(
      to,
      status === "PUBLISHED" ? `Your event “${e.title}” is live` : `About your event “${e.title}”`,
      status === "PUBLISHED"
        ? `Thanks for sharing! Your event is now listed on TCountySpotlight: ${absoluteUrl(`/events/${e.slug}/`)}`
        : `Thanks for submitting “${e.title}”. We weren't able to publish it.\n\nReason: ${reason}\n\nYou're welcome to submit again with changes.`,
    );
  }
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${id}`);
  revalidatePath("/", "layout");
  return { ok: true, message: { approve: "Event approved and published.", publish: "Event published.", reject: "Event rejected.", unpublished: "Event unpublished.", archived: "Event archived.", draft: "Moved to draft.", pending: "Marked pending." }[verb] ?? "Status updated." };
}

export async function toggleEventFlag(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), flag: z.enum(["isFeatured", "isSponsored"]), value: zBool }), fd);
  if (p.error) return p.error;
  const e = await db.event.update({ where: { id: p.data.id }, data: { [p.data.flag]: p.data.value } });
  await audit(user.id, p.data.flag === "isFeatured" ? (p.data.value ? "event.feature" : "event.unfeature") : "event.update", "Event", e.id, { title: e.title, [p.data.flag]: p.data.value });
  revalidatePath("/admin/events");
  revalidatePath("/", "layout");
  return { ok: true, message: p.data.flag === "isFeatured" ? (p.data.value ? "Featured." : "No longer featured.") : p.data.value ? "Marked sponsored." : "Sponsored label removed." };
}

export async function trashEvent(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const e = await db.event.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(user.id, "event.trash", "Event", id, { title: e.title });
  revalidatePath("/admin/events");
  revalidatePath("/", "layout");
  redirect("/admin/events/");
}

export async function saveEventCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().optional(), name: zReq("Name", 80), slug: zSlugOpt }), fd);
  if (p.error) return p.error;
  const slug = p.data.slug || slugify(p.data.name);
  try {
    if (p.data.id) await db.eventCategory.update({ where: { id: p.data.id }, data: { name: p.data.name, slug } });
    else {
      const max = await db.eventCategory.aggregate({ _max: { sortOrder: true } });
      await db.eventCategory.create({ data: { name: p.data.name, slug, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: `A category with slug “${slug}” already exists.` };
    throw e;
  }
  await audit(user.id, p.data.id ? "event_category.update" : "event_category.create", "EventCategory", p.data.id, { name: p.data.name });
  revalidatePath("/admin/events/categories");
  revalidatePath("/", "layout");
  return { ok: true, message: "Category saved." };
}

export async function moveEventCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireStaff();
  const id = String(fd.get("id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const all = await db.eventCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true } });
  const i = all.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return null;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((c, k) => db.eventCategory.update({ where: { id: c.id }, data: { sortOrder: k } })));
  revalidatePath("/admin/events/categories");
  return null;
}

export async function deleteEventCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id"));
  const c = await db.eventCategory.delete({ where: { id } });
  await audit(user.id, "event_category.delete", "EventCategory", id, { name: c.name });
  revalidatePath("/admin/events/categories");
  revalidatePath("/", "layout");
  return { ok: true, message: `Deleted “${c.name}”.` };
}

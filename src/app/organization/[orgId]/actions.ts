"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl, fromDateInput, slugify } from "@/lib/utils";
import { requireOrgAccess } from "@/lib/gives/access";
import { parseOrgProfile } from "@/lib/gives/profile";
import { needSlug, opportunitySlug, ownImageUrl, recalcNeed } from "@/lib/gives/queries";
import {
  NEED_CATEGORIES, NEED_STATUSES, NEED_URGENCIES, OPPORTUNITY_STATUSES, ORG_ROLES, ROLE_RANK, SIGNUP_STATUSES, type OrgRoleValue,
} from "@/lib/gives/constants";
import { normalizeUrl, textToHtml } from "@/components/dashboard/text";
import type { ActionState } from "@/components/ui/form-message";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string, max = 300) => sanitizePlain(str(fd, k), max) || null;
const text = (fd: FormData, k: string, max = 8000) => {
  const v = String(fd.get(k) ?? "").replace(/\r\n/g, "\n").slice(0, max);
  return v.trim() ? textToHtml(v) : null;
};
const intOrNull = (fd: FormData, k: string, min = 0, max = 1_000_000) => {
  const raw = str(fd, k);
  if (!raw) return { value: null as number | null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return { value: null, error: `Please enter a whole number${min > 0 ? ` of at least ${min}` : ""}.` };
  return { value: n };
};
const bad = (fieldErrors: Record<string, string>): ActionState => ({ error: Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors });

async function access(fd: FormData, minRole: OrgRoleValue = "EDITOR") {
  return requireOrgAccess(str(fd, "orgId"), minRole);
}

function refresh(orgId: string, slug?: string, kind?: string) {
  revalidatePath(`/organization/${orgId}/`, "layout");
  if (slug) revalidatePath(kind === "CHURCH" ? `/churches/${slug}/` : `/organizations/${slug}/`);
  revalidatePath("/gives/", "layout");
}

// ───────────── Profile ─────────────

export async function saveOrgProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const { data, fieldErrors } = parseOrgProfile(fd, org);
  if (Object.keys(fieldErrors).length) return bad(fieldErrors);
  await db.organization.update({ where: { id: org.id }, data });
  await audit(user.id, "organization.member_update", "Organization", org.id, { fields: Object.keys(data) });
  refresh(org.id, org.slug, org.kind);
  return { ok: true, message: org.status === "APPROVED" ? "Saved! Your changes are live." : "Saved. Your page goes live once our team approves your organization." };
}

// ───────────── Needs ─────────────

export async function saveNeedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const needId = str(fd, "needId");
  const existing = needId ? await db.communityNeed.findFirst({ where: { id: needId, organizationId: org.id, deletedAt: null } }) : null;
  if (needId && !existing) return { error: "That need wasn't found." };

  const fieldErrors: Record<string, string> = {};
  const title = sanitizePlain(str(fd, "title"), 140);
  if (!title) fieldErrors.title = "Please describe what you need.";
  const category = str(fd, "category");
  if (!(NEED_CATEGORIES as readonly string[]).includes(category)) fieldErrors.category = "Choose a category.";
  const urgency = str(fd, "urgency");
  if (!(NEED_URGENCIES as readonly string[]).includes(urgency)) fieldErrors.urgency = "Choose how urgent this is.";
  const status = str(fd, "status") || "OPEN";
  if (!(NEED_STATUSES as readonly string[]).includes(status)) fieldErrors.status = "Choose a status.";
  const qty = intOrNull(fd, "quantityNeeded", 1, 1_000_000);
  if (qty.error) fieldErrors.quantityNeeded = qty.error;
  const deadlineRaw = str(fd, "deadline");
  const deadline = deadlineRaw ? fromDateInput(`${deadlineRaw}T23:59`) : null;
  if (deadlineRaw && !deadline) fieldErrors.deadline = "Please choose a valid date.";
  if (Object.keys(fieldErrors).length) return bad(fieldErrors);

  const data = {
    title,
    description: text(fd, "description"),
    category: category as (typeof NEED_CATEGORIES)[number],
    urgency: urgency as (typeof NEED_URGENCIES)[number],
    status: status as (typeof NEED_STATUSES)[number],
    quantityNeeded: qty.value,
    unit: opt(fd, "unit", 40),
    deadline,
    instructions: opt(fd, "instructions", 2000),
    dropoffLocation: opt(fd, "dropoffLocation", 300),
    isWishList: fd.get("isWishList") === "on",
  };
  let id = existing?.id;
  if (existing) {
    await db.communityNeed.update({ where: { id: existing.id }, data });
  } else {
    const n = await db.communityNeed.create({ data: { ...data, organizationId: org.id, slug: await needSlug(title) } });
    id = n.id;
  }
  await recalcNeed(id!);
  await audit(user.id, existing ? "need.update" : "need.create", "CommunityNeed", id, { organizationId: org.id, title, status });
  refresh(org.id, org.slug, org.kind);
  if (!existing) redirect(`/organization/${org.id}/needs/${id}/?created=1`);
  return { ok: true, message: "Need saved." };
}

export async function deleteNeedAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const need = await db.communityNeed.findFirst({ where: { id: str(fd, "needId"), organizationId: org.id, deletedAt: null } });
  if (!need) return { error: "That need wasn't found." };
  await db.communityNeed.update({ where: { id: need.id }, data: { deletedAt: new Date(), status: "CLOSED" } });
  await audit(user.id, "need.delete", "CommunityNeed", need.id, { organizationId: org.id, title: need.title });
  refresh(org.id, org.slug, org.kind);
  redirect(`/organization/${org.id}/needs/`);
}

export async function updatePledgeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const pledge = await db.needPledge.findFirst({ where: { id: str(fd, "pledgeId"), need: { organizationId: org.id } }, include: { need: { select: { id: true, title: true } } } });
  if (!pledge) return { error: "That pledge wasn't found." };
  const status = str(fd, "status");
  if (!["PLEDGED", "RECEIVED", "PARTIALLY_RECEIVED", "CANCELLED"].includes(status)) return { error: "Choose what happened." };
  let receivedQuantity: number | null = null;
  if (status === "RECEIVED" || status === "PARTIALLY_RECEIVED") {
    const q = intOrNull(fd, "receivedQuantity", 0, 1_000_000);
    if (q.error) return { error: q.error };
    receivedQuantity = q.value ?? (status === "RECEIVED" ? pledge.quantity : null);
    if (receivedQuantity == null) return { error: "How many did you receive?" };
  }
  await db.needPledge.update({
    where: { id: pledge.id },
    data: { status: status as "PLEDGED", receivedQuantity, confirmedAt: status === "PLEDGED" ? null : new Date() },
  });
  const need = await recalcNeed(pledge.need.id);
  await audit(user.id, "pledge.update", "NeedPledge", pledge.id, { organizationId: org.id, needId: pledge.need.id, status, receivedQuantity });
  refresh(org.id, org.slug, org.kind);
  return { ok: true, message: `Pledge updated. ${need?.quantityReceived ?? 0} received in total.` };
}

// ───────────── Volunteer opportunities ─────────────

export async function saveOpportunityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const oppId = str(fd, "oppId");
  const existing = oppId ? await db.volunteerOpportunity.findFirst({ where: { id: oppId, organizationId: org.id, deletedAt: null } }) : null;
  if (oppId && !existing) return { error: "That opportunity wasn't found." };

  const fieldErrors: Record<string, string> = {};
  const title = sanitizePlain(str(fd, "title"), 140);
  if (!title) fieldErrors.title = "Please give the opportunity a name.";
  const isOngoing = fd.get("isOngoing") === "on";
  const startAt = fromDateInput(str(fd, "startAt"));
  const endAt = fromDateInput(str(fd, "endAt"));
  if (!isOngoing && !startAt) fieldErrors.startAt = "Choose when it starts, or mark it as ongoing.";
  if (startAt && endAt && endAt < startAt) fieldErrors.endAt = "The end must be after the start.";
  const spots = intOrNull(fd, "spots", 1, 100_000);
  if (spots.error) fieldErrors.spots = spots.error;
  const minAge = intOrNull(fd, "minAge", 1, 99);
  if (minAge.error) fieldErrors.minAge = "Enter an age between 1 and 99.";
  const extRaw = str(fd, "externalSignupUrl");
  const externalSignupUrl = normalizeUrl(extRaw);
  if (extRaw && !externalSignupUrl) fieldErrors.externalSignupUrl = "Please enter a full web address.";
  const status = str(fd, "status") || "PUBLISHED";
  if (!(OPPORTUNITY_STATUSES as readonly string[]).includes(status)) fieldErrors.status = "Choose a status.";
  if (Object.keys(fieldErrors).length) return bad(fieldErrors);

  const cityRaw = str(fd, "city") === "__other" ? opt(fd, "cityOther", 80) : opt(fd, "city", 80);
  const data = {
    title,
    description: text(fd, "description"),
    startAt: startAt ?? null,
    endAt: endAt ?? null,
    isOngoing,
    locationName: opt(fd, "locationName", 160),
    address: opt(fd, "address", 200),
    city: cityRaw,
    minAge: minAge.value,
    ageNotes: opt(fd, "ageNotes", 300),
    spots: spots.value,
    requirements: opt(fd, "requirements", 2000),
    registrationOpen: fd.get("registrationOpen") === "on",
    externalSignupUrl,
    status: status as (typeof OPPORTUNITY_STATUSES)[number],
  };
  let id = existing?.id;
  if (existing) await db.volunteerOpportunity.update({ where: { id: existing.id }, data });
  else id = (await db.volunteerOpportunity.create({ data: { ...data, organizationId: org.id, slug: await opportunitySlug(title) } })).id;
  await audit(user.id, existing ? "volunteer.update" : "volunteer.create", "VolunteerOpportunity", id, { organizationId: org.id, title, status });
  refresh(org.id, org.slug, org.kind);
  if (!existing) redirect(`/organization/${org.id}/volunteer/${id}/?created=1`);
  return { ok: true, message: "Opportunity saved." };
}

export async function deleteOpportunityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const opp = await db.volunteerOpportunity.findFirst({ where: { id: str(fd, "oppId"), organizationId: org.id, deletedAt: null } });
  if (!opp) return { error: "That opportunity wasn't found." };
  await db.volunteerOpportunity.update({ where: { id: opp.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
  await audit(user.id, "volunteer.delete", "VolunteerOpportunity", opp.id, { organizationId: org.id, title: opp.title });
  refresh(org.id, org.slug, org.kind);
  redirect(`/organization/${org.id}/volunteer/`);
}

export async function setSignupStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const signup = await db.volunteerSignup.findFirst({
    where: { id: str(fd, "signupId"), opportunity: { organizationId: org.id } },
    include: { opportunity: { select: { id: true, title: true, spots: true } } },
  });
  if (!signup) return { error: "That registration wasn't found." };
  const status = str(fd, "status");
  if (!(SIGNUP_STATUSES as readonly string[]).includes(status)) return { error: "Unknown status." };
  if ((status === "REGISTERED" || status === "CONFIRMED") && !["REGISTERED", "CONFIRMED"].includes(signup.status) && signup.opportunity.spots != null) {
    const active = await db.volunteerSignup.count({ where: { opportunityId: signup.opportunity.id, status: { in: ["REGISTERED", "CONFIRMED"] } } });
    if (active >= signup.opportunity.spots && fd.get("force") !== "1") {
      return { error: `All ${signup.opportunity.spots} spots are taken. Raise the number of spots first, or cancel another registration.` };
    }
  }
  await db.volunteerSignup.update({ where: { id: signup.id }, data: { status: status as (typeof SIGNUP_STATUSES)[number] } });
  await audit(user.id, "volunteer.signup_status", "VolunteerSignup", signup.id, { organizationId: org.id, opportunityId: signup.opportunity.id, from: signup.status, to: status });
  if (status === "CONFIRMED" && signup.status === "WAITLISTED" && fd.get("notify") !== "0") {
    await sendEmail(signup.email, `You're in: ${signup.opportunity.title}`, `Good news, ${signup.name}! A spot opened up and ${org.name} has moved you from the waitlist to confirmed for "${signup.opportunity.title}".\n\nQuestions? Contact ${org.name}${org.email ? ` at ${org.email}` : ""}.`);
  }
  revalidatePath(`/organization/${org.id}/volunteer/${signup.opportunity.id}/`);
  return { ok: true, message: "Registration updated." };
}

// ───────────── Events ─────────────

export async function saveOrgEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const fieldErrors: Record<string, string> = {};
  const title = sanitizePlain(str(fd, "title"), 150);
  if (!title) fieldErrors.title = "Please give your event a name.";
  const allDay = fd.get("allDay") === "on";
  const startAt = fromDateInput(str(fd, "startAt"));
  const endAt = fromDateInput(str(fd, "endAt"));
  if (!startAt) fieldErrors.startAt = "Please choose when the event starts.";
  if (startAt && endAt && endAt < startAt) fieldErrors.endAt = "The end must be after the start.";
  if (startAt && startAt < new Date(Date.now() - 86400_000)) fieldErrors.startAt = "This date is in the past.";
  const ticketRaw = str(fd, "ticketUrl");
  const ticketUrl = normalizeUrl(ticketRaw);
  if (ticketRaw && !ticketUrl) fieldErrors.ticketUrl = "Please enter a full web address.";
  if (Object.keys(fieldErrors).length) return bad(fieldErrors);

  const settings = await getSettings();
  const publish = !settings.requireEventApproval && org.status === "APPROVED";
  const categoryId = str(fd, "categoryId").slice(0, 40);
  const validCat = categoryId ? await db.eventCategory.findUnique({ where: { id: categoryId }, select: { id: true } }) : null;
  const city = str(fd, "city") === "__other" ? opt(fd, "cityOther", 80) : opt(fd, "city", 80);
  const dateKey = startAt!.toISOString().slice(0, 10);
  let slug = slugify(`${title} ${dateKey}`);
  if (await db.event.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
  const dedupeKey = crypto.createHash("sha256").update(`${title.toLowerCase()}|${dateKey}|${(city ?? "").toLowerCase()}|org:${org.id}`).digest("hex");
  if (await db.event.findUnique({ where: { dedupeKey }, select: { id: true } })) return { error: "You've already submitted this event." };

  const ev = await db.event.create({
    data: {
      slug, title, dedupeKey, startAt: startAt!, endAt, allDay,
      description: text(fd, "description"),
      imageUrl: ownImageUrl(str(fd, "imageUrl")),
      locationName: opt(fd, "locationName", 160) ?? org.name,
      address: opt(fd, "address", 200) ?? org.address,
      city: city ?? org.city,
      organizer: org.name,
      organizationId: org.id,
      categoryId: validCat?.id ?? null,
      ticketUrl,
      isFree: fd.get("isFree") === "on",
      price: fd.get("isFree") === "on" ? null : opt(fd, "price", 80),
      status: publish ? "PUBLISHED" : "PENDING",
      submittedById: user.id,
      submitterEmail: user.email,
    },
  });
  await audit(user.id, publish ? "event.publish" : "event.submit", "Event", ev.id, { title, source: "organization_dashboard", organizationId: org.id });
  if (!publish && settings.notifyAdminEmail) {
    await sendEmail(settings.notifyAdminEmail, `New event from ${org.name}: ${title}`, `${title}\nSubmitted by ${org.name} (${user.email}).\n\nReview it: ${absoluteUrl("/admin/events/")}`);
  }
  refresh(org.id, org.slug, org.kind);
  redirect(`/organization/${org.id}/events/?${publish ? "published" : "submitted"}=1`);
}

export async function withdrawOrgEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const ev = await db.event.findFirst({ where: { id: str(fd, "eventId"), organizationId: org.id, deletedAt: null } });
  if (!ev) return { error: "Event not found." };
  if (ev.status === "PUBLISHED") return { error: "This event is already live. Contact us if it needs to come down." };
  await db.event.update({ where: { id: ev.id }, data: { deletedAt: new Date() } });
  await audit(user.id, "event.withdraw", "Event", ev.id, { organizationId: org.id });
  revalidatePath(`/organization/${org.id}/events/`);
  return { ok: true, message: "Event withdrawn." };
}

// ───────────── Updates ─────────────

export async function saveOrgUpdateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const updateId = str(fd, "updateId");
  const existing = updateId ? await db.organizationUpdate.findFirst({ where: { id: updateId, organizationId: org.id } }) : null;
  if (updateId && !existing) return { error: "Update not found." };
  const title = sanitizePlain(str(fd, "title"), 140);
  const body = String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 4000);
  const fieldErrors: Record<string, string> = {};
  if (!title) fieldErrors.title = "Add a headline.";
  if (!body) fieldErrors.body = "Write a few words.";
  if (Object.keys(fieldErrors).length) return bad(fieldErrors);
  const status = fd.get("draft") === "on" ? "DRAFT" : "PUBLISHED";
  const data = { title, body: textToHtml(body), imageUrl: ownImageUrl(str(fd, "imageUrl"), existing?.imageUrl), status: status as "PUBLISHED" | "DRAFT" };
  const u = existing
    ? await db.organizationUpdate.update({ where: { id: existing.id }, data })
    : await db.organizationUpdate.create({ data: { ...data, organizationId: org.id } });
  await audit(user.id, existing ? "org_update.update" : "org_update.create", "OrganizationUpdate", u.id, { organizationId: org.id, status });
  refresh(org.id, org.slug, org.kind);
  return {
    ok: true,
    message: status === "DRAFT" ? "Saved as a draft." : org.status === "APPROVED" ? "Posted! It's on your public page now." : "Posted. It will appear once your organization is approved.",
  };
}

export async function deleteOrgUpdateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org } = await access(fd);
  const u = await db.organizationUpdate.findFirst({ where: { id: str(fd, "updateId"), organizationId: org.id } });
  if (!u) return { error: "Update not found." };
  await db.organizationUpdate.delete({ where: { id: u.id } });
  await audit(user.id, "org_update.delete", "OrganizationUpdate", u.id, { organizationId: org.id, title: u.title });
  refresh(org.id, org.slug, org.kind);
  return { ok: true, message: "Update deleted." };
}

// ───────────── Team ─────────────

export async function addMemberAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org, role: myRole, staff } = await access(fd, "ADMIN");
  const email = z.email().safeParse(str(fd, "email").toLowerCase());
  if (!email.success) return { error: "Please enter a valid email address.", fieldErrors: { email: "Enter a valid email" } };
  const role = str(fd, "role") as OrgRoleValue;
  if (!(ORG_ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  if (role === "OWNER" && myRole !== "OWNER" && !staff) return { error: "Only an owner can add another owner." };

  let target = await db.user.findUnique({ where: { email: email.data } });
  let created = false;
  if (!target) {
    target = await db.user.create({ data: { email: email.data, role: "MEMBER" } });
    created = true;
  }
  const existing = await db.organizationMember.findUnique({ where: { userId_organizationId: { userId: target.id, organizationId: org.id } } });
  if (existing) return { error: `${email.data} is already on your team.` };
  await db.organizationMember.create({ data: { userId: target.id, organizationId: org.id, role } });
  await audit(user.id, "organization.member_add", "Organization", org.id, { email: email.data, role, createdUser: created });
  await sendEmail(
    email.data,
    `You've been added to ${org.name} on T-County Gives`,
    `${user.name || user.email} added you to ${org.name} on T-County Gives as ${role.toLowerCase()}.\n\n` +
      (created ? `An account was created for ${email.data}. Choose your password here: ${absoluteUrl("/forgot-password/")}\n\n` : "") +
      `Sign in to help manage your organization's page: ${absoluteUrl(`/organization/${org.id}/`)}`,
  );
  revalidatePath(`/organization/${org.id}/team/`);
  return {
    ok: true,
    message: created
      ? `Added ${email.data}. They don't have a password yet — ask them to use “Forgot password” on the sign-in page.`
      : `Added ${email.data} to your team.`,
  };
}

export async function removeMemberAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org, role: myRole, staff } = await access(fd, "ADMIN");
  const userId = str(fd, "userId");
  const link = await db.organizationMember.findUnique({ where: { userId_organizationId: { userId, organizationId: org.id } }, include: { user: { select: { email: true } } } });
  if (!link) return { error: "Team member not found." };
  if (link.role === "OWNER") {
    if (myRole !== "OWNER" && !staff) return { error: "Only an owner can remove an owner." };
    const owners = await db.organizationMember.count({ where: { organizationId: org.id, role: "OWNER" } });
    if (owners <= 1) return { error: "You can't remove the last owner. Add another owner first." };
  }
  await db.organizationMember.delete({ where: { userId_organizationId: { userId, organizationId: org.id } } });
  await audit(user.id, "organization.member_remove", "Organization", org.id, { email: link.user.email });
  revalidatePath(`/organization/${org.id}/team/`);
  if (userId === user.id) redirect("/organization/");
  return { ok: true, message: `Removed ${link.user.email}.` };
}

export async function changeMemberRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user, org, role: myRole, staff } = await access(fd, "ADMIN");
  const userId = str(fd, "userId");
  const role = str(fd, "role") as OrgRoleValue;
  if (!(ORG_ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  const link = await db.organizationMember.findUnique({ where: { userId_organizationId: { userId, organizationId: org.id } }, include: { user: { select: { email: true } } } });
  if (!link) return { error: "Team member not found." };
  if ((role === "OWNER" || link.role === "OWNER") && myRole !== "OWNER" && !staff) return { error: "Only an owner can change an owner's role." };
  if (link.role === "OWNER" && role !== "OWNER") {
    const owners = await db.organizationMember.count({ where: { organizationId: org.id, role: "OWNER" } });
    if (owners <= 1) return { error: "Your organization needs at least one owner." };
  }
  if (ROLE_RANK[role] === ROLE_RANK[link.role]) return null;
  await db.organizationMember.update({ where: { userId_organizationId: { userId, organizationId: org.id } }, data: { role } });
  await audit(user.id, "organization.member_role", "Organization", org.id, { email: link.user.email, from: link.role, to: role });
  revalidatePath(`/organization/${org.id}/team/`);
  return { ok: true, message: `${link.user.email} is now ${role.toLowerCase()}.` };
}

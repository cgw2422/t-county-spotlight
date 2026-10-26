"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl, formatDate, formatDateTime, stripHtml } from "@/lib/utils";
import { ORG_KINDS, KIND_LABEL, claimHref, needHref, opportunityHref } from "@/lib/gives/constants";
import { isOrgPublic, openNeedWhere, openOpportunityWhere, orgRecipients, orgSlug } from "@/lib/gives/queries";
import { normalizeUrl, textToHtml } from "@/components/dashboard/text";
import type { ActionState } from "@/components/ui/form-message";

const get = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const issues = (e: z.ZodError) => {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { error: Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors };
};

const contact = {
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Please enter a valid email address.")),
  phone: z.string().trim().max(30).regex(/^[0-9+().\-\s xext]*$/i, "Please enter a valid phone number.").optional(),
};

// ───────────── Pledge to a need ─────────────

const pledgeSchema = z.object({
  needId: z.string().min(1).max(40),
  ...contact,
  quantity: z.coerce.number({ error: "How many can you give?" }).int("Use a whole number.").min(1, "Pledge at least 1.").max(100_000),
  message: z.string().trim().max(1000).optional(),
});

export async function pledgeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (get(fd, "website_url")) return { ok: true, message: "Thank you! Check your email for next steps." }; // honeypot
  const ip = await clientIp();
  if (!rateLimit(`gives-pledge:${ip}`, 8, 60 * 60_000).ok) return { error: "You've sent several pledges recently. Please try again in a little while." };
  const parsed = pledgeSchema.safeParse({
    needId: get(fd, "needId"), name: get(fd, "name"), email: get(fd, "email"), phone: get(fd, "phone") || undefined,
    quantity: get(fd, "quantity") || "1", message: get(fd, "message") || undefined,
  });
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  const need = await db.communityNeed.findFirst({ where: openNeedWhere({ id: d.needId }), include: { organization: { select: { id: true, name: true, email: true, phone: true, ownershipStatus: true } } } });
  if (!need) return { error: "This need is no longer accepting pledges. Thank you for wanting to help!" };
  const user = await getCurrentUser();

  const pledge = await db.needPledge.create({
    data: {
      needId: need.id, userId: user?.id ?? null, name: sanitizePlain(d.name, 120), email: d.email, phone: d.phone ? sanitizePlain(d.phone, 30) : null,
      quantity: d.quantity, message: d.message ? sanitizePlain(d.message, 1000) : null, status: "PLEDGED",
    },
  });
  await audit(user?.id, "pledge.create", "NeedPledge", pledge.id, { needId: need.id, organizationId: need.organizationId });

  const org = need.organization;
  const unit = need.unit ? ` ${need.unit}` : "";
  await sendEmail(
    d.email,
    `Thank you for your pledge to ${org.name}`,
    [
      `Hi ${d.name},`,
      ``,
      `Thank you for pledging ${d.quantity}${unit} for "${need.title}". ${org.ownershipStatus === "CLAIMED" ? `${org.name} has been notified.` : "Our team has been notified and will help connect you with the organization."}`,
      ``,
      need.instructions ? `How to give:\n${need.instructions}\n` : "",
      need.dropoffLocation ? `Drop-off location: ${need.dropoffLocation}\n` : "",
      need.deadline ? `Needed by: ${formatDate(need.deadline)}\n` : "",
      `Questions? Contact ${org.name}${org.email ? ` at ${org.email}` : ""}${org.phone ? ` or ${org.phone}` : ""}.`,
      ``,
      `Details: ${absoluteUrl(needHref(need))}`,
      ``,
      `Your contact information is shared only with ${org.name} — never posted publicly.`,
    ].filter((l) => l !== "").join("\n"),
  );
  const team = await orgRecipients(org.id);
  for (const to of team) {
    await sendEmail(
      to,
      `New pledge: ${d.quantity}${unit} for "${need.title}"`,
      `${d.name} pledged ${d.quantity}${unit} for "${need.title}".\n\nEmail: ${d.email}${d.phone ? `\nPhone: ${d.phone}` : ""}${d.message ? `\nMessage: ${d.message}` : ""}\n\nWhen it arrives, mark it received so your progress updates:\n${absoluteUrl(`/organization/${org.id}/needs/${need.id}/`)}`,
    );
  }
  revalidatePath(needHref(need));
  return { ok: true, message: `Thank you, ${d.name}! We emailed you the drop-off details${org.ownershipStatus === "CLAIMED" ? `, and ${org.name} knows you're coming` : ""}.` };
}

// ───────────── Volunteer sign-up ─────────────

const signupSchema = z.object({
  oppId: z.string().min(1).max(40),
  ...contact,
  isAdult: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});

export async function volunteerSignupAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (get(fd, "website_url")) return { ok: true, message: "Thanks for signing up!" };
  const ip = await clientIp();
  if (!rateLimit(`gives-signup:${ip}`, 10, 60 * 60_000).ok) return { error: "Too many sign-ups from this connection. Please try again later." };
  const parsed = signupSchema.safeParse({
    oppId: get(fd, "oppId"), name: get(fd, "name"), email: get(fd, "email"), phone: get(fd, "phone") || undefined,
    isAdult: fd.get("isAdult") === "on", notes: get(fd, "notes") || undefined,
  });
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  const opp = await db.volunteerOpportunity.findFirst({ where: openOpportunityWhere({ id: d.oppId }), include: { organization: { select: { id: true, name: true, email: true, phone: true, ownershipStatus: true } } } });
  if (!opp || !opp.registrationOpen || opp.externalSignupUrl) return { error: "Sign-ups for this opportunity are closed." };
  if (opp.minAge != null && !d.isAdult) {
    if (opp.minAge >= 18) return { error: `Volunteers must be ${opp.minAge} or older for this opportunity.`, fieldErrors: { isAdult: "Required" } };
    if (!d.notes || d.notes.length < 5) return { error: "Volunteers under 18 need a parent or guardian. Please add their name and phone number in the notes.", fieldErrors: { notes: "Parent or guardian details required" } };
  }
  const user = await getCurrentUser();

  type Result = { status: "REGISTERED" | "WAITLISTED"; already?: boolean };
  let result: Result | null = null;
  for (let attempt = 0; attempt < 3 && !result; attempt++) {
    try {
      result = await db.$transaction(async (tx) => {
        const existing = await tx.volunteerSignup.findUnique({ where: { opportunityId_email: { opportunityId: opp.id, email: d.email } } });
        if (existing && existing.status !== "CANCELLED") return { status: existing.status === "WAITLISTED" ? "WAITLISTED" : "REGISTERED", already: true } as Result;
        const active = opp.spots == null ? 0 : await tx.volunteerSignup.count({ where: { opportunityId: opp.id, status: { in: ["REGISTERED", "CONFIRMED"] } } });
        const status: Result["status"] = opp.spots != null && active >= opp.spots ? "WAITLISTED" : "REGISTERED";
        const data = {
          name: sanitizePlain(d.name, 120), phone: d.phone ? sanitizePlain(d.phone, 30) : null, isAdult: d.isAdult,
          notes: d.notes ? sanitizePlain(d.notes, 1000) : null, status, userId: user?.id ?? existing?.userId ?? null,
        };
        if (existing) await tx.volunteerSignup.update({ where: { id: existing.id }, data });
        else await tx.volunteerSignup.create({ data: { ...data, opportunityId: opp.id, email: d.email } });
        return { status };
      }, { isolationLevel: "Serializable" });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2034" || code === "P2002") continue; // write conflict / race: retry
      throw e;
    }
  }
  if (!result) return { error: "Something went wrong. Please try again." };
  if (result.already) {
    return { ok: true, message: result.status === "WAITLISTED" ? "You're already on the waitlist for this opportunity — we'll let you know if a spot opens." : "You're already registered for this opportunity. See you there!" };
  }
  await audit(user?.id, "volunteer.signup", "VolunteerOpportunity", opp.id, { organizationId: opp.organizationId, status: result.status });

  const org = opp.organization;
  const when = opp.isOngoing ? "Ongoing — the organization will contact you about scheduling." : opp.startAt ? `${formatDateTime(opp.startAt)}${opp.endAt ? ` – ${formatDateTime(opp.endAt)}` : ""}` : "Date to be announced";
  const where = [opp.locationName, opp.address, opp.city].filter(Boolean).join(", ");
  const waitlisted = result.status === "WAITLISTED";
  await sendEmail(
    d.email,
    waitlisted ? `You're on the waitlist: ${opp.title}` : `You're signed up: ${opp.title}`,
    [
      `Hi ${d.name},`,
      ``,
      waitlisted
        ? `All spots for "${opp.title}" with ${org.name} are currently taken, so you're on the waitlist. ${org.name} will contact you if a spot opens.`
        : `Thanks for volunteering! You're signed up for "${opp.title}" with ${org.name}.`,
      ``,
      `When: ${when}`,
      where ? `Where: ${where}` : "",
      opp.requirements ? `\nPlease note:\n${opp.requirements}` : "",
      ``,
      `Need to cancel or have a question? Contact ${org.name}${org.email ? ` at ${org.email}` : ""}${org.phone ? ` or ${org.phone}` : ""}.`,
      user ? `You can also cancel from your account: ${absoluteUrl("/account/volunteering/")}` : "",
      ``,
      `Details: ${absoluteUrl(opportunityHref(opp))}`,
    ].filter((l, i, arr) => l !== "" || arr[i - 1] !== "").join("\n"),
  );
  const team = await orgRecipients(org.id);
  for (const to of team) {
    await sendEmail(to, `New volunteer${waitlisted ? " (waitlisted)" : ""}: ${opp.title}`, `${d.name} signed up for "${opp.title}"${waitlisted ? " and was placed on the waitlist (all spots are full)" : ""}.\n\nManage registrations: ${absoluteUrl(`/organization/${org.id}/volunteer/${opp.id}/`)}`);
  }
  revalidatePath(opportunityHref(opp));
  return {
    ok: true,
    message: waitlisted
      ? `This opportunity is full, so you're on the waitlist. We emailed you the details, and ${org.name} will reach out if a spot opens.`
      : `You're signed up, ${d.name}! We emailed you the details.`,
  };
}

// ───────────── Register an organization ─────────────

const registerSchema = z.object({
  name: z.string().trim().min(3, "Please enter your organization's name.").max(160),
  kind: z.enum(ORG_KINDS, { error: "Choose what kind of organization this is." }),
  orgType: z.string().trim().max(80).optional(),
  ein: z.string().trim().max(20).regex(/^(\d{2}-?\d{7})?$/, "An EIN has 9 digits, like 12-3456789.").optional(),
  website: z.string().trim().max(300).optional(),
  email: contact.email,
  phone: contact.phone,
  city: z.string().trim().min(2, "Which town are you in?").max(80),
  description: z.string().trim().min(20, "Tell us a little about what you do (a sentence or two).").max(2000),
  applicantRole: z.string().trim().min(2, "What's your role with the organization?").max(120),
});

export async function registerOrgAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login/?next=/gives/register/");
  if (get(fd, "website_url")) return { ok: true, message: "Thanks!" };
  if (!rateLimit(`gives-register:${user.id}`, 5, 24 * 60 * 60_000).ok) return { error: "You've registered several organizations today. Please contact us if you need to add more." };
  const city = get(fd, "city") === "__other" ? get(fd, "cityOther") : get(fd, "city");
  const parsed = registerSchema.safeParse({
    name: get(fd, "name"), kind: get(fd, "kind"), orgType: get(fd, "orgType") || undefined, ein: get(fd, "ein") || undefined,
    website: get(fd, "website") || undefined, email: get(fd, "email"), phone: get(fd, "phone") || undefined, city,
    description: get(fd, "description"), applicantRole: get(fd, "applicantRole"),
  });
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  const website = d.website ? normalizeUrl(d.website) : null;
  if (d.website && !website) return { error: "That website doesn't look right (example: www.example.org).", fieldErrors: { website: "Invalid" } };
  const name = sanitizePlain(d.name, 160);
  const cityClean = sanitizePlain(d.city, 80);

  const duplicate = await db.organization.findFirst({
    where: { deletedAt: null, name: { equals: name, mode: "insensitive" }, city: { equals: cityClean, mode: "insensitive" } },
    select: { id: true, name: true, slug: true, kind: true, status: true, isPublished: true, deletedAt: true, ownershipStatus: true },
  });
  if (duplicate) {
    const settings = await getSettings();
    if (isOrgPublic(duplicate) && duplicate.ownershipStatus !== "CLAIMED") {
      return {
        error: `“${duplicate.name}” in ${cityClean} is already listed but hasn't been claimed yet. To manage it, claim the existing listing instead of registering a new one: ${absoluteUrl(claimHref(duplicate))}`,
        fieldErrors: { name: "Already listed — claim it instead" },
      };
    }
    return {
      error: `“${duplicate.name}” in ${cityClean} may already be listed. To avoid duplicate pages, please ask its current manager to add you from their Team page${settings.contactEmail ? `, or email ${settings.contactEmail} and we'll help you get access` : ", or contact us and we'll help you get access"}.`,
      fieldErrors: { name: "Possible duplicate" },
    };
  }

  const org = await db.organization.create({
    data: {
      name, slug: await orgSlug(name), kind: d.kind, orgType: d.orgType ? sanitizePlain(d.orgType, 80) : null,
      ein: d.ein || null, website, email: d.email, phone: d.phone ? sanitizePlain(d.phone, 30) : null, city: cityClean,
      description: textToHtml(sanitizePlain(d.description, 2000)), status: "PENDING",
      isPublished: true, ownershipStatus: "CLAIMED", source: "self_registered", createdById: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  await audit(user.id, "organization.register", "Organization", org.id, { name, kind: d.kind, city: cityClean, applicantRole: sanitizePlain(d.applicantRole, 120), email: d.email });

  const settings = await getSettings();
  if (settings.notifyAdminEmail) {
    await sendEmail(
      settings.notifyAdminEmail,
      `New ${KIND_LABEL[d.kind].toLowerCase()} registration: ${name}`,
      `${name} (${KIND_LABEL[d.kind]}${d.orgType ? ` · ${d.orgType}` : ""}) in ${cityClean} registered on T-County Gives.\n\nApplicant: ${user.name || ""} <${user.email}> — ${d.applicantRole}\nOrganization email: ${d.email}${d.phone ? `\nPhone: ${d.phone}` : ""}${website ? `\nWebsite: ${website}` : ""}${d.ein ? `\nEIN: ${d.ein}` : ""}\n\n${stripHtml(d.description)}\n\nReview: ${absoluteUrl(`/admin/organizations/${org.id}/`)}`,
    );
  }
  await sendEmail(user.email, `We received your registration for ${name}`, `Thanks for registering ${name} on T-County Gives! Our team will review it, usually within a couple of days, and email you when it's approved.\n\nIn the meantime you can finish your profile and add needs or volunteer opportunities:\n${absoluteUrl(`/organization/${org.id}/`)}\n\nT-County Gives is always free for nonprofits, churches and community groups.`);
  redirect(`/organization/${org.id}/?registered=1`);
}

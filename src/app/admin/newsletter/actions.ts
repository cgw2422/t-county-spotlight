"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { fromDateInput, formatDateTime } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/components/ui/form-message";
import { normalizeContent, emptyContent, SECTION_KEYS, type NewsletterContent, type NLItem, type NLSectionKey } from "@/lib/newsletter/content";
import { autoPopulate, searchItems } from "@/lib/newsletter/populate";
import { addSuppression, normalizeEmail, requestSubscription, unsubscribe } from "@/lib/newsletter/subscribers";
import { broadcastReadiness, kickOffProcessing, sendTest, startCampaign } from "@/lib/newsletter/send";
import { saveNewsletterSettings } from "@/lib/newsletter/settings";
import { NEWSLETTER_NAME } from "@/lib/newsletter/copy";

const id = (fd: FormData) => String(fd.get("id") ?? "");
const EDITABLE = ["DRAFT", "APPROVED", "SCHEDULED"] as const;

async function clearLastError(nlId: string) {
  await db.$executeRaw`UPDATE "Newsletter" SET "stats" = "stats" - 'lastError' WHERE "id" = ${nlId} AND "stats" ? 'lastError'`;
}

function refresh(nlId?: string) {
  revalidatePath("/admin/newsletter", "layout");
  if (nlId) revalidatePath(`/admin/newsletter/campaigns/${nlId}`);
}

// ───────── Subscribers ─────────

/** Sends a double opt-in invitation. Never adds anyone as subscribed without their confirmation. */
export async function inviteSubscriberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const email = normalizeEmail(fd.get("email"));
  if (!email) return { error: "Enter a valid email address." };
  if (String(fd.get("confirmPermission") ?? "") !== "on") return { error: "Confirm that this person asked to receive the newsletter." };
  if (!rateLimit(`nl-invite:${user.id}`, 30, 3600_000).ok) return { error: "Invite limit reached. Try again later." };
  const outcome = await requestSubscription({ email, firstName: String(fd.get("firstName") ?? ""), source: "admin_invite" });
  await audit(user.id, "newsletter.invite", "NewsletterSubscriber", email, { outcome });
  refresh();
  return {
    ok: true,
    message: outcome === "already_active" ? "That address is already subscribed." : outcome === "throttled" ? "A confirmation was sent recently — not sent again." : `Confirmation email sent to ${email}. They'll be subscribed only after they click the link.`,
  };
}

export async function adminUnsubscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const sub = await unsubscribe(id(fd), { method: "admin", actorId: user.id, reason: String(fd.get("reason") ?? "") || "Removed by admin" });
  if (!sub) return { error: "Subscriber not found." };
  await audit(user.id, "newsletter.subscriber_unsubscribe", "NewsletterSubscriber", sub.id, { email: sub.email });
  refresh();
  return { ok: true, message: "Unsubscribed and added to the suppression list." };
}

export async function deleteSubscriberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const sub = await db.newsletterSubscriber.findUnique({ where: { id: id(fd) } });
  if (!sub) return { error: "Subscriber not found." };
  // Keep (or create) the suppression so the address is never re-added without fresh consent.
  if (!(await db.emailSuppression.findUnique({ where: { email: sub.email } }))) await addSuppression(sub.email, "manual");
  await db.newsletterSubscriber.delete({ where: { id: sub.id } });
  await audit(user.id, "newsletter.subscriber_delete", "NewsletterSubscriber", sub.id, { email: sub.email, status: sub.status });
  refresh();
  if (fd.get("redirect") === "1") redirect("/admin/newsletter/subscribers/");
  return { ok: true, message: "Subscriber deleted. The address stays on the suppression list." };
}

// ───────── Campaigns ─────────

export async function createCampaignAction() {
  const user = await requireAdmin();
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" }).format(new Date());
  const nl = await db.newsletter.create({ data: { subject: `${NEWSLETTER_NAME}: ${date}`, content: emptyContent() as unknown as Prisma.InputJsonValue, createdById: user.id } });
  await audit(user.id, "newsletter.create", "Newsletter", nl.id, { subject: nl.subject });
  redirect(`/admin/newsletter/campaigns/${nl.id}/`);
}

async function loadEditable(nlId: string) {
  const nl = await db.newsletter.findUnique({ where: { id: nlId } });
  if (!nl) return { error: "Campaign not found." } as const;
  if (!(EDITABLE as readonly string[]).includes(nl.status)) return { error: "This campaign can no longer be edited." } as const;
  return { nl } as const;
}

/** Any content change after approval sends the campaign back to DRAFT. */
async function writeContent(nlId: string, data: { subject?: string; preheader?: string | null; content: NewsletterContent }, prevStatus: string) {
  const revert = prevStatus === "APPROVED" || prevStatus === "SCHEDULED";
  await db.newsletter.update({
    where: { id: nlId },
    data: {
      ...(data.subject !== undefined ? { subject: data.subject } : {}),
      ...(data.preheader !== undefined ? { preheader: data.preheader } : {}),
      content: data.content as unknown as Prisma.InputJsonValue,
      ...(revert ? { status: "DRAFT", approvedAt: null, approvedById: null, scheduledFor: null } : {}),
    },
  });
  return revert;
}

const saveSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(150, "Keep the subject under 150 characters"),
  preheader: z.string().trim().max(200, "Keep the preheader under 200 characters").optional().transform((v) => v || null),
});

export async function saveCampaignAction(nlId: string, input: { subject: string; preheader: string; content: unknown }): Promise<ActionState & { reverted?: boolean }> {
  const user = await requireAdmin();
  const r = await loadEditable(nlId);
  if ("error" in r) return { error: r.error };
  const p = saveSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  const content = normalizeContent(input.content);
  const reverted = await writeContent(nlId, { ...p.data, content }, r.nl.status);
  await audit(user.id, "newsletter.update", "Newsletter", nlId, { subject: p.data.subject, revertedToDraft: reverted });
  refresh(nlId);
  return { ok: true, reverted, message: reverted ? "Saved. Content changed after approval, so the campaign is back in Draft and needs approval again." : "Saved." };
}

export async function autoPopulateAction(nlId: string): Promise<(ActionState & { content?: NewsletterContent; reverted?: boolean })> {
  const user = await requireAdmin();
  const r = await loadEditable(nlId);
  if ("error" in r) return { error: r.error };
  const content = await autoPopulate(normalizeContent(r.nl.content));
  const reverted = await writeContent(nlId, { content }, r.nl.status);
  const counts = Object.fromEntries(content.sections.map((s) => [s.key, s.items.length]));
  await audit(user.id, "newsletter.autopopulate", "Newsletter", nlId, counts);
  refresh(nlId);
  const total = content.sections.reduce((n, s) => n + s.items.length, 0);
  return { ok: true, content, reverted, message: total ? `Filled ${total} items from site content. Review and edit before approving.` : "No current site content was found to add." };
}

export async function searchItemsAction(section: string, q: string): Promise<NLItem[]> {
  await requireAdmin();
  if (!(SECTION_KEYS as readonly string[]).includes(section)) return [];
  return searchItems(section as NLSectionKey, q);
}

export async function sendTestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const emails = String(fd.get("emails") ?? "").split(/[\s,;]+/).map((e) => normalizeEmail(e)).filter((e): e is string => !!e);
  const unique = [...new Set(emails)].slice(0, 10);
  if (!unique.length) return { error: "Enter at least one valid email address (up to 10)." };
  if (!rateLimit(`nl-test:${user.id}`, 20, 3600_000).ok) return { error: "Test send limit reached. Try again later." };
  const results = await sendTest(id(fd), unique);
  await audit(user.id, "newsletter.test_send", "Newsletter", id(fd), { to: unique });
  const delivered = results.filter((r) => r.delivered).length;
  if (results.every((r) => r.provider === "log")) return { ok: true, message: `No email provider is configured, so the test for ${unique.join(", ")} was written to the server log only.` };
  if (!delivered) return { error: `Test send failed: ${results.find((r) => r.error)?.error ?? "unknown error"}` };
  return { ok: true, message: `Test sent to ${delivered} of ${unique.length} address(es).` };
}

function hasContent(c: NewsletterContent) {
  return c.intro.replace(/<[^>]+>/g, "").trim().length > 0 || c.sections.some((s) => s.enabled && s.items.length);
}

export async function approveCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const nl = await db.newsletter.findUnique({ where: { id: id(fd) } });
  if (!nl) return { error: "Campaign not found." };
  if (nl.status !== "DRAFT") return { error: "Only drafts can be approved." };
  if (!nl.subject.trim()) return { error: "Add a subject first." };
  if (!hasContent(normalizeContent(nl.content))) return { error: "Add an introduction or at least one item before approving." };
  const n = await db.newsletter.updateMany({ where: { id: nl.id, status: "DRAFT", updatedAt: nl.updatedAt }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id } });
  if (!n.count) return { error: "The campaign changed while you were approving it. Review it and try again." };
  await audit(user.id, "newsletter.approve", "Newsletter", nl.id, { subject: nl.subject });
  refresh(nl.id);
  return { ok: true, message: "Approved. You can now schedule it or send it." };
}

export async function returnToDraftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const n = await db.newsletter.updateMany({ where: { id: id(fd), status: { in: ["APPROVED", "SCHEDULED"] } }, data: { status: "DRAFT", approvedAt: null, approvedById: null, scheduledFor: null } });
  if (!n.count) return { error: "Only approved or scheduled campaigns can go back to draft." };
  await audit(user.id, "newsletter.unapprove", "Newsletter", id(fd));
  refresh(id(fd));
  return { ok: true, message: "Back in Draft." };
}

export async function scheduleCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const when = fromDateInput(String(fd.get("scheduledFor") ?? ""));
  if (!when) return { error: "Pick a date and time (Eastern)." };
  if (when.getTime() < Date.now() + 5 * 60_000) return { error: "Schedule at least 5 minutes from now, or use Send now." };
  const ready = await broadcastReadiness();
  const n = await db.newsletter.updateMany({ where: { id: id(fd), status: { in: ["APPROVED", "SCHEDULED"] }, approvedAt: { not: null } }, data: { status: "SCHEDULED", scheduledFor: when } });
  if (!n.count) return { error: "Only approved campaigns can be scheduled." };
  await clearLastError(id(fd));
  await audit(user.id, "newsletter.schedule", "Newsletter", id(fd), { scheduledFor: when.toISOString() });
  refresh(id(fd));
  // Scheduling ahead is allowed; the send itself refuses until setup is complete.
  return { ok: true, message: `Scheduled for ${formatDateTime(when)} (Eastern).${ready.ok ? "" : " Note: it won't send until setup is complete — see the warning on this page."}` };
}

export async function cancelScheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const n = await db.newsletter.updateMany({ where: { id: id(fd), status: "SCHEDULED" }, data: { status: "APPROVED", scheduledFor: null } });
  if (!n.count) return { error: "This campaign isn't scheduled." };
  await audit(user.id, "newsletter.unschedule", "Newsletter", id(fd));
  refresh(id(fd));
  return { ok: true, message: "Schedule canceled. The campaign is still approved." };
}

export async function sendNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const r = await startCampaign(id(fd), user.id);
  if (!r.ok) return { error: r.error };
  await clearLastError(id(fd));
  kickOffProcessing(id(fd));
  refresh(id(fd));
  return { ok: true, message: `Sending to ${r.recipients} subscriber(s). This page updates as it goes.` };
}

export async function stopSendingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const n = await db.newsletter.updateMany({ where: { id: id(fd), status: { in: ["SENDING", "FAILED"] } }, data: { status: "CANCELED" } });
  if (!n.count) return { error: "This campaign isn't sending." };
  const skipped = await db.newsletterSend.updateMany({ where: { newsletterId: id(fd), status: "QUEUED" }, data: { status: "SKIPPED", error: "Campaign canceled" } });
  await audit(user.id, "newsletter.cancel", "Newsletter", id(fd), { skipped: skipped.count });
  refresh(id(fd));
  return { ok: true, message: `Stopped. ${skipped.count} queued email(s) will not be sent.` };
}

export async function resumeCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const ready = await broadcastReadiness();
  if (!ready.ok) return { error: ready.problems.join(" ") };
  const n = await db.newsletter.updateMany({ where: { id: id(fd), status: "FAILED", sendStartedAt: { not: null } }, data: { status: "SENDING" } });
  if (!n.count) return { error: "Only a failed send can be resumed." };
  await audit(user.id, "newsletter.resume", "Newsletter", id(fd));
  kickOffProcessing(id(fd));
  refresh(id(fd));
  return { ok: true, message: "Resumed sending the remaining emails." };
}

export async function deleteCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const nl = await db.newsletter.findUnique({ where: { id: id(fd) } });
  if (!nl) return { error: "Campaign not found." };
  if (!["DRAFT", "APPROVED", "CANCELED"].includes(nl.status) || nl.sendStartedAt) return { error: "Campaigns that were sent (or partly sent) are kept for your records." };
  await db.newsletter.delete({ where: { id: nl.id } });
  await audit(user.id, "newsletter.delete", "Newsletter", nl.id, { subject: nl.subject });
  refresh();
  redirect("/admin/newsletter/campaigns/");
}

// ───────── Settings ─────────

const settingsSchema = z.object({
  fromName: z.string().trim().max(80).regex(/^[^"<>\r\n]*$/, "From name can't contain quotes or angle brackets"),
  fromAddress: z.string().trim().toLowerCase().max(254).refine((v) => !v || z.email().safeParse(v).success, "Enter a valid From address"),
  replyTo: z.string().trim().toLowerCase().max(254).refine((v) => !v || z.email().safeParse(v).success, "Enter a valid Reply-to address"),
  postalAddress: z.string().trim().max(300),
  consentVersion: z.string().trim().min(1, "Consent version is required").max(40).regex(/^[\w.\-]+$/, "Use letters, numbers, dots and dashes"),
  description: z.string().trim().max(500),
});

export async function saveNewsletterSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = settingsSchema.safeParse(Object.fromEntries(["fromName", "fromAddress", "replyTo", "postalAddress", "consentVersion", "description"].map((k) => [k, String(fd.get(k) ?? "")])));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Check the form." };
  await saveNewsletterSettings(p.data);
  await audit(user.id, "newsletter.settings", "Setting", "newsletter", p.data);
  refresh();
  return { ok: true, message: "Newsletter settings saved." };
}

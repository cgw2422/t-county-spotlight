"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizePlain } from "@/lib/sanitize";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { absoluteUrl } from "@/lib/utils";
import { isDateKey, startOfNyDay } from "@/components/public/dates";
import type { ActionState } from "@/components/ui/form-message";
import { communityName } from "@/lib/my-t-county-shared";
import { countLinks } from "@/lib/garage-sales-shared";
import type { CommunitySuggestion } from "@/generated/prisma/client";
import {
  SUGGESTION_KINDS, SUGGESTION_LIMITS, emailSuggestionLink, findSuggestionByToken, formAgeSeconds, newSuggestionToken, type SuggestionKindValue,
} from "@/lib/suggestions";

const schema = z.object({
  kind: z.enum(SUGGESTION_KINDS, { message: "Choose what you're sharing" }),
  title: z.string().trim().min(3, "Add a title (at least 3 characters)").max(160, "Keep the title under 160 characters"),
  details: z.string().trim().min(10, "Add a few details (at least 10 characters)").max(4000, "Keep the details under 4,000 characters"),
  city: z.string().trim().max(80).optional(),
  address: z.string().trim().max(200, "Keep the address under 200 characters").optional(),
  linkUrl: z.string().trim().max(500, "That link is too long").optional().refine((v) => !v || /^https?:\/\/[^\s<>"]+$/i.test(v), "Links must start with https://"),
  eventDate: z.string().trim().optional().refine((v) => !v || isDateKey(v), "Enter a valid date"),
  name: z.string().trim().max(100).optional(),
  email: z.email("Enter a valid email").max(200),
});

type Data = Pick<CommunitySuggestion, "kind" | "title" | "details" | "city" | "address" | "linkUrl" | "eventDate" | "photos" | "submitterName" | "submitterEmail">;

function fail(message: string, field?: string): { error: ActionState } {
  return { error: { error: message, ...(field ? { fieldErrors: { [field]: message } } : {}) } };
}

async function parseSuggestion(fd: FormData, original?: CommunitySuggestion | null): Promise<{ data: Data } | { error: ActionState }> {
  const get = (k: string) => fd.get(k)?.toString() ?? "";
  const r = schema.safeParse({
    kind: get("kind"), title: get("title"), details: get("details"), city: get("city") || undefined, address: get("address") || undefined,
    linkUrl: get("linkUrl") || undefined, eventDate: get("eventDate") || undefined, name: get("name") || undefined, email: get("email").trim().toLowerCase(),
  });
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of r.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: { error: "Please fix the highlighted fields.", fieldErrors } };
  }
  const d = r.data;
  if (countLinks(d.title) > 0) return fail("Links aren't allowed in the title.", "title");
  if (countLinks(d.details) > SUGGESTION_LIMITS.maxLinksInDetails) return fail(`Please include at most ${SUGGESTION_LIMITS.maxLinksInDetails} links in the details (use the link field for the main one).`, "details");
  if (d.address && countLinks(d.address) > 0) return fail("Links aren't allowed in the address.", "address");
  let city: string | null = null;
  if (d.city) {
    city = communityName(d.city);
    if (!city) return fail("Choose a community from the list.", "city");
  }
  const photos = [...new Set(fd.getAll("photos").map(String).filter(Boolean))];
  if (photos.length > SUGGESTION_LIMITS.maxPhotos) return fail(`You can add up to ${SUGGESTION_LIMITS.maxPhotos} photos.`, "photos");
  if (photos.length) {
    const keep = new Set(original?.photos ?? []);
    const fresh = photos.filter((p) => !keep.has(p));
    const known = fresh.length ? await db.media.count({ where: { url: { in: fresh }, deletedAt: null, mimeType: { startsWith: "image/" } } }) : 0;
    if (known !== fresh.length) return fail("One of the photos couldn't be found. Please upload it again.", "photos");
  }
  return {
    data: {
      kind: d.kind as SuggestionKindValue,
      title: sanitizePlain(d.title, 160),
      details: sanitizePlain(d.details, 4000),
      city,
      address: sanitizePlain(d.address, 200) || null,
      linkUrl: d.linkUrl || null,
      eventDate: d.eventDate ? startOfNyDay(d.eventDate) : null,
      photos,
      submitterName: sanitizePlain(d.name, 100) || null,
      submitterEmail: d.email,
    },
  };
}

function refresh() {
  revalidatePath("/admin/suggestions/", "layout");
  revalidatePath("/admin/submissions/");
  revalidatePath("/account/");
}

export async function submitSuggestion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // Honeypot: people never fill this hidden field. Pretend it worked.
  if (fd.get("website_url")) return { ok: true, message: "Thanks! Your suggestion was sent to our team for review." };

  const age = formAgeSeconds(String(fd.get("t") ?? ""), String(fd.get("sig") ?? ""));
  if (age === null) return { error: "This form expired. Please reload the page and try again." };
  if (age < SUGGESTION_LIMITS.minSecondsOnForm) return { error: "That was quick! Please take a moment to check your details, then submit again." };

  const ip = await clientIp();
  if (!rateLimit(`sg-submit:${ip}`, 6, 60 * 60_000).ok) return { error: "You've sent several suggestions recently. Please try again in an hour." };
  if (fd.get("consent") !== "on") return { error: "Please confirm the information is accurate to the best of your knowledge.", fieldErrors: { consent: "Required" } };

  const p = await parseSuggestion(fd);
  if ("error" in p) return p.error;
  const d = p.data;
  if (!rateLimit(`sg-submit-email:${d.submitterEmail}`, 5, 24 * 3600_000).ok) return { error: "This email has sent several suggestions today. Please try again tomorrow." };

  const user = await getCurrentUser();
  const { token, hash } = newSuggestionToken();
  // Never auto-published: every suggestion starts PENDING, even from staff.
  const s = await db.communitySuggestion.create({ data: { ...d, userId: user?.id ?? null, manageTokenHash: hash, status: "PENDING" } });
  await audit(user?.id, "suggestion.submit", "CommunitySuggestion", s.id, { kind: s.kind, title: s.title });
  await emailSuggestionLink(d.submitterEmail, s.title, token);
  const settings = await getSettings();
  if (settings.notifyAdminEmail) {
    await sendEmail(settings.notifyAdminEmail, `New community suggestion: ${s.title}`, `${s.title}\n${s.kind}${s.city ? ` · ${s.city}` : ""}\n\nReview it: ${absoluteUrl(`/admin/suggestions/${s.id}/`)}`);
  }
  refresh();
  return { ok: true, message: "Thanks! Our team will review your suggestion. We emailed you a private link to check its status, edit it or withdraw it." };
}

/** Resolves the suggestion a manage request refers to: by secret token, or by the signed-in submitter. */
async function suggestionForManage(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  if (token) {
    const ip = await clientIp();
    if (!rateLimit(`sg-manage:${ip}`, 30, 60 * 60_000).ok) return { error: "Too many attempts. Please try again later." } as const;
    const s = await findSuggestionByToken(token);
    return s ? ({ s, userId: null } as const) : ({ error: "This manage link isn't valid anymore." } as const);
  }
  const user = await getCurrentUser();
  const id = String(fd.get("suggestionId") ?? "");
  if (!user || !id) return { error: "Please sign in to manage your suggestion." } as const;
  const s = await db.communitySuggestion.findUnique({ where: { id } });
  if (!s || s.userId !== user.id) return { error: "Suggestion not found." } as const;
  return { s, userId: user.id } as const;
}

/** Edit & resubmit while PENDING or REJECTED (rejected goes back to PENDING). */
export async function updateSuggestion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (fd.get("website_url")) return { ok: true, message: "Saved." };
  const r = await suggestionForManage(fd);
  if ("error" in r) return { error: r.error };
  const { s } = r;
  if (s.status !== "PENDING" && s.status !== "REJECTED") return { error: "This suggestion can't be edited anymore." };
  const p = await parseSuggestion(fd, s);
  if ("error" in p) return p.error;
  const resubmitted = s.status === "REJECTED";
  const emailChanged = p.data.submitterEmail !== s.submitterEmail;
  await db.communitySuggestion.update({
    where: { id: s.id },
    data: { ...p.data, status: "PENDING", rejectionReason: null, ...(resubmitted ? { reviewedAt: null, reviewedById: null } : {}) },
  });
  await audit(r.userId, resubmitted ? "suggestion.resubmit" : "suggestion.edit", "CommunitySuggestion", s.id, { title: p.data.title, from: s.status, by: r.userId ? "account" : "manage_link" });
  if (emailChanged) {
    // Re-issue the manage link to the new address; the old link stops working.
    const { token, hash } = newSuggestionToken();
    await db.communitySuggestion.update({ where: { id: s.id }, data: { manageTokenHash: hash } });
    await emailSuggestionLink(p.data.submitterEmail, p.data.title, token, { resubmitted: true });
  }
  refresh();
  return {
    ok: true,
    message: resubmitted
      ? `Resubmitted. Our team will review it again.${emailChanged ? " We sent a new manage link to your new email." : ""}`
      : `Changes saved. Your suggestion is still waiting for review.${emailChanged ? " We sent a new manage link to your new email." : ""}`,
  };
}

export async function withdrawSuggestion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await suggestionForManage(fd);
  if ("error" in r) return { error: r.error };
  if (r.s.status === "WITHDRAWN") return { ok: true, message: "This suggestion is already withdrawn." };
  if (r.s.status !== "PENDING" && r.s.status !== "REJECTED") return { error: "This suggestion was already reviewed and can't be withdrawn here. Contact us if something changed." };
  await db.communitySuggestion.update({ where: { id: r.s.id }, data: { status: "WITHDRAWN" } });
  await audit(r.userId, "suggestion.withdraw", "CommunitySuggestion", r.s.id, { title: r.s.title, by: r.userId ? "account" : "manage_link" });
  refresh();
  return { ok: true, message: "Your suggestion was withdrawn. Thanks for letting us know!" };
}

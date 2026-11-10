"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { slugify, stripHtml, truncate } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { suggestionKindLabel } from "@/lib/suggestions-shared";
import { parseForm, uniqueSlug, zOpt } from "../_lib/form";

function refresh(id?: string) {
  revalidatePath("/admin/suggestions/");
  if (id) revalidatePath(`/admin/suggestions/${id}/`);
  revalidatePath("/admin/submissions/");
  revalidatePath("/admin", "layout");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const textToHtml = (s: string) => s.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).filter((p) => p !== "<p></p>").join("\n");

/** Reject (reason emailed), mark approved (no content created), or move back to pending. */
export async function setSuggestionStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(["APPROVED", "REJECTED", "PENDING"]), reason: zOpt(1000), note: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const { id, status, reason, note } = p.data;
  if (status === "REJECTED" && !reason) return { error: "Add a reason so the submitter knows why." };
  const s = await db.communitySuggestion.findUnique({ where: { id } });
  if (!s) return { error: "Suggestion not found." };
  if (s.status === status) return { ok: true, message: "No change." };
  if (s.status === "WITHDRAWN" && status !== "PENDING") return { error: "The submitter withdrew this suggestion." };
  const now = new Date();
  await db.communitySuggestion.update({
    where: { id },
    data: {
      status,
      rejectionReason: status === "REJECTED" ? reason : null,
      ...(status === "PENDING" ? { reviewedAt: null, reviewedById: null } : { reviewedById: user.id, reviewedAt: now }),
    },
  });
  const verb = status === "APPROVED" ? "approve" : status === "REJECTED" ? "reject" : "reopen";
  await audit(user.id, `suggestion.${verb}`, "CommunitySuggestion", id, { title: s.title, kind: s.kind, from: s.status, reason, note });
  if (status === "REJECTED") {
    await sendEmail(s.submitterEmail, `About your suggestion “${s.title}”`,
      `Thanks for sharing “${s.title}” with T County Connect. We weren't able to use it as it is.\n\nReason: ${reason}\n\nYou can edit and resubmit it using the private manage link from our first email.\n\n— T County Connect`);
  }
  refresh(id);
  return { ok: true, message: { approve: "Marked approved.", reject: "Rejected. The submitter was emailed.", reopen: "Moved back to pending." }[verb] };
}

/**
 * "Create from this": BUSINESS_OPENING → draft New & Coming Soon entry,
 * COMMUNITY_UPDATE → draft community update (Article ANNOUNCEMENT). Staff edit
 * and publish it; nothing is published automatically. Dates are not copied
 * (staff verify and enter announced dates themselves).
 */
export async function createFromSuggestion(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1) }), fd);
  if (p.error) return p.error;
  const s = await db.communitySuggestion.findUnique({ where: { id: p.data.id } });
  if (!s) return { error: "Suggestion not found." };
  if (s.status === "WITHDRAWN") return { error: "The submitter withdrew this suggestion." };
  if (s.resultRef) return { error: "Something was already created from this suggestion." };
  const now = new Date();
  let ref: string;
  let href: string;
  if (s.kind === "BUSINESS_OPENING") {
    const u = await db.businessUpdate.create({
      data: {
        kind: "COMING_SOON", status: "DRAFT", title: s.title, businessName: s.title, body: s.details, address: s.address, city: s.city,
        photos: s.photos, imageUrl: s.photos[0] ?? null, linkUrl: s.linkUrl, submittedById: user.id,
      },
    });
    ref = `BusinessUpdate:${u.id}`;
    href = `/admin/updates/${u.id}/`;
  } else if (s.kind === "COMMUNITY_UPDATE") {
    const slug = await uniqueSlug(slugify(s.title), async (x) => !!(await db.article.findUnique({ where: { slug: x }, select: { id: true } })));
    const content = textToHtml(s.details);
    const a = await db.article.create({
      data: {
        kind: "ANNOUNCEMENT", status: "DRAFT", title: s.title, slug, content, excerpt: truncate(stripHtml(s.details), 240), city: s.city,
        featuredImageUrl: s.photos[0] ?? null, authorId: user.id, authorName: user.name, localEditedAt: now,
      },
    });
    await db.articleRevision.create({ data: { articleId: a.id, title: a.title, excerpt: a.excerpt, content, note: "Created from a resident suggestion", userId: user.id } });
    ref = `Article:${a.id}`;
    href = `/admin/articles/${a.id}/`;
  } else {
    return { error: `Nothing is created automatically for “${suggestionKindLabel(s.kind)}”. Mark it approved and add it where it belongs.` };
  }
  await db.communitySuggestion.update({ where: { id: s.id }, data: { status: "APPROVED", resultRef: ref, rejectionReason: null, reviewedById: user.id, reviewedAt: now } });
  await audit(user.id, "suggestion.create_from", "CommunitySuggestion", s.id, { title: s.title, kind: s.kind, resultRef: ref });
  refresh(s.id);
  redirect(`${href}?created=1`);
}

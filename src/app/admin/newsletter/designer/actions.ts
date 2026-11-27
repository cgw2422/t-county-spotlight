"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { defaultContent, uid } from "@/lib/newsletter-designer/types";
import {
  checkDesignInBeehiiv, listBeehiivPolls, cleanContent, designInput, nextIssueNumber, readContent, searchArticles, searchBusinesses, sendDesignToBeehiiv,
  type PickedBusiness, type PickedPoll, type PickedStory, type SendResult, type WeatherMode,
} from "@/lib/newsletter-designer/server";
import type { Prisma } from "@/generated/prisma/client";

const BASE = "/admin/newsletter/designer";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** New issue from the template. */
export async function createDesignAction() {
  const user = await requireAdmin();
  const issueNumber = await nextIssueNumber();
  const d = await db.newsletterDesign.create({
    data: {
      title: `T County Connect — Issue #${String(issueNumber).padStart(3, "0")}`, issueNumber, issueDate: new Date(`${today()}T12:00:00Z`),
      content: defaultContent() as unknown as Prisma.InputJsonValue, createdById: user.id, updatedById: user.id,
    },
  });
  await audit(user.id, "newsletter.design_create", "NewsletterDesign", d.id, { issueNumber });
  redirect(`${BASE}/${d.id}/`);
}

/** Copy of an earlier issue as a starting point (new issue number and date; nothing in beehiiv is touched). */
export async function duplicateDesignAction(fd: FormData) {
  const user = await requireAdmin();
  const src = await db.newsletterDesign.findUnique({ where: { id: String(fd.get("id") ?? "").slice(0, 40) } });
  if (!src) redirect(`${BASE}/`);
  const issueNumber = await nextIssueNumber();
  const content = readContent(src.content);
  // Fresh ids so the copy's items are independent of the original's.
  content.sections = content.sections.map((s) => ({
    ...s, id: uid(),
    ...("items" in s ? { items: s.items.map((i) => ({ ...i, id: uid() })) } : {}),
  })) as typeof content.sections;
  const d = await db.newsletterDesign.create({
    data: {
      title: `T County Connect — Issue #${String(issueNumber).padStart(3, "0")}`, previewText: src.previewText, issueNumber,
      issueDate: new Date(`${today()}T12:00:00Z`), content: content as unknown as Prisma.InputJsonValue,
      createdById: user.id, updatedById: user.id, duplicatedFromId: src.id,
    },
  });
  await audit(user.id, "newsletter.design_duplicate", "NewsletterDesign", d.id, { from: src.id, issueNumber });
  redirect(`${BASE}/${d.id}/`);
}

/** Only drafts that never reached beehiiv can be deleted here. */
export async function deleteDesignAction(fd: FormData) {
  const user = await requireAdmin();
  const id = String(fd.get("id") ?? "").slice(0, 40);
  const r = await db.newsletterDesign.deleteMany({ where: { id, beehiivPostId: null, beehiivStatus: { in: ["none", "failed"] } } });
  if (r.count) await audit(user.id, "newsletter.design_delete", "NewsletterDesign", id, {});
  revalidatePath(`${BASE}/`);
}

export type SaveResult = { ok: true; savedAt: string } | { ok: false; error: string };

export async function saveDesignAction(id: string, payload: unknown): Promise<SaveResult> {
  const user = await requireAdmin();
  const p = designInput.safeParse(payload);
  if (!p.success) return { ok: false, error: `Couldn't save: ${p.error.issues[0]?.path.join(".")} ${p.error.issues[0]?.message ?? ""}`.trim() };
  const d = p.data;
  const r = await db.newsletterDesign.updateMany({
    where: { id: id.slice(0, 40) },
    data: {
      title: d.title, previewText: d.previewText || null, issueNumber: d.issueNumber, issueDate: new Date(`${d.issueDate}T12:00:00Z`),
      content: cleanContent(d.content) as unknown as Prisma.InputJsonValue, updatedById: user.id,
    },
  });
  if (!r.count) return { ok: false, error: "This newsletter no longer exists." };
  revalidatePath(`${BASE}/`);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function searchArticlesAction(q: string): Promise<PickedStory[]> {
  await requireAdmin();
  return searchArticles(String(q ?? ""));
}

/** Government Watch stories marked Reviewed or Published (for More stories / Featured). */
export async function searchGovStoriesAction(q: string): Promise<PickedStory[]> {
  await requireAdmin();
  const { searchGovStories } = await import("@/lib/gov-watch/newsletter");
  return searchGovStories(String(q ?? ""));
}

export async function searchBusinessesAction(q: string): Promise<PickedBusiness[]> {
  await requireAdmin();
  return searchBusinesses(String(q ?? ""));
}

export async function sendToBeehiivAction(id: string, opts: { weatherMode: WeatherMode; archiveTag: boolean; sendAgain: boolean }): Promise<SendResult> {
  const user = await requireAdmin();
  const r = await sendDesignToBeehiiv(String(id).slice(0, 40), {
    userId: user.id, weatherMode: opts.weatherMode === "snapshot" ? "snapshot" : "rss", archiveTag: !!opts.archiveTag, sendAgain: !!opts.sendAgain,
  });
  revalidatePath(`${BASE}/`);
  return r;
}

export async function checkBeehiivAction(id: string): Promise<SendResult> {
  const user = await requireAdmin();
  const r = await checkDesignInBeehiiv(String(id).slice(0, 40), user.id);
  revalidatePath(`${BASE}/`);
  return r;
}

export async function listPollsAction(): Promise<{ ok: true; polls: PickedPoll[] } | { ok: false; message: string }> {
  await requireAdmin();
  return listBeehiivPolls();
}

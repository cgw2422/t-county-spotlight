"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form-message";
import {
  abandonRequest, checkBeehiivForRequest, createNewsletterDraft, isRequestToken, saveTemplateId,
  type CheckResult, type CreateResult,
} from "@/lib/newsletter-events";

const PATH = "/admin/newsletter/events/";
const keyList = (v: string) => v.split(",").map((s) => s.trim()).filter((s) => /^[A-Za-z0-9_-]{1,40}~[0-9a-z]{1,12}$/.test(s)).slice(0, 1000);

const DraftSchema = z.object({
  token: z.string().max(80),
  from: z.string().max(10).optional().default(""),
  to: z.string().max(10).optional().default(""),
  ex: z.string().max(60_000).optional().default(""),
  feat: z.string().max(60).optional().default(""),
  title: z.string().max(250).optional().default(""),
  subtitle: z.string().max(250).optional().default(""),
  intro: z.string().max(500).optional().default(""),
  tag: z.string().max(3).optional().default(""),
});

export type CreateDraftState = (CreateResult & { at: number }) | null;

/** Creates a beehiiv DRAFT (never published or scheduled). One beehiiv call per request token. */
export async function createNewsletterEventsDraftAction(_: CreateDraftState, fd: FormData): Promise<CreateDraftState> {
  const user = await requireAdmin();
  const parsed = DraftSchema.safeParse(Object.fromEntries(["token", "from", "to", "ex", "feat", "title", "subtitle", "intro", "tag"].map((k) => [k, fd.get(k) ?? undefined])));
  if (!parsed.success) return { status: "invalid", message: "The form was incomplete. Reload the page and try again.", nextToken: "", at: Date.now() };
  const v = parsed.data;
  if (!rateLimit(`nl-events-draft:${user.id}`, 20, 3600_000).ok) return { status: "invalid", message: "Too many draft requests this hour. Try again later.", nextToken: v.token, at: Date.now() };
  const feat = keyList(v.feat)[0] ?? null;
  const result = await createNewsletterDraft(
    { token: v.token, fromKey: v.from || null, toKey: v.to || null, excluded: keyList(v.ex), featured: feat, title: v.title, subtitle: v.subtitle, intro: v.intro, archiveTag: v.tag === "1" },
    { userId: user.id },
  );
  revalidatePath(PATH);
  return { ...result, at: Date.now() };
}

export type CheckState = (CheckResult & { at: number }) | null;

/** Lists recent beehiiv drafts and matches the request's exact title (recovers an unknown outcome). */
export async function checkBeehiivDraftsAction(_: CheckState, fd: FormData): Promise<CheckState> {
  const user = await requireAdmin();
  const token = String(fd.get("token") ?? "");
  if (!isRequestToken(token)) return { status: "error", message: "Missing request.", drafts: [], at: Date.now() };
  if (!rateLimit(`nl-events-check:${user.id}`, 60, 3600_000).ok) return { status: "error", message: "Too many checks. Try again later.", drafts: [], at: Date.now() };
  const result = await checkBeehiivForRequest(token, { userId: user.id });
  revalidatePath(PATH);
  return { ...result, at: Date.now() };
}

export type AbandonState = { nextToken: string; at: number } | null;

/** Admin checked beehiiv and the draft isn't there: close the unknown request, issue a new token. */
export async function abandonRequestAction(_: AbandonState, fd: FormData): Promise<AbandonState> {
  const user = await requireAdmin();
  const token = String(fd.get("token") ?? "");
  const r = await abandonRequest(isRequestToken(token) ? token : "", user.id);
  revalidatePath(PATH);
  return { nextToken: r.nextToken, at: Date.now() };
}

export async function saveNewsletterEventsSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const r = await saveTemplateId(String(fd.get("templateId") ?? "").slice(0, 120), user.id);
  if (!r.ok) return { error: r.error, fieldErrors: { templateId: r.error } };
  revalidatePath(PATH);
  return { ok: true, message: r.value ? "Template ID saved. New drafts will use it." : "Template ID cleared. New drafts use your publication's default template." };
}

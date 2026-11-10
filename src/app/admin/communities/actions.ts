"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { focusFromForm } from "@/lib/cover";
import { communityBySlug } from "@/lib/communities-shared";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zUrlOpt } from "../_lib/form";

const INTRO_MAX = 1500;

const schema = z.object({
  slug: z.string().min(1).max(80),
  intro: z.string().trim().max(INTRO_MAX, `Keep the introduction under ${INTRO_MAX} characters`).optional().transform((v) => (v ? v : null)),
  coverUrl: zUrlOpt,
});

/** Saves a community's optional cover photo + introduction (plain text). Creates the CommunityProfile row lazily. */
export async function saveCommunityProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const c = communityBySlug(p.data.slug);
  if (!c) return { error: "Unknown community." };
  // Plain text only; keep line breaks (rendered with white-space: pre-line).
  const intro = p.data.intro ? p.data.intro.split(/\r?\n/).map((l) => sanitizePlain(l, INTRO_MAX)).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null : null;
  const data = {
    name: c.name,
    intro,
    coverImageUrl: p.data.coverUrl,
    ...(p.data.coverUrl ? focusFromForm(fd) : { coverFocusX: 50, coverFocusY: 50 }),
    updatedById: user.id,
  };
  const before = await db.communityProfile.findUnique({ where: { slug: c.slug }, select: { id: true, coverImageUrl: true, intro: true } });
  const row = await db.communityProfile.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data });
  await audit(user.id, before ? "community.update" : "community.create", "CommunityProfile", row.id, {
    slug: c.slug, coverChanged: (before?.coverImageUrl ?? null) !== data.coverImageUrl, introChanged: (before?.intro ?? null) !== intro,
  });
  revalidatePath("/admin/communities");
  revalidatePath(`/communities/${c.slug}`);
  return { ok: true, message: "Community page saved." };
}

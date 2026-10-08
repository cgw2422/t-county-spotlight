"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zOpt } from "../_lib/form";
import { findMediaUsage } from "./usage";

export async function updateMedia(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), alt: zOpt(300), caption: zOpt(1000), title: zOpt(200) }), fd);
  if (p.error) return p.error;
  const m = await db.media.update({ where: { id: p.data.id }, data: { alt: p.data.alt, caption: p.data.caption, title: p.data.title } });
  await audit(user.id, "media.update", "Media", m.id, { filename: m.filename });
  revalidatePath("/admin/media");
  return { ok: true, message: "Details saved." };
}

export async function deleteMedia(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const m = await db.media.findUnique({ where: { id: String(fd.get("id") ?? "") } });
  if (!m || m.deletedAt) return { error: "File not found." };
  const usage = await findMediaUsage(m.url);
  const live = usage.filter((u) => u.live);
  if (live.length) return { error: `Can't delete: used by ${live.length} published item${live.length === 1 ? "" : "s"} (${live.slice(0, 3).map((u) => `${u.type} “${u.title}”`).join(", ")}). Replace the image there first.` };
  await db.media.update({ where: { id: m.id }, data: { deletedAt: new Date() } });
  try {
    await deleteObject(m.key);
  } catch (e) {
    console.error("[media] object delete failed", e);
  }
  await audit(user.id, "media.delete", "Media", m.id, { filename: m.filename, url: m.url, draftUsages: usage.length });
  revalidatePath("/admin/media");
  redirect("/admin/media/?deleted=1");
}

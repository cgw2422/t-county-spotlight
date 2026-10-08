"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import type { ActionState } from "@/components/ui/form-message";
import { parseForm, zOpt } from "../_lib/form";

export async function moderateUpdate(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), decision: z.enum(["approve", "reject", "unpublish", "delete"]), reason: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const u = await db.businessUpdate.findUnique({ where: { id: p.data.id }, include: { business: { include: { owners: { include: { user: { select: { email: true } } } } } } } });
  if (!u) return { error: "Update not found." };
  if (p.data.decision === "delete") {
    await db.businessUpdate.delete({ where: { id: u.id } });
  } else {
    const status = p.data.decision === "approve" ? "PUBLISHED" : p.data.decision === "reject" ? "ARCHIVED" : "DRAFT";
    await db.businessUpdate.update({ where: { id: u.id }, data: { status } });
  }
  await audit(user.id, `business_update.${p.data.decision}`, "BusinessUpdate", u.id, { title: u.title, business: u.business.name, reason: p.data.reason });
  if (u.status === "PENDING" && (p.data.decision === "approve" || p.data.decision === "reject")) {
    for (const o of u.business.owners) {
      await sendEmail(o.user.email, p.data.decision === "approve" ? `Your update “${u.title}” is live` : `Your update “${u.title}” wasn't approved`,
        p.data.decision === "approve" ? `Your update for ${u.business.name} is now visible on your TCountySpotlight page.` : `We couldn't publish your update “${u.title}”.${p.data.reason ? `\n\nReason: ${p.data.reason}` : ""}`);
    }
  }
  revalidatePath("/admin/updates");
  revalidatePath("/", "layout");
  return { ok: true, message: { approve: "Update approved.", reject: "Update rejected.", unpublish: "Update unpublished.", delete: "Update deleted." }[p.data.decision] };
}

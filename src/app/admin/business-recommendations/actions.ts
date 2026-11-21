"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { sanitizePlain } from "@/lib/sanitize";
import { LeadError, linkLead, mergeLeads, unlinkLead, updateLead } from "@/lib/business-leads";
import { LEAD_STATUSES } from "@/lib/business-leads-shared";
import type { ActionState } from "@/components/ui/form-message";

const BASE = "/admin/business-recommendations";
const done = (id: string, message: string): ActionState => {
  revalidatePath(`${BASE}/`);
  revalidatePath(`${BASE}/${id}/`);
  revalidatePath("/admin", "layout");
  return { ok: true, message };
};
async function guard(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LeadError) return { error: e.message };
    throw e;
  }
}

/** Status + private admin notes (staff only; notes are never shown publicly). */
export async function saveLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = z.object({ id: z.string().min(1).max(60), status: z.enum(LEAD_STATUSES), adminNotes: z.string().max(5000).optional() }).safeParse({
    id: fd.get("id"), status: fd.get("status"), adminNotes: fd.get("adminNotes") ?? undefined,
  });
  if (!p.success) return { error: "Choose a status." };
  return guard(async () => {
    await updateLead(p.data.id, { status: p.data.status, adminNotes: sanitizePlain(p.data.adminNotes, 5000) || null }, user.id);
    return done(p.data.id, "Saved.");
  });
}

/** Quick status change from the list. */
export async function setLeadStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "").slice(0, 60);
  const status = z.enum(LEAD_STATUSES).safeParse(fd.get("status"));
  if (!id || !status.success) return { error: "Choose a status." };
  const { db } = await import("@/lib/db");
  const lead = await db.businessLead.findUnique({ where: { id }, select: { adminNotes: true } });
  if (!lead) return { error: "Recommendation not found." };
  return guard(async () => {
    await updateLead(id, { status: status.data, adminNotes: lead.adminNotes }, user.id);
    return done(id, "Status updated.");
  });
}

export async function linkLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "").slice(0, 60);
  const businessId = String(fd.get("businessId") ?? "").slice(0, 60);
  if (!id || !businessId) return { error: "Choose a listing." };
  return guard(async () => {
    await linkLead(id, businessId, user.id);
    return done(id, "Linked to the listing.");
  });
}

export async function unlinkLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "").slice(0, 60);
  return guard(async () => {
    await unlinkLead(id, user.id);
    return done(id, "Unlinked.");
  });
}

/** Merge this recommendation into another one for the same business (all submissions are kept). */
export async function mergeLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "").slice(0, 60);
  const into = String(fd.get("into") ?? "").slice(0, 60);
  const r = await guard(async () => {
    await mergeLeads(id, into, user.id);
    return { ok: true };
  });
  if (!r?.ok) return r;
  revalidatePath(`${BASE}/`);
  revalidatePath("/admin", "layout");
  redirect(`${BASE}/${into}/?merged=1`);
}

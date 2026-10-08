"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fromDateInput } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, parseForm, zBool, zOpt, zUrlOpt } from "../_lib/form";

const schema = z.object({
  id: z.string().optional(),
  slot: z.string().trim().regex(/^(homepage_featured|weekend_guide|events|category:[a-z0-9-]+)$/, "Choose a valid slot"),
  productId: zOpt(50),
  title: zOpt(200),
  imageUrl: zUrlOpt,
  linkUrl: zUrlOpt,
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isActive: zBool,
});

export async function savePlacement(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const businessId = getAll(fd, "business")[0] ?? null;
  if (!businessId && !d.title) return { error: "Choose a sponsoring business or give the placement a title." };
  const startsAt = fromDateInput(d.startsAt) ?? new Date();
  const endsAt = fromDateInput(d.endsAt);
  if (endsAt && endsAt <= startsAt) return { error: "End date must be after the start date." };
  const data = { slot: d.slot, productId: d.productId, title: d.title, imageUrl: d.imageUrl, linkUrl: d.linkUrl, startsAt, endsAt, isActive: d.isActive, businessId };
  const row = d.id ? await db.placement.update({ where: { id: d.id }, data }) : await db.placement.create({ data });
  await audit(user.id, d.id ? "placement.update" : "placement.create", "Placement", row.id, { slot: d.slot, businessId, isActive: d.isActive });
  revalidatePath("/admin/placements");
  revalidatePath("/", "layout");
  return { ok: true, message: d.id ? "Placement saved." : "Placement created." };
}

export async function deletePlacement(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const row = await db.placement.delete({ where: { id: String(fd.get("id")) } });
  await audit(user.id, "placement.delete", "Placement", row.id, { slot: row.slot, businessId: row.businessId });
  revalidatePath("/admin/placements");
  revalidatePath("/", "layout");
  return { ok: true, message: "Placement deleted." };
}

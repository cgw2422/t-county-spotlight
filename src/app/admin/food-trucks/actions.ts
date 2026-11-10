"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";

/** Quick "Mark as food truck" / "Not a food truck" for an existing business (staff, like the business editor). */
export async function setFoodTruckFlag(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id") ?? "");
  const on = String(fd.get("on") ?? "") === "1";
  const b = await db.business.findFirst({ where: { id, deletedAt: null }, select: { id: true, name: true, slug: true, isFoodTruck: true } });
  if (!b) return { error: "Business not found." };
  if (b.isFoodTruck === on) return { message: on ? `${b.name} is already a food truck.` : `${b.name} isn't marked as a food truck.` };
  await db.business.update({ where: { id: b.id }, data: { isFoodTruck: on } });
  await audit(user.id, on ? "business.food_truck_on" : "business.food_truck_off", "Business", b.id, { name: b.name });
  revalidatePath("/admin/food-trucks/");
  revalidatePath("/food-trucks/");
  revalidatePath(`/business/${b.slug}/`);
  return { ok: true, message: on ? `${b.name} is now listed as a food truck.` : `${b.name} is no longer listed as a food truck.` };
}

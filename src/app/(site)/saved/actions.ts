"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isSavedKind } from "@/lib/saved-shared";

/** Removes one of the signed-in member's saved items (by type + target). */
export async function removeSavedItemAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/?next=%2Fsaved%2F");
  const type = fd.get("type");
  const targetId = String(fd.get("targetId") ?? "").slice(0, 40);
  if (!isSavedKind(type) || !targetId) return;
  await db.savedItem.deleteMany({ where: { userId: user.id, type, targetId } });
  revalidatePath("/saved/");
  revalidatePath("/account/");
}

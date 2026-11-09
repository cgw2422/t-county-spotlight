"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionState } from "@/components/ui/form-message";
import { discardHeroDraft, heroAppearanceSchema, publishHeroAppearance, restoreDefaultHero, saveHeroDraft } from "@/lib/hero-appearance";
import { parseForm } from "../../_lib/form";

function revalidate(publicToo: boolean) {
  revalidatePath("/admin/homepage/appearance");
  if (publicToo) revalidatePath("/");
}

/** Save draft (intent=draft) or publish (intent=publish) the submitted appearance. */
export async function saveHeroAppearanceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const p = parseForm(heroAppearanceSchema, fd);
  if (p.error) return p.error;
  if (!p.data.imageUrl && p.data.mobileImageUrl) return { error: "Add a desktop image first — the mobile image is optional and only replaces it on phones and tablets." };
  const intent = fd.get("intent") === "publish" ? "publish" : "draft";
  const details = { imageUrl: p.data.imageUrl, mobileImageUrl: p.data.mobileImageUrl, overlay: p.data.overlay, desktopFocus: [p.data.desktopFocusX, p.data.desktopFocusY], mobileFocus: [p.data.mobileFocusX, p.data.mobileFocusY] };
  if (intent === "publish") {
    await publishHeroAppearance(p.data, user.id);
    await audit(user.id, "homepage.hero.publish", "Setting", "heroAppearance", details);
    revalidate(true);
    return { ok: true, message: p.data.imageUrl ? "Published — the homepage hero is updated." : "Published — the homepage shows the default gradient." };
  }
  await saveHeroDraft(p.data, user.id);
  await audit(user.id, "homepage.hero.save_draft", "Setting", "heroAppearance", details);
  revalidate(false);
  return { ok: true, message: "Draft saved. The homepage won't change until you publish." };
}

export async function discardHeroDraftAction(): Promise<ActionState> {
  const user = await requireAdmin();
  await discardHeroDraft(user.id);
  await audit(user.id, "homepage.hero.discard_draft", "Setting", "heroAppearance");
  revalidate(false);
  return { ok: true, message: "Draft discarded — back to the published appearance." };
}

export async function restoreDefaultHeroAction(): Promise<ActionState> {
  const user = await requireAdmin();
  await restoreDefaultHero(user.id);
  await audit(user.id, "homepage.hero.restore_default", "Setting", "heroAppearance");
  revalidate(true);
  return { ok: true, message: "Default gradient restored and published." };
}

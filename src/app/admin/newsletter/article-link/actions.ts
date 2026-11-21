"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { bringInPostNow, holdArticleUrl, parseSlugInput } from "@/lib/beehiiv/article-link";

const back = (slug: string, q: Record<string, string>) => `/admin/newsletter/article-link/?${new URLSearchParams({ slug, ...q }).toString()}`;

/** Hold the URL for a beehiiv post (import now if scheduled/published, else a hidden placeholder). */
export async function holdArticleUrlAction(fd: FormData) {
  const user = await requireAdmin();
  const postId = String(fd.get("postId") ?? "").slice(0, 120);
  const slug = parseSlugInput(String(fd.get("slug") ?? "")) ?? "";
  const r = await holdArticleUrl(postId, user.id);
  revalidatePath("/admin/newsletter/beehiiv/");
  redirect(back(slug, r.ok ? { done: "held" } : { error: r.message }));
}

/** Import or refresh the linked article from a scheduled or published post now, without waiting for the sync. */
export async function bringInNowAction(fd: FormData) {
  const user = await requireAdmin();
  const postId = String(fd.get("postId") ?? "").slice(0, 120);
  const slug = parseSlugInput(String(fd.get("slug") ?? "")) ?? "";
  const r = await bringInPostNow(postId, user.id);
  revalidatePath("/admin/newsletter/beehiiv/");
  redirect(back(slug, r.ok ? { done: "imported" } : { error: r.message }));
}

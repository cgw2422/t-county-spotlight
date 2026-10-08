"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { saveSettings } from "@/lib/settings";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, parseForm, zBool, zInt, zOpt, zUrlOpt } from "../_lib/form";

export async function saveSection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), title: z.string().trim().max(200).default(""), subtitle: zOpt(400), limit: zInt(6, 1, 48), isEnabled: zBool }), fd);
  if (p.error) return p.error;
  const featuredIds = fd.get("featured__present") ? getAll(fd, "featured").slice(0, 48) : undefined;
  const s = await db.homepageSection.update({ where: { id: p.data.id }, data: { title: p.data.title, subtitle: p.data.subtitle, limit: p.data.limit, isEnabled: p.data.isEnabled, ...(featuredIds ? { featuredIds } : {}) } });
  await audit(user.id, "homepage.update", "HomepageSection", s.id, { key: s.key, title: s.title, isEnabled: s.isEnabled, featured: s.featuredIds.length });
  revalidatePath("/admin/homepage");
  revalidatePath("/");
  return { ok: true, message: `“${s.title || s.key}” saved.` };
}

export async function toggleSection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id"));
  const cur = await db.homepageSection.findUnique({ where: { id } });
  if (!cur) return { error: "Section not found." };
  const s = await db.homepageSection.update({ where: { id }, data: { isEnabled: !cur.isEnabled } });
  await audit(user.id, "homepage.update", "HomepageSection", s.id, { key: s.key, title: s.title, isEnabled: s.isEnabled });
  revalidatePath("/admin/homepage");
  revalidatePath("/");
  return { ok: true, message: s.isEnabled ? `“${s.title}” is now shown.` : `“${s.title}” is now hidden.` };
}

export async function moveSection(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(fd.get("id"));
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const all = await db.homepageSection.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
  const i = all.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return null;
  [all[i], all[j]] = [all[j], all[i]];
  await db.$transaction(all.map((s, k) => db.homepageSection.update({ where: { id: s.id }, data: { sortOrder: k } })));
  await audit(user.id, "homepage.reorder", "HomepageSection", id, { order: all.map((s) => s.id) });
  revalidatePath("/admin/homepage");
  revalidatePath("/");
  return null;
}

export async function saveHeroBanner(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({
    heroHeadline: z.string().trim().min(1, "Hero headline is required").max(200),
    heroSubheadline: z.string().trim().max(400).default(""),
    heroImageUrl: zUrlOpt,
    bannerEnabled: zBool,
    bannerText: z.string().trim().max(300).default(""),
    bannerLink: z.string().trim().max(500).default("").refine((v) => !v || v.startsWith("/") || /^https?:\/\//.test(v), "Banner link must be a URL or /path"),
  }), fd);
  if (p.error) return p.error;
  if (p.data.bannerEnabled && !p.data.bannerText) return { error: "Add banner text before turning the banner on." };
  await saveSettings(p.data);
  await audit(user.id, "settings.save", "Setting", "homepage", { keys: Object.keys(p.data), bannerEnabled: p.data.bannerEnabled });
  revalidatePath("/", "layout");
  return { ok: true, message: "Hero & banner saved." };
}

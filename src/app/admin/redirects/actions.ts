"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { normalizePath } from "@/lib/links";
import type { ActionState } from "@/components/ui/form-message";
import { isUniqueError, parseForm } from "../_lib/form";

const schema = z.object({
  id: z.string().optional(),
  fromPath: z.string().trim().min(1, "From path is required").max(500).refine((v) => v.startsWith("/"), "From path must start with /"),
  toPath: z.string().trim().min(1, "Destination is required").max(1000).refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), "Destination must be a /path or full URL"),
  statusCode: z.coerce.number().refine((n) => n === 301 || n === 302, "Choose 301 or 302"),
});

export async function saveRedirect(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const fromPath = normalizePath(p.data.fromPath);
  if (fromPath.startsWith("/admin/") || fromPath.startsWith("/api/")) return { error: "Admin and API paths can't be redirected." };
  if (p.data.toPath.startsWith("/") && normalizePath(p.data.toPath) === fromPath) return { error: "A redirect can't point to itself." };
  try {
    const row = p.data.id
      ? await db.redirect.update({ where: { id: p.data.id }, data: { fromPath, toPath: p.data.toPath, statusCode: p.data.statusCode } })
      : await db.redirect.create({ data: { fromPath, toPath: p.data.toPath, statusCode: p.data.statusCode, source: "manual" } });
    await audit(user.id, p.data.id ? "redirect.update" : "redirect.create", "Redirect", row.id, { fromPath, toPath: row.toPath, statusCode: row.statusCode });
  } catch (e) {
    if (isUniqueError(e)) return { error: `A redirect from ${fromPath} already exists.` };
    throw e;
  }
  revalidatePath("/admin/redirects");
  return { ok: true, message: p.data.id ? "Redirect saved." : `Redirect added for ${fromPath}.` };
}

export async function deleteRedirect(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const row = await db.redirect.delete({ where: { id: String(fd.get("id")) } });
  await audit(user.id, "redirect.delete", "Redirect", row.id, { fromPath: row.fromPath, toPath: row.toPath });
  revalidatePath("/admin/redirects");
  return { ok: true, message: "Redirect deleted." };
}

import "server-only";
import { permanentRedirect, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { normalizePath } from "@/lib/links";
import type { SavedType } from "@/generated/prisma/client";

/** Path variants to match stored legacy paths (WordPress paths may be stored as-is or normalized). */
export function pathCandidates(raw: string) {
  const norm = normalizePath(raw);
  let withSlash = raw.split("?")[0].split("#")[0];
  if (!withSlash.startsWith("/")) withSlash = "/" + withSlash;
  const out = new Set([norm, withSlash, withSlash.endsWith("/") ? withSlash : withSlash + "/", withSlash.replace(/\/$/, "") || "/"]);
  try { out.add(encodeURI(norm)); } catch {}
  return [...out];
}

/**
 * Looks up the Redirect table and redirects (301/308 → permanentRedirect, else 307) when a
 * match exists. Increments the hit counter. Returns normally when there is no redirect.
 */
export async function followRedirectIfAny(rawPath: string) {
  const candidates = pathCandidates(rawPath);
  const r = await db.redirect.findFirst({ where: { fromPath: { in: candidates } } });
  if (!r) return;
  const to = r.toPath.trim();
  if (!to || candidates.includes(to) || (to.startsWith("/") && normalizePath(to) === normalizePath(rawPath))) return;
  await db.redirect.update({ where: { id: r.id }, data: { hits: { increment: 1 } } }).catch(() => {});
  if (r.statusCode === 302 || r.statusCode === 307) redirect(to);
  permanentRedirect(to);
}

/** Whether the signed-in user has saved a given item (false for visitors). */
export async function isSaved(type: SavedType, targetId: string) {
  const user = await getCurrentUser();
  if (!user) return false;
  const row = await db.savedItem.findUnique({ where: { userId_type_targetId: { userId: user.id, type, targetId } } });
  return !!row;
}

export async function isFollowing(businessId: string) {
  const user = await getCurrentUser();
  if (!user) return false;
  const row = await db.businessFollow.findUnique({ where: { userId_businessId: { userId: user.id, businessId } } });
  return !!row;
}

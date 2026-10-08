import "server-only";
import { z } from "zod";
import type { ActionState } from "@/components/ui/form-message";

/** Converts FormData to a plain object (first value per key; empty strings kept). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string" && !(k in out)) out[k] = v;
  }
  return out;
}

export const zBool = z.preprocess((v) => v === "on" || v === "true" || v === "1" || v === true, z.boolean());

/** Optional trimmed string → null when empty. */
export const zOpt = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : null));

export const zReq = (label: string, max = 300) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

/** URL or site-relative path (e.g. /media/…), optional. */
export const zUrlOpt = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || v.startsWith("/") || /^https?:\/\//i.test(v), "Must be a full URL (https://…) or a path starting with /");

export const zEmailOpt = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address");

export const zInt = (def: number, min = 0, max = 1_000_000) =>
  z.preprocess((v) => (v === "" || v == null ? def : Number(v)), z.number().int().min(min).max(max));

export const zSlugOpt = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => !v || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v), "Slug may only contain lowercase letters, numbers and dashes");

type ParseResult<T> = { data: T; error?: undefined } | { data?: undefined; error: NonNullable<ActionState> };

export function parseForm<S extends z.ZodType>(schema: S, fd: FormData | Record<string, unknown>): ParseResult<z.output<S>> {
  const obj = fd instanceof FormData ? formObject(fd) : fd;
  const r = schema.safeParse(obj);
  if (r.success) return { data: r.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = i.path.join(".") || "_";
    if (!fieldErrors[k]) fieldErrors[k] = i.message;
  }
  const first = r.error.issues[0];
  return { error: { error: first?.message || "Please check the form.", fieldErrors } };
}

/** Generates a unique slug using `exists` to test candidates. */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const root = base.slice(0, 70).replace(/-+$/, "") || "item";
  let slug = root;
  for (let i = 2; await exists(slug); i++) slug = `${root}-${i}`;
  return slug;
}

export function getAll(fd: FormData, key: string) {
  return fd.getAll(key).map(String).map((s) => s.trim()).filter(Boolean);
}

export function jsonField<T>(fd: FormData, key: string, fallback: T): T {
  const raw = fd.get(key);
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isUniqueError(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

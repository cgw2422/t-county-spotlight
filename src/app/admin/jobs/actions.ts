"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fromDateInput, slugify } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, isUniqueError, parseForm, uniqueSlug, zBool, zEmailOpt, zOpt, zReq, zSlugOpt, zUrlOpt } from "../_lib/form";

const STATUSES = ["DRAFT", "PENDING", "PUBLISHED", "SUSPENDED", "ARCHIVED"] as const;
const schema = z.object({
  id: z.string().optional(),
  title: zReq("Job title", 200),
  slug: zSlugOpt,
  employerName: zOpt(200),
  description: z.string().max(100_000).optional().transform((v) => v || null),
  employmentType: zOpt(60),
  location: zOpt(200),
  payRange: zOpt(100),
  applyUrl: zUrlOpt,
  applyEmail: zEmailOpt,
  status: z.enum(STATUSES).default("PUBLISHED"),
  isSponsored: zBool,
  expiresAt: z.string().optional(),
});

export async function saveJob(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(schema, fd);
  if (p.error) return p.error;
  const d = p.data;
  const businessId = getAll(fd, "business")[0] ?? null;
  if (!businessId && !d.employerName) return { error: "Choose a business or enter an employer name." };
  if (!d.applyUrl && !d.applyEmail) return { error: "Add an application link or email." };
  const existing = d.id ? await db.job.findUnique({ where: { id: d.id } }) : null;
  let slug = d.slug;
  if (!slug) slug = await uniqueSlug(slugify(d.title), async (s) => !!(await db.job.findFirst({ where: { slug: s, NOT: { id: d.id ?? "" } }, select: { id: true } })));
  const data = { title: d.title, slug, employerName: d.employerName, description: d.description, employmentType: d.employmentType, location: d.location, payRange: d.payRange, applyUrl: d.applyUrl, applyEmail: d.applyEmail, status: d.status, isSponsored: d.isSponsored, expiresAt: fromDateInput(d.expiresAt), businessId };
  let id = d.id;
  try {
    if (existing) await db.job.update({ where: { id: existing.id }, data });
    else id = (await db.job.create({ data })).id;
  } catch (e) {
    if (isUniqueError(e)) return { error: "That slug is already in use." };
    throw e;
  }
  await audit(user.id, existing ? (existing.status !== d.status && d.status === "PUBLISHED" ? "job.approve" : "job.update") : "job.create", "Job", id, { title: d.title, status: d.status });
  revalidatePath("/admin/jobs");
  revalidatePath("/", "layout");
  if (!existing) redirect(`/admin/jobs/${id}/?created=1`);
  return { ok: true, message: "Job saved." };
}

export async function setJobStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(STATUSES) }), fd);
  if (p.error) return p.error;
  const j = await db.job.update({ where: { id: p.data.id }, data: { status: p.data.status } });
  await audit(user.id, p.data.status === "PUBLISHED" ? "job.approve" : `job.${p.data.status.toLowerCase()}`, "Job", j.id, { title: j.title });
  revalidatePath("/admin/jobs");
  revalidatePath("/", "layout");
  return { ok: true, message: p.data.status === "PUBLISHED" ? "Job approved." : "Status updated." };
}

export async function trashJob(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const j = await db.job.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: new Date() } });
  await audit(user.id, "job.trash", "Job", j.id, { title: j.title });
  revalidatePath("/admin/jobs");
  revalidatePath("/", "layout");
  redirect("/admin/jobs/");
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { absoluteUrl, slugify, TUSCARAWAS_CITIES } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, parseForm, uniqueSlug, zBool, zOpt } from "../_lib/form";

export async function approveApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"), linkOwner: zBool, notify: zBool, note: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const app = await db.businessApplication.findUnique({ where: { id: p.data.id } });
  if (!app) return { error: "Application not found." };
  if (app.status !== "PENDING") return { error: "This application was already reviewed." };
  const categoryIds = getAll(fd, "categories");

  const slug = await uniqueSlug(slugify(app.businessName), async (s) => !!(await db.business.findUnique({ where: { slug: s }, select: { id: true } })));
  const website = app.website ? (/^https?:\/\//i.test(app.website) ? app.website : `https://${app.website}`) : null;
  const city = app.city ? TUSCARAWAS_CITIES.find((c) => c.toLowerCase() === app.city!.trim().toLowerCase()) ?? app.city.trim() : null;
  const business = await db.business.create({
    data: {
      name: app.businessName, slug, phone: app.phone, email: app.email.toLowerCase(), website, address: app.address, city,
      description: app.message ? `<p>${app.message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p>` : null,
      status: p.data.status, publishedAt: p.data.status === "PUBLISHED" ? new Date() : null,
      categories: { connect: categoryIds.map((id) => ({ id })) },
    },
  });

  let createdUser = false;
  if (p.data.linkOwner) {
    let owner = app.userId ? await db.user.findUnique({ where: { id: app.userId } }) : null;
    owner ??= await db.user.findUnique({ where: { email: app.email.toLowerCase() } });
    if (!owner) {
      owner = await db.user.create({ data: { email: app.email.toLowerCase(), name: app.contactName, role: "BUSINESS_OWNER" } });
      createdUser = true;
    } else if (owner.role === "MEMBER") {
      owner = await db.user.update({ where: { id: owner.id }, data: { role: "BUSINESS_OWNER" } });
    }
    await db.businessOwner.upsert({ where: { userId_businessId: { userId: owner.id, businessId: business.id } }, create: { userId: owner.id, businessId: business.id }, update: {} });
  }

  await db.businessApplication.update({ where: { id: app.id }, data: { status: "APPROVED", businessId: business.id, reviewedById: user.id, reviewedAt: new Date(), reviewNote: p.data.note } });
  await audit(user.id, "application.approve", "BusinessApplication", app.id, { name: app.businessName, businessId: business.id, createdUser });

  if (p.data.notify) {
    await sendEmail(
      app.email,
      `Your listing for ${app.businessName} was approved`,
      `Good news! ${app.businessName} has been approved for TCountySpotlight.\n\n` +
        (p.data.status === "PUBLISHED" ? `Your listing is live: ${absoluteUrl(`/business/${slug}/`)}\n\n` : "Our team will finish setting up your listing and publish it shortly.\n\n") +
        (p.data.linkOwner ? (createdUser ? `An account was created for ${app.email}. Set your password here: ${absoluteUrl("/forgot-password/")}\n` : `Sign in to manage your listing: ${absoluteUrl("/dashboard/")}\n`) : "") +
        (p.data.note ? `\nNote from our team: ${p.data.note}\n` : ""),
    );
  }
  revalidatePath("/admin/applications");
  revalidatePath("/admin");
  redirect(`/admin/businesses/${business.id}/?created=1${createdUser ? "&owner=new" : ""}`);
}

export async function rejectApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), note: z.string().trim().min(3, "Add a short reason for the applicant").max(1000), notify: zBool.default(true) }), fd);
  if (p.error) return p.error;
  const app = await db.businessApplication.findUnique({ where: { id: p.data.id } });
  if (!app) return { error: "Application not found." };
  await db.businessApplication.update({ where: { id: app.id }, data: { status: "REJECTED", reviewNote: p.data.note, reviewedById: user.id, reviewedAt: new Date() } });
  await audit(user.id, "application.reject", "BusinessApplication", app.id, { name: app.businessName, note: p.data.note });
  if (fd.get("notify") !== "false") {
    await sendEmail(app.email, `About your TCountySpotlight listing request`, `Thank you for applying to list ${app.businessName} on TCountySpotlight.\n\nUnfortunately we can't approve this request right now.\n\nReason: ${p.data.note}\n\nReply to this email if you have questions.`);
  }
  revalidatePath("/admin/applications");
  return { ok: true, message: "Application rejected and applicant notified." };
}

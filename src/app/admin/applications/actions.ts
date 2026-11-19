"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { absoluteUrl, slugify, TUSCARAWAS_CITIES } from "@/lib/utils";
import { applicationClaim } from "@/lib/applications";
import { isBusinessClaimed } from "@/lib/application-flow";
import { lockBusinessRow } from "@/lib/listing-limits";
import { loadListing, sendSetupInvitation } from "@/lib/listing-access";
import type { Prisma, User } from "@/generated/prisma/client";
import type { ActionState } from "@/components/ui/form-message";
import { getAll, parseForm, uniqueSlug, zBool, zOpt } from "../_lib/form";

type Tx = Prisma.TransactionClient;
class Refused extends Error {}

const STATUS_WORD: Record<string, string> = { SUSPENDED: "blocked", DELETED: "deleted" };

/**
 * The account an approval grants ownership to. Applications submitted from an account (BusinessApplication.userId)
 * only ever go to that account — never to another account found by email. Older applications without a linked
 * account fall back to the account with the application email, or a new password-less Business Owner account
 * (which then gets a setup invitation). Blocked or deleted accounts are refused.
 */
async function applicantAccount(tx: Tx, app: { userId: string | null; email: string; contactName: string | null }) {
  let owner: User | null;
  if (app.userId) {
    // Row lock: a concurrent block/delete of this account can't slip between the check and the grant.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${app.userId} FOR UPDATE`;
    owner = await tx.user.findUnique({ where: { id: app.userId } });
    if (!owner) throw new Refused("The account linked to this application no longer exists. Reject the application instead.");
  } else {
    owner = await tx.user.findUnique({ where: { email: app.email.toLowerCase() } });
  }
  if (owner && owner.status !== "ACTIVE") {
    throw new Refused(`The applicant's account (${owner.status === "DELETED" ? "deleted account" : owner.email}) is ${STATUS_WORD[owner.status] ?? "not active"}, so it can't be given ownership. ${owner.status === "SUSPENDED" ? "Unblock the account first (Admin → Users) or reject the application." : "Reject the application instead."}`);
  }
  let createdUser = false;
  if (!owner) {
    owner = await tx.user.create({ data: { email: app.email.toLowerCase(), name: app.contactName, role: "BUSINESS_OWNER" } });
    createdUser = true;
  } else if (owner.role === "MEMBER") {
    owner = await tx.user.update({ where: { id: owner.id }, data: { role: "BUSINESS_OWNER" } });
  }
  return { owner, createdUser };
}

/** Marks a still-PENDING application approved (conditional, so a double submit / second reviewer can't approve twice). */
async function markApproved(tx: Tx, appId: string, data: { businessId: string; reviewedById: string; reviewNote?: string | null }) {
  const r = await tx.businessApplication.updateMany({ where: { id: appId, status: "PENDING" }, data: { status: "APPROVED", ...data, reviewedAt: new Date() } });
  if (r.count !== 1) throw new Refused("This application was already reviewed.");
}

const CLAIM_ALREADY_OWNED = "This listing now has an owner, so the claim can't be approved. Existing owners and managers keep their access. If this person should have access, add them from Listing Access on the business page, or reject the application.";

export async function approveApplication(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const p = parseForm(z.object({ id: z.string().min(1), status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"), linkOwner: zBool, notify: zBool, note: zOpt(1000) }), fd);
  if (p.error) return p.error;
  const app = await db.businessApplication.findUnique({ where: { id: p.data.id } });
  if (!app) return { error: "Application not found." };
  if (app.status !== "PENDING") return { error: "This application was already reviewed." };
  const actor = { id: user.id, name: user.name };

  // Claim of an EXISTING listing: never create a business and never overwrite the listing's content —
  // only link the applicant as an OWNER (slug, photos, recommendations, subscriptions and history stay as they are).
  // Only unclaimed listings: re-checked under a row lock on the business, so two claims can't both be approved.
  const claim = applicationClaim(app);
  if (claim) {
    let r: { business: { id: string; name: string; slug: string }; owner: User; createdUser: boolean };
    try {
      r = await db.$transaction(async (tx) => {
        await lockBusinessRow(tx, claim.businessId);
        const business = await tx.business.findUnique({ where: { id: claim.businessId }, select: { id: true, name: true, slug: true, deletedAt: true } });
        if (!business || business.deletedAt) throw new Refused("The listing this application claims has been deleted, so it can't be approved as a claim. Reject the application instead.");
        if (await isBusinessClaimed(business.id, tx)) throw new Refused(CLAIM_ALREADY_OWNED);
        const { owner, createdUser } = await applicantAccount(tx, app);
        await tx.businessOwner.upsert({
          where: { userId_businessId: { userId: owner.id, businessId: business.id } },
          create: { userId: owner.id, businessId: business.id, role: "OWNER" },
          update: { role: "OWNER" },
        });
        await markApproved(tx, app.id, { businessId: business.id, reviewedById: user.id, reviewNote: p.data.note });
        return { business, owner, createdUser };
      });
    } catch (e) {
      if (e instanceof Refused) return { error: e.message };
      throw e;
    }
    const { business, owner, createdUser } = r;
    await audit(user.id, "application.approve_claim", "BusinessApplication", app.id, { name: app.businessName, businessId: business.id, ownerEmail: owner.email, createdUser, linkedAccount: !!app.userId });
    const listing = await loadListing({ kind: "business", id: business.id });
    // No password yet (older applications): the usual Listing Access setup invitation.
    const invite = listing ? await sendSetupInvitation(listing, owner, "OWNER", actor) : null;
    if (p.data.notify) {
      await sendEmail(
        app.email,
        `Your claim for ${business.name} was approved`,
        `Good news! Your claim for ${business.name} on T County Connect has been approved, and you're now an owner of the listing.\n\n` +
          (invite && !invite.skipped ? `We sent you a separate email with a link to set your password and open your dashboard.\n` : `Sign in with your existing account to manage your listing (your password hasn't changed): ${absoluteUrl(`/dashboard/${business.id}/`)}\n`) +
          (p.data.note ? `\nNote from our team: ${p.data.note}\n` : ""),
      );
    }
    revalidatePath("/admin/applications");
    revalidatePath("/admin");
    redirect(`/admin/businesses/${business.id}/?claimed=1${createdUser ? "&owner=new" : ""}`);
  }

  // New listing: refuse up front (before creating anything) when the linked account can't be given ownership.
  if (p.data.linkOwner && app.userId) {
    const linked = await db.user.findUnique({ where: { id: app.userId }, select: { status: true } });
    if (!linked) return { error: "The account linked to this application no longer exists. Untick “Link as owner” or reject the application." };
    if (linked.status !== "ACTIVE") return { error: `The applicant's account is ${STATUS_WORD[linked.status] ?? "not active"}, so it can't be given ownership. Unblock it first, untick “Link as owner”, or reject the application.` };
  }

  const categoryIds = getAll(fd, "categories");
  const slug = await uniqueSlug(slugify(app.businessName), async (s) => !!(await db.business.findUnique({ where: { slug: s }, select: { id: true } })));
  const website = app.website ? (/^https?:\/\//i.test(app.website) ? app.website : `https://${app.website}`) : null;
  const city = app.city ? TUSCARAWAS_CITIES.find((c) => c.toLowerCase() === app.city!.trim().toLowerCase()) ?? app.city.trim() : null;
  let r: { business: { id: string }; owner: User | null; createdUser: boolean };
  try {
    r = await db.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: app.businessName, slug, phone: app.phone, email: app.email.toLowerCase(), website, address: app.address, city,
          description: app.message ? `<p>${app.message.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p>` : null,
          status: p.data.status, publishedAt: p.data.status === "PUBLISHED" ? new Date() : null,
          categories: { connect: categoryIds.map((id) => ({ id })) },
        },
      });
      let owner: User | null = null;
      let createdUser = false;
      if (p.data.linkOwner) {
        const a = await applicantAccount(tx, app);
        owner = a.owner;
        createdUser = a.createdUser;
        await tx.businessOwner.upsert({ where: { userId_businessId: { userId: owner.id, businessId: business.id } }, create: { userId: owner.id, businessId: business.id, role: "OWNER" }, update: { role: "OWNER" } });
      }
      await markApproved(tx, app.id, { businessId: business.id, reviewedById: user.id, reviewNote: p.data.note });
      return { business, owner, createdUser };
    });
  } catch (e) {
    if (e instanceof Refused) return { error: e.message };
    throw e;
  }
  const { business, owner, createdUser } = r;
  await audit(user.id, "application.approve", "BusinessApplication", app.id, { name: app.businessName, businessId: business.id, createdUser, ownerEmail: owner?.email ?? null, linkedAccount: !!app.userId });
  const listing = owner ? await loadListing({ kind: "business", id: business.id }) : null;
  const invite = listing && owner ? await sendSetupInvitation(listing, owner, "OWNER", actor) : null;

  if (p.data.notify) {
    await sendEmail(
      app.email,
      `Your listing for ${app.businessName} was approved`,
      `Good news! ${app.businessName} has been approved for T County Connect.\n\n` +
        (p.data.status === "PUBLISHED" ? `Your listing is live: ${absoluteUrl(`/business/${slug}/`)}\n\n` : "Our team will finish setting up your listing and publish it shortly.\n\n") +
        (owner ? (invite && !invite.skipped ? `We sent you a separate email with a link to set your password and open your dashboard.\n` : `Sign in with your existing account to manage your listing (your password hasn't changed): ${absoluteUrl(`/dashboard/${business.id}/`)}\n`) : "") +
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
  if (app.status !== "PENDING") return { error: "This application was already reviewed." };
  await db.businessApplication.update({ where: { id: app.id }, data: { status: "REJECTED", reviewNote: p.data.note, reviewedById: user.id, reviewedAt: new Date() } });
  await audit(user.id, "application.reject", "BusinessApplication", app.id, { name: app.businessName, note: p.data.note });
  if (fd.get("notify") !== "false") {
    await sendEmail(app.email, `About your T County Connect listing request`, `Thank you for applying to list ${app.businessName} on T County Connect.\n\nUnfortunately we can't approve this request right now.\n\nReason: ${p.data.note}\n\nReply to this email if you have questions.`);
  }
  revalidatePath("/admin/applications");
  return { ok: true, message: "Application rejected and applicant notified." };
}

"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl, slugify } from "@/lib/utils";
import { parseOrgProfile, parseStaffOrgFields } from "@/lib/gives/profile";
import { orgSlug, recalcNeed } from "@/lib/gives/queries";
import { recomputeOwnership } from "@/lib/gives/ownership";
import { isDonationVerified } from "@/lib/gives/admin";
import { ORG_KINDS, ORG_ROLES, ORG_ROLE_LABEL, orgHref, type OrgKindValue, type OrgRoleValue } from "@/lib/gives/constants";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/components/ui/form-message";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh(orgId?: string) {
  revalidatePath("/admin/organizations/", "layout");
  if (orgId) revalidatePath(`/admin/organizations/${orgId}/`);
  revalidatePath("/gives/", "layout");
  revalidatePath("/churches/", "layout");
}

async function ownerEmails(orgId: string) {
  const m = await db.organizationMember.findMany({ where: { organizationId: orgId, role: { in: ["OWNER", "ADMIN"] } }, select: { user: { select: { email: true } } } });
  return [...new Set(m.map((x) => x.user.email))];
}

async function recordDonationVerification(userId: string, org: { id: string; name: string }, fd: FormData, donationUrl: string | null | undefined, before?: string | null) {
  const want = fd.get("donationVerified") === "on";
  if (!donationUrl) return;
  const was = before === donationUrl && (await isDonationVerified(org.id, donationUrl));
  if (want && !was) await audit(userId, "organization.donation_verified", "Organization", org.id, { name: org.name, url: donationUrl });
  if (!want && was) await audit(userId, "organization.donation_unverified", "Organization", org.id, { name: org.name, url: donationUrl });
}

export async function adminSaveOrg(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") } });
  if (!org) return { error: "Organization not found." };
  const { data, fieldErrors } = parseOrgProfile(fd, org, { allowKind: true });
  const slugRaw = str(fd, "slug");
  if (slugRaw) {
    const slug = slugify(slugRaw);
    if (slug !== org.slug) {
      if (await db.organization.findFirst({ where: { slug, NOT: { id: org.id } }, select: { id: true } })) fieldErrors.slug = `The slug “${slug}” is already in use.`;
      else data.slug = slug;
    }
  }
  parseStaffOrgFields(fd, data, fieldErrors);
  if (Object.keys(fieldErrors).length) return { error: Object.values(fieldErrors)[0], fieldErrors };
  await db.organization.update({ where: { id: org.id }, data });
  await audit(user.id, "organization.admin_update", "Organization", org.id, { fields: Object.keys(data) });
  await recordDonationVerification(user.id, org, fd, data.donationUrl as string | null, org.donationUrl);
  refresh(org.id);
  return { ok: true, message: "Organization saved." };
}

/** Admin "Add organization": an admin-vetted listing that exists without any user account. */
export async function adminCreateOrg(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const kindRaw = str(fd, "kind");
  const kind = (ORG_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as OrgKindValue) : "NONPROFIT";
  const { data, fieldErrors } = parseOrgProfile(fd, { logoUrl: null, coverUrl: null, kind }, { allowKind: true });
  parseStaffOrgFields(fd, data, fieldErrors);
  if (Object.keys(fieldErrors).length) return { error: Object.values(fieldErrors)[0], fieldErrors };
  const publish = str(fd, "intent") === "publish";
  const name = String(data.name);
  const created = await db.organization.create({
    data: {
      ...(data as Prisma.OrganizationCreateInput),
      name,
      kind,
      slug: await orgSlug(name),
      status: "APPROVED",
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
      ownershipStatus: "UNCLAIMED",
      source: "admin",
      createdById: user.id,
    },
  });
  await audit(user.id, "organization.admin_create", "Organization", created.id, { name, kind, published: publish });
  if (publish) await audit(user.id, "organization.publish", "Organization", created.id, { name });
  await recordDonationVerification(user.id, created, fd, created.donationUrl);
  refresh(created.id);
  redirect(`/admin/organizations/${created.id}/?created=${publish ? "published" : "draft"}`);
}

/** Publication is independent of moderation status and ownership. */
export async function setOrgPublished(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") }, select: { id: true, name: true, isPublished: true, publishedAt: true, status: true } });
  if (!org) return { error: "Organization not found." };
  const publish = str(fd, "publish") === "1";
  if (publish === org.isPublished) return { ok: true, message: publish ? "Already published." : "Already a draft." };
  await db.organization.update({ where: { id: org.id }, data: { isPublished: publish, ...(publish ? { publishedAt: org.publishedAt ?? new Date() } : {}) } });
  await audit(user.id, publish ? "organization.publish" : "organization.unpublish", "Organization", org.id, { name: org.name, by: "staff" });
  refresh(org.id);
  return { ok: true, message: publish ? (org.status === "APPROVED" ? "Published — the listing is public." : "Published. It becomes public once approved.") : "Unpublished — the listing is hidden from the public." };
}

export async function markOrgChecked(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") }, select: { id: true, name: true } });
  if (!org) return { error: "Organization not found." };
  await db.organization.update({ where: { id: org.id }, data: { infoCheckedAt: new Date() } });
  await audit(user.id, "organization.info_checked", "Organization", org.id, { name: org.name });
  refresh(org.id);
  return { ok: true, message: "Marked as checked today." };
}

const STATUS_ACTIONS = ["APPROVED", "REJECTED", "SUSPENDED", "ARCHIVED", "PENDING"] as const;

export async function setOrgStatus(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const status = str(fd, "status") as (typeof STATUS_ACTIONS)[number];
  if (!STATUS_ACTIONS.includes(status)) return { error: "Unknown status." };
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") } });
  if (!org) return { error: "Organization not found." };
  const note = sanitizePlain(str(fd, "note"), 1000) || null;
  if (status === "REJECTED" && !note) return { error: "Please add a short note explaining why." };
  await db.organization.update({ where: { id: org.id }, data: { status, ...(status === "REJECTED" || status === "SUSPENDED" ? { reviewNote: note } : status === "APPROVED" ? { reviewNote: null } : {}) } });
  await audit(user.id, `organization.${status.toLowerCase()}`, "Organization", org.id, { name: org.name, from: org.status, note });

  if (status === "APPROVED" && org.status !== "APPROVED") {
    for (const to of await ownerEmails(org.id)) {
      await sendEmail(to, `${org.name} is approved on T-County Gives`, `Good news! ${org.name} has been approved and your page is now live:\n${absoluteUrl(orgHref(org))}\n\nManage your needs, volunteer opportunities and updates here:\n${absoluteUrl(`/organization/${org.id}/`)}\n\nT-County Gives is always free for nonprofits, churches and community groups.`);
    }
  }
  if (status === "REJECTED") {
    for (const to of await ownerEmails(org.id)) {
      await sendEmail(to, `About your T-County Gives registration for ${org.name}`, `Thank you for registering ${org.name}. Unfortunately we weren't able to approve it at this time.\n\nNote from our team: ${note}\n\nIf you have questions or more information, just reply to this email.`);
    }
  }
  refresh(org.id);
  return { ok: true, message: { APPROVED: "Approved — the page is live.", REJECTED: "Rejected. The owner was emailed.", SUSPENDED: "Suspended.", ARCHIVED: "Archived.", PENDING: "Moved back to pending review." }[status] };
}

export async function verifyOrg(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") } });
  if (!org) return { error: "Organization not found." };
  if (str(fd, "unverify") === "1") {
    await db.organization.update({ where: { id: org.id }, data: { verifiedAt: null, verifiedById: null, verificationNote: null } });
    await audit(user.id, "organization.unverify", "Organization", org.id, { name: org.name });
    refresh(org.id);
    return { ok: true, message: "Verification removed." };
  }
  const note = sanitizePlain(str(fd, "verificationNote"), 1000);
  if (!note) return { error: "Describe how you verified this organization (e.g. “IRS EO lookup confirmed EIN”)." };
  if (org.status !== "APPROVED") return { error: "Approve the organization before verifying it." };
  await db.organization.update({ where: { id: org.id }, data: { verifiedAt: new Date(), verifiedById: user.id, verificationNote: note } });
  await audit(user.id, "organization.verify", "Organization", org.id, { name: org.name, note });
  refresh(org.id);
  return { ok: true, message: "Organization verified." };
}

export async function toggleOrgFeatured(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") }, select: { id: true, isFeatured: true, name: true } });
  if (!org) return { error: "Organization not found." };
  await db.organization.update({ where: { id: org.id }, data: { isFeatured: !org.isFeatured } });
  await audit(user.id, org.isFeatured ? "organization.unfeature" : "organization.feature", "Organization", org.id, { name: org.name });
  refresh(org.id);
  return { ok: true, message: org.isFeatured ? "No longer featured." : "Featured." };
}

export async function trashOrg(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") } });
  if (!org) return { error: "Organization not found." };
  const restore = str(fd, "restore") === "1";
  await db.organization.update({ where: { id: org.id }, data: { deletedAt: restore ? null : new Date() } });
  await audit(user.id, restore ? "organization.restore" : "organization.delete", "Organization", org.id, { name: org.name });
  refresh(org.id);
  return { ok: true, message: restore ? "Organization restored." : "Organization deleted." };
}

/**
 * Assign an EXISTING user as an organization manager. Never creates accounts —
 * people without one create a free account (/register/) or submit a claim.
 */
export async function adminAssignManager(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const org = await db.organization.findUnique({ where: { id: str(fd, "orgId") }, select: { id: true, name: true } });
  if (!org) return { error: "Organization not found." };
  const userId = String(fd.getAll("user")[0] ?? "").slice(0, 40);
  if (!userId) return { error: "Search for and choose an existing account. If they don't have one, ask them to create a free account at /register/ or submit a claim from the listing page." };
  const role = str(fd, "role") as OrgRoleValue;
  if (!(ORG_ROLES as readonly string[]).includes(role)) return { error: "Choose a role." };
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, status: true } });
  if (!target) return { error: "That account no longer exists." };
  if (target.status !== "ACTIVE") return { error: "That account isn't active." };
  const existing = await db.organizationMember.findUnique({ where: { userId_organizationId: { userId: target.id, organizationId: org.id } } });
  await db.organizationMember.upsert({
    where: { userId_organizationId: { userId: target.id, organizationId: org.id } },
    create: { userId: target.id, organizationId: org.id, role },
    update: { role },
  });
  const ownership = await recomputeOwnership(org.id);
  await audit(user.id, existing ? "organization.member_role" : "organization.member_add", "Organization", org.id, { email: target.email, role, from: existing?.role ?? null, by: "staff", ownership });
  if (fd.get("notify") === "on" && !existing) {
    await sendEmail(target.email, `You can now manage ${org.name} on T-County Gives`, `Hi${target.name ? ` ${target.name}` : ""},\n\nThe TCountySpotlight team gave your account ${ORG_ROLE_LABEL[role].toLowerCase()} access to ${org.name} on T-County Gives.\n\nSign in to manage the listing, needs, volunteer opportunities and updates:\n${absoluteUrl(`/organization/${org.id}/`)}\n\nT-County Gives is always free for nonprofits, churches and community groups.`);
  }
  refresh(org.id);
  return { ok: true, message: existing ? `${target.email} is now ${role.toLowerCase()}.` : `${target.email} added as ${role.toLowerCase()}.` };
}

export async function adminRemoveOrgMember(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const orgId = str(fd, "orgId");
  const userId = str(fd, "userId");
  const link = await db.organizationMember.findUnique({ where: { userId_organizationId: { userId, organizationId: orgId } }, include: { user: { select: { email: true } } } });
  if (!link) return { error: "Member not found." };
  await db.organizationMember.delete({ where: { userId_organizationId: { userId, organizationId: orgId } } });
  const ownership = await recomputeOwnership(orgId);
  await audit(user.id, "organization.member_remove", "Organization", orgId, { email: link.user.email, by: "staff", ownership });
  refresh(orgId);
  return { ok: true, message: `Removed ${link.user.email}.${ownership === "UNCLAIMED" ? " The listing is now unclaimed." : ""}` };
}

// ───────── Moderation of needs and opportunities ─────────

export async function moderateNeed(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const need = await db.communityNeed.findUnique({ where: { id: str(fd, "needId") } });
  if (!need) return { error: "Need not found." };
  const op = str(fd, "op");
  if (op === "close") await db.communityNeed.update({ where: { id: need.id }, data: { status: "CLOSED" } });
  else if (op === "reopen") {
    await db.communityNeed.update({ where: { id: need.id }, data: { status: "OPEN", deletedAt: null } });
    await recalcNeed(need.id);
  } else if (op === "remove") await db.communityNeed.update({ where: { id: need.id }, data: { deletedAt: new Date(), status: "CLOSED" } });
  else return { error: "Unknown action." };
  await audit(user.id, `need.moderate_${op}`, "CommunityNeed", need.id, { title: need.title, organizationId: need.organizationId, reason: sanitizePlain(str(fd, "reason"), 500) || null });
  revalidatePath("/admin/needs/");
  revalidatePath("/gives/", "layout");
  return { ok: true, message: op === "remove" ? "Need removed." : op === "close" ? "Need closed." : "Need reopened." };
}

export async function moderateOpportunity(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const opp = await db.volunteerOpportunity.findUnique({ where: { id: str(fd, "oppId") } });
  if (!opp) return { error: "Opportunity not found." };
  const op = str(fd, "op");
  if (op === "close") await db.volunteerOpportunity.update({ where: { id: opp.id }, data: { status: "CLOSED" } });
  else if (op === "reopen") await db.volunteerOpportunity.update({ where: { id: opp.id }, data: { status: "PUBLISHED", deletedAt: null } });
  else if (op === "remove") await db.volunteerOpportunity.update({ where: { id: opp.id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
  else return { error: "Unknown action." };
  await audit(user.id, `volunteer.moderate_${op}`, "VolunteerOpportunity", opp.id, { title: opp.title, organizationId: opp.organizationId });
  revalidatePath("/admin/volunteer/");
  revalidatePath("/gives/", "layout");
  return { ok: true, message: op === "remove" ? "Opportunity removed." : op === "close" ? "Sign-ups closed." : "Opportunity reopened." };
}

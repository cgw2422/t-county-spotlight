"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl } from "@/lib/utils";
import { CLAIM_REVIEW_CHECKS, claimRiskReasons, orgHref } from "@/lib/gives/constants";
import { recomputeOwnership } from "@/lib/gives/ownership";
import type { ActionState } from "@/components/ui/form-message";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh(orgId: string) {
  revalidatePath("/admin/organizations/", "layout");
  revalidatePath(`/admin/organizations/${orgId}/`);
  revalidatePath("/gives/", "layout");
  revalidatePath("/churches/", "layout");
  revalidatePath("/organizations/", "layout");
}

/** Approve: claimant becomes OWNER of the existing listing (same row, slug, content). Never automatic. */
export async function approveClaim(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const claim = await db.organizationClaim.findUnique({
    where: { id: str(fd, "claimId") },
    include: { organization: { select: { id: true, name: true, slug: true, kind: true } }, user: { select: { id: true, email: true, name: true, status: true } } },
  });
  if (!claim) return { error: "Claim not found." };
  if (claim.status !== "PENDING") return { error: "This claim was already decided." };
  if (claim.user.status !== "ACTIVE") return { error: "The claimant's account isn't active." };
  const checks = fd.getAll("check").map(String).filter((c) => CLAIM_REVIEW_CHECKS[c]);
  if (!checks.length) return { error: "Tick which verification you performed before approving." };
  const note = sanitizePlain(str(fd, "note"), 1000);
  if (checks.includes("other") && !note) return { error: "Describe the “Other” verification in the note." };
  if (checks.includes("domain_email") && (!claim.emailVerifiedAt || !claim.emailDomainMatches)) {
    return { error: "“Organization-domain email confirmed” requires a confirmed email whose domain matches the organization's website. Choose the check you actually performed." };
  }
  const risk = claimRiskReasons(claim);
  const override = sanitizePlain(str(fd, "override"), 1000);
  if (risk.length && checks.every((c) => c === "domain_email")) return { error: "Email alone isn't sufficient here. Record another verification." };
  if (risk.length && override.length < 10) return { error: `Override note required: ${risk.join(", ")}. Explain why approval is still safe.` };

  const reviewNote = [`Verified: ${checks.map((c) => CLAIM_REVIEW_CHECKS[c]).join("; ")}.`, note && `Note: ${note}`, risk.length ? `Override (${risk.join(", ")}): ${override}` : ""].filter(Boolean).join(" ");
  const ok = await db.$transaction(async (tx) => {
    const n = await tx.organizationClaim.updateMany({ where: { id: claim.id, status: "PENDING" }, data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date(), reviewNote, verifyTokenHash: null, verifyExpiresAt: null } });
    if (!n.count) return false;
    await tx.organizationMember.upsert({
      where: { userId_organizationId: { userId: claim.userId, organizationId: claim.organizationId } },
      create: { userId: claim.userId, organizationId: claim.organizationId, role: "OWNER" },
      update: { role: "OWNER" },
    });
    await recomputeOwnership(claim.organizationId, tx);
    return true;
  });
  if (!ok) return { error: "This claim was already decided." };
  await audit(user.id, "organization_claim.approve", "OrganizationClaim", claim.id, { organizationId: claim.organizationId, name: claim.organization.name, member: claim.user.email, checks, override: risk.length ? override : null });
  await audit(user.id, "organization.member_add", "Organization", claim.organizationId, { email: claim.user.email, role: "OWNER", by: "claim", claimId: claim.id });
  await sendEmail(
    claim.user.email,
    `You can now manage ${claim.organization.name} on TCountySpotlight`,
    `Hi ${claim.applicantName},\n\nGood news — your request to manage ${claim.organization.name} was approved. Sign in to update the page, post needs and volunteer opportunities, and share news:\n${absoluteUrl("/organization/")}\n\nPublic page: ${absoluteUrl(orgHref(claim.organization))}\n\nT-County Gives is always free for nonprofits, churches and community groups.`,
  );
  refresh(claim.organizationId);
  const others = await db.organizationClaim.count({ where: { organizationId: claim.organizationId, status: "PENDING" } });
  return { ok: true, message: `Approved — ${claim.user.email} is now an owner.${others ? ` ${others} other pending claim${others === 1 ? "" : "s"} for this organization still need a decision.` : ""}` };
}

/** Reject never deletes or unpublishes the listing. */
export async function rejectClaim(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const claim = await db.organizationClaim.findUnique({ where: { id: str(fd, "claimId") }, include: { organization: { select: { id: true, name: true } }, user: { select: { email: true } } } });
  if (!claim) return { error: "Claim not found." };
  const reason = sanitizePlain(str(fd, "reason"), 1000);
  if (!reason) return { error: "Add a short reason (it's emailed to the person)." };
  const n = await db.organizationClaim.updateMany({ where: { id: claim.id, status: "PENDING" }, data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: reason, verifyTokenHash: null, verifyExpiresAt: null } });
  if (!n.count) return { error: "This claim was already decided." };
  const ownership = await recomputeOwnership(claim.organizationId);
  await audit(user.id, "organization_claim.reject", "OrganizationClaim", claim.id, { organizationId: claim.organizationId, name: claim.organization.name, reason, ownership });
  await sendEmail(
    claim.user.email,
    `About your request to manage ${claim.organization.name}`,
    `Hi ${claim.applicantName},\n\nThanks for your request to manage ${claim.organization.name} on TCountySpotlight. We weren't able to approve it.\n\nReason: ${reason}\n\nIf you have more information, reply to this email or send a new request from the listing page.`,
  );
  refresh(claim.organizationId);
  return { ok: true, message: "Claim rejected and the person was emailed." };
}

export async function saveClaimNote(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const claim = await db.organizationClaim.findUnique({ where: { id: str(fd, "claimId") }, select: { id: true, status: true, organizationId: true } });
  if (!claim) return { error: "Claim not found." };
  if (claim.status !== "PENDING") return { error: "Notes can be added to pending claims only." };
  const note = sanitizePlain(str(fd, "note"), 1000) || null;
  await db.organizationClaim.update({ where: { id: claim.id }, data: { reviewNote: note } });
  await audit(user.id, "organization_claim.note", "OrganizationClaim", claim.id, { organizationId: claim.organizationId, note });
  revalidatePath("/admin/organizations/claims/");
  return { ok: true, message: "Note saved." };
}

"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, getCurrentUser, hashToken } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { sanitizePlain } from "@/lib/sanitize";
import { absoluteUrl } from "@/lib/utils";
import { CLAIM_ROLES, CLAIM_VERIFY_LABEL, CLAIM_VERIFY_METHODS, claimHref, emailMatchesWebsite, isPersonalEmailDomain } from "@/lib/gives/constants";
import { publicOrgWhere } from "@/lib/gives/queries";
import { recomputeOwnership } from "@/lib/gives/ownership";
import { normalizeUrl } from "@/components/dashboard/text";
import type { ActionState } from "@/components/ui/form-message";

const VERIFY_HOURS = 48;
const get = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

const schema = z.object({
  applicantName: z.string().trim().min(2, "Please enter your full name.").max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Please enter a valid email address.")),
  phone: z.string().trim().max(30).regex(/^[0-9+().\-\s xext]*$/i, "Please enter a valid phone number.").optional(),
  role: z.enum(CLAIM_ROLES, { error: "Choose your role." }),
  roleOther: z.string().trim().max(120).optional(),
  verificationMethod: z.enum(CLAIM_VERIFY_METHODS.map((m) => m.value) as [string, ...string[]], { error: "Choose how we can verify you." }),
  affiliation: z.string().trim().min(10, "Tell us where your role with the organization can be publicly confirmed (a sentence is enough).").max(2000),
  affiliationUrl: z.string().trim().max(500).optional(),
  message: z.string().trim().max(2000).optional(),
  attest: z.literal(true, { error: "Please confirm you're authorized to manage this organization's public information." }),
});

function issues(e: z.ZodError): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const i of e.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { error: Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors };
}

/** Creates a verification token (only its sha256 is stored) and emails the link to the organization email. */
async function sendClaimVerification(claimId: string, email: string, orgName: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.organizationClaim.update({
    where: { id: claimId },
    data: { verifyTokenHash: hashToken(token), verifyExpiresAt: new Date(Date.now() + VERIFY_HOURS * 3600_000) },
  });
  await sendEmail(
    email,
    `Confirm your email to claim ${orgName} on TCountySpotlight`,
    `Someone (hopefully you) asked to manage the ${orgName} listing on TCountySpotlight's T-County Gives and gave this address as their organization email.\n\nConfirm this address (link expires in ${VERIFY_HOURS} hours):\n${absoluteUrl(`/gives/claim/verify/?token=${token}`)}\n\nConfirming the email does not approve the claim by itself — our team reviews every request.\nIf this wasn't you, ignore this email.`,
  );
}

export async function submitClaimAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  const slug = get(fd, "slug").slice(0, 120);
  if (!user) redirect(`/login/?next=${encodeURIComponent(`/gives/claim/${slug}/`)}`);
  if (get(fd, "website_url")) return { ok: true, message: "Thanks!" }; // honeypot
  if (!user.emailVerifiedAt) return { error: "Please confirm your account email first (check your inbox, or resend the link from this page)." };
  const ip = await clientIp();
  if (!rateLimit(`claim:${user.id}`, 5, 24 * 3600_000).ok || !rateLimit(`claim-ip:${ip}`, 10, 3600_000).ok) {
    return { error: "You've sent several claim requests recently. Please try again later or contact us." };
  }
  const org = await db.organization.findFirst({ where: publicOrgWhere({ slug }), select: { id: true, name: true, slug: true, kind: true, website: true, ownershipStatus: true } });
  if (!org) return { error: "This listing isn't available." };

  const parsed = schema.safeParse({
    applicantName: get(fd, "applicantName"), email: get(fd, "email"), phone: get(fd, "phone") || undefined, role: get(fd, "role"),
    roleOther: get(fd, "roleOther") || undefined, verificationMethod: get(fd, "verificationMethod"), affiliation: get(fd, "affiliation"),
    affiliationUrl: get(fd, "affiliationUrl") || undefined, message: get(fd, "message") || undefined, attest: fd.get("attest") === "on",
  });
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  if (d.role === "Other" && !d.roleOther) return { error: "Please describe your role.", fieldErrors: { roleOther: "Describe your role" } };
  const affUrl = d.affiliationUrl ? normalizeUrl(d.affiliationUrl) : null;
  if (d.affiliationUrl && !affUrl) return { error: "The affiliation link doesn't look like a web address.", fieldErrors: { affiliationUrl: "Invalid link" } };

  const [member, pending] = await Promise.all([
    db.organizationMember.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: org.id } }, select: { role: true } }),
    db.organizationClaim.findFirst({ where: { organizationId: org.id, userId: user.id, status: "PENDING" }, select: { id: true } }),
  ]);
  if (member) return { error: "You already manage this organization." };
  if (pending) return { error: "You already have a pending claim for this organization." };

  const role = d.role === "Other" ? `Other: ${sanitizePlain(d.roleOther, 120)}` : d.role;
  const evidence = [sanitizePlain(d.affiliation, 2000), affUrl ? `Link: ${affUrl}` : ""].filter(Boolean).join("\n");
  const claim = await db.organizationClaim.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      applicantName: sanitizePlain(d.applicantName, 120),
      email: d.email,
      phone: d.phone ? sanitizePlain(d.phone, 30) : null,
      role,
      verificationMethod: d.verificationMethod,
      evidence,
      message: d.message ? sanitizePlain(d.message, 2000) : null,
      emailDomainMatches: emailMatchesWebsite(d.email, org.website),
      // The account email is verified; if the organization email is the same address it is verified too.
      emailVerifiedAt: d.email === user.email.toLowerCase() ? new Date() : null,
    },
  });
  if (d.email !== user.email.toLowerCase()) await sendClaimVerification(claim.id, d.email, org.name);
  const ownership = await recomputeOwnership(org.id);
  await audit(user.id, "organization_claim.create", "OrganizationClaim", claim.id, { organizationId: org.id, name: org.name, ownership, alreadyClaimed: org.ownershipStatus === "CLAIMED" });

  const settings = await getSettings();
  if (settings.notifyAdminEmail) {
    await sendEmail(
      settings.notifyAdminEmail,
      `${org.ownershipStatus === "CLAIMED" ? "Request to join" : "Ownership claim"}: ${org.name}`,
      `${claim.applicantName} (${role}) asked to manage ${org.name}.\nAccount: ${user.email}\nOrganization email: ${d.email}${isPersonalEmailDomain(d.email) ? " (personal email provider)" : ""}${claim.emailDomainMatches ? " (matches website domain)" : ""}\nVerification offered: ${CLAIM_VERIFY_LABEL[d.verificationMethod]}${org.ownershipStatus === "CLAIMED" ? "\n\nNote: this listing already has managers." : ""}\n\nReview: ${absoluteUrl("/admin/organizations/claims/")}`,
    );
  }
  revalidatePath(claimHref(org));
  revalidatePath("/account/");
  redirect(`${claimHref(org)}?submitted=1`);
}

export async function resendClaimVerificationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  if (!rateLimit(`claim-resend:${user.id}`, 3, 3600_000).ok) return { error: "We've sent a few links already. Please check your inbox (and spam folder)." };
  const claim = await db.organizationClaim.findFirst({ where: { id: get(fd, "claimId"), userId: user.id, status: "PENDING", emailVerifiedAt: null }, include: { organization: { select: { name: true } } } });
  if (!claim) return { error: "Nothing to resend." };
  await sendClaimVerification(claim.id, claim.email, claim.organization.name);
  return { ok: true, message: `Sent a new link to ${claim.email}.` };
}

export async function withdrawClaimAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const claim = await db.organizationClaim.findFirst({ where: { id: get(fd, "claimId"), userId: user.id }, include: { organization: { select: { id: true, slug: true } } } });
  if (!claim) return { error: "Claim not found." };
  const n = await db.organizationClaim.updateMany({ where: { id: claim.id, status: "PENDING" }, data: { status: "WITHDRAWN", verifyTokenHash: null, verifyExpiresAt: null } });
  if (!n.count) return { error: "Only pending claims can be withdrawn." };
  const ownership = await recomputeOwnership(claim.organizationId);
  await audit(user.id, "organization_claim.withdraw", "OrganizationClaim", claim.id, { organizationId: claim.organizationId, ownership });
  revalidatePath(claimHref(claim.organization));
  revalidatePath("/account/");
  return { ok: true, message: "Claim withdrawn." };
}

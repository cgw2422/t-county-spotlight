"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { sanitizePlain } from "@/lib/sanitize";
import { audit } from "@/lib/audit";
import { absoluteUrl } from "@/lib/utils";
import { accountFieldsSchema, createAccount, findAccountByEmail } from "@/lib/accounts";
import { claimedListingMessage, deleteApplicationDraft, isBusinessClaimed, saveApplicationDraft, signInToApplicationHref } from "@/lib/application-flow";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { requestSubscription } from "@/lib/newsletter/subscribers";
import { subscribeAfterRegistration } from "@/lib/beehiiv/signup";
import { registerNewsletterToken, type RegisterNewsletterResult } from "@/lib/newsletter/register-flash";
import { PRIVACY_PATH, REGISTER_NEWSLETTER_LABEL, SIGNUP_DISCLAIMER } from "@/lib/newsletter/copy";
import { echoValues, type FormState } from "@/components/dashboard/fields";

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? sanitizePlain(v, max) : undefined));

const schema = z.object({
  businessName: z.string().trim().min(2, "Add your business name").max(150),
  contactName: opt(120),
  email: z.email("Enter a valid email").max(200),
  phone: opt(40),
  website: z.string().trim().max(300).optional().transform((v) => v || undefined)
    .refine((v) => !v || /^(https?:\/\/)?[^\s]+\.[^\s]+$/i.test(v), "Enter a valid website"),
  address: opt(200),
  city: opt(80),
  category: opt(80),
  message: opt(3000),
  wantsSpotlight: z.boolean(),
  wantsJobPosting: z.boolean(),
  newsletter: z.boolean(),
  claimSlug: z.string().max(120).optional(),
});

/** Name fields for "Create a Free Account" (same rules as /register/). */
const newAccountSchema = accountFieldsSchema.pick({ firstName: true, lastName: true });

export type ApplicationFormState = (NonNullable<FormState> & {
  /** Set when "Create a Free Account" was chosen for an email that already has an account. */
  accountExists?: { signInHref: string };
}) | null;

const ACCOUNT_EXISTS = "An account with this email already exists — sign in to continue.";

function issuesToFields(issues: { path: PropertyKey[]; message: string }[], into: Record<string, string> = {}) {
  for (const i of issues) into[String(i.path[0])] ??= i.message;
  return into;
}

/**
 * /list-your-business/ (new listing or `?claim=<slug>`). Signed in: the application is linked to that account.
 * Signed out ("Create a Free Account"): a normal account is created first through the same code path as
 * /register/ (verification email, signed in right away) — unless the email already has an account, which is
 * never changed or linked: the visitor is asked to sign in, and the entered fields wait in a short-lived draft.
 * Submitting never grants listing access: no BusinessOwner row and no role change until staff approve.
 */
export async function submitApplication(_prev: ApplicationFormState, fd: FormData): Promise<ApplicationFormState> {
  const values = echoValues(fd, ["password", "confirm", "fax_number"]);
  if (fd.get("fax_number")) return { ok: true, message: "Thanks! We received your application." };
  const ip = await clientIp();
  if (!rateLimit(`biz-apply:${ip}`, 5, 60 * 60_000).ok) return { error: "Too many submissions from your connection. Please try again later.", values };

  const get = (k: string) => fd.get(k)?.toString() || undefined;
  const user = await getCurrentUser();
  const firstName = get("firstName")?.trim();
  const lastName = get("lastName")?.trim();
  const parsed = schema.safeParse({
    businessName: get("businessName") ?? "", contactName: user ? get("contactName") : [firstName, lastName].filter(Boolean).join(" ") || undefined,
    email: (get("email") ?? "").trim(), phone: get("phone"), website: get("website"), address: get("address"), city: get("city"), category: get("category"),
    message: get("message"), wantsSpotlight: fd.get("wantsSpotlight") === "on", wantsJobPosting: fd.get("wantsJobPosting") === "on",
    newsletter: fd.get("newsletter") === "on", claimSlug: get("claimSlug"),
  });
  const names = user ? null : newAccountSchema.safeParse({ firstName: firstName ?? "", lastName: lastName ?? "" });
  if (!parsed.success || (names && !names.success)) {
    const fieldErrors = issuesToFields(parsed.success ? [] : parsed.error.issues);
    if (names && !names.success) issuesToFields(names.error.issues, fieldErrors);
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const d = parsed.data;
  const email = d.email.toLowerCase();
  const settings = await getSettings();

  // Claims only for listings nobody owns yet (also refuses stale links and forms left open).
  let claim: { id: string; name: string } | null = null;
  if (d.claimSlug) {
    claim = await db.business.findFirst({ where: { slug: d.claimSlug, deletedAt: null }, select: { id: true, name: true } });
    if (!claim) return { error: "This listing is no longer available to claim. You can still apply to add your business as a new listing.", values };
    if (await isBusinessClaimed(claim.id)) return { error: claimedListingMessage(settings.contactEmail), values };
  }
  const draftToken = get("draft");

  let userId = user?.id ?? null;
  let accountCreated = false;
  if (!user) {
    const existsReply = async () => {
      // Keep what they typed (never the password) so signing in brings them back to a prefilled form.
      const token = await saveApplicationDraft({ ...Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "string")) as Record<string, string>, claimSlug: d.claimSlug });
      return { error: ACCOUNT_EXISTS, fieldErrors: { email: "This email already has an account." }, accountExists: { signInHref: signInToApplicationHref({ claimSlug: d.claimSlug, draft: token }) }, values } satisfies ApplicationFormState;
    };
    if (await findAccountByEmail(email)) return existsReply();
    const created = await createAccount({
      firstName: names!.data!.firstName, lastName: names!.data!.lastName, email, password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? ""),
      auditDetails: { source: "list_your_business", claim: !!claim, newsletterOptIn: d.newsletter },
    });
    if (!created.ok) {
      if (created.reason === "exists") return existsReply();
      return { error: created.error, fieldErrors: created.fieldErrors, values };
    }
    userId = created.user.id;
    accountCreated = true;
    // Same as /register/: the new member is signed in right away (fresh session).
    await destroySession();
    await createSession(created.user.id);
  }

  const businessName = sanitizePlain(d.businessName, 150);
  // Gentle duplicate guard: this account already has the same request pending.
  const dup = await db.businessApplication.findFirst({ where: { userId, businessName: { equals: businessName, mode: "insensitive" }, status: "PENDING", ...(claim ? { businessId: claim.id } : {}) }, select: { id: true } });
  if (dup) redirect(`/list-your-business/?submitted=${encodeURIComponent(dup.id)}&dup=1`);

  const website = d.website ? (/^https?:\/\//i.test(d.website) ? d.website : `https://${d.website}`) : undefined;
  const app = await db.businessApplication.create({
    data: {
      businessName, contactName: d.contactName, email, phone: d.phone, website,
      address: d.address, city: d.city, category: d.category, message: d.message, wantsSpotlight: d.wantsSpotlight,
      data: { wantsJobPosting: d.wantsJobPosting, claim: claim ? { businessId: claim.id, name: claim.name } : null, source: "public_form", accountCreated, newsletterOptIn: d.newsletter },
      userId, businessId: claim?.id,
    },
  });
  await audit(userId, "application.submit", "BusinessApplication", app.id, { businessName, claim: !!claim, accountCreated });
  await deleteApplicationDraft(draftToken);

  // Newsletter: optional and separate from the application, verification and approval. Never blocks.
  let nlResult: RegisterNewsletterResult | null = null;
  if (d.newsletter) {
    const nl = await getNewsletterConfig();
    if (nl.isBeehiiv) {
      nlResult = nl.beehiivConfigured ? await subscribeAfterRegistration(email, ip, { placement: "business_application" }) : "failed";
    } else {
      try {
        await requestSubscription({ email, firstName: firstName || user?.firstName || null, source: "business_application", ip, userId, consentText: `[x] ${REGISTER_NEWSLETTER_LABEL}. ${nl.tagline} ${SIGNUP_DISCLAIMER} We'll email you a link to confirm first. How we use your email: ${PRIVACY_PATH}` });
        nlResult = "builtin";
      } catch (e) {
        console.error("[list-your-business] newsletter signup failed", e);
        nlResult = "failed";
      }
    }
  }

  if (settings.notifyAdminEmail) {
    await sendEmail(
      settings.notifyAdminEmail,
      `${claim ? "Listing claim" : "New business application"}: ${businessName}`,
      [
        `Business: ${businessName}${claim ? ` (claiming existing listing)` : ""}`,
        `Contact: ${d.contactName ?? "—"} <${email}> ${d.phone ?? ""}`,
        `Town: ${d.city ?? "—"} · Category: ${d.category ?? "—"}`,
        `Wants spotlight: ${d.wantsSpotlight ? "yes" : "no"} · Wants job posting: ${d.wantsJobPosting ? "yes" : "no"}`,
        "", d.message ?? "", "", `Review: ${absoluteUrl("/admin/applications/")}`,
      ].join("\n"),
    );
  }
  await sendEmail(email, `We received your application — ${settings.siteName}`, `Hi${d.contactName ? ` ${d.contactName}` : ""},\n\nThanks for applying to ${claim ? "manage" : "list"} ${businessName} on ${settings.siteName}. Our team reviews every request and will reach out within a few business days.\n\nYou can use your ${settings.siteName} account in the meantime; you'll be able to manage the listing once your request is approved.\n\n— ${settings.siteName}`);

  // The confirmation screen is only shown to this account; `nl` is HMAC-signed for it (see register-flash.ts).
  redirect(`/list-your-business/?submitted=${encodeURIComponent(app.id)}${accountCreated ? "&account=new" : ""}${nlResult && userId ? `&nl=${encodeURIComponent(registerNewsletterToken(userId, nlResult))}` : ""}`);
}

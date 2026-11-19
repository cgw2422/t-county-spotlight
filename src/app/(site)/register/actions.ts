"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp, createSession, destroySession } from "@/lib/auth";
import { safeNext } from "@/lib/tokens";
import { accountFieldsSchema, createAccount } from "@/lib/accounts";
import { recordServerSignal } from "@/lib/analytics";
import { requestSubscription } from "@/lib/newsletter/subscribers";
import { getNewsletterConfig } from "@/lib/newsletter/settings";
import { subscribeAfterRegistration } from "@/lib/beehiiv/signup";
import { registerNewsletterToken, type RegisterNewsletterResult } from "@/lib/newsletter/register-flash";
import { PRIVACY_PATH, REGISTER_NEWSLETTER_LABEL, SIGNUP_DISCLAIMER } from "@/lib/newsletter/copy";
import { ALL_COUNTY, COMMUNITY_COOKIE, COOKIE_MAX_AGE, SCOPE_COOKIE, communityName, communitySlug } from "@/lib/my-t-county-shared";
import { parseRegisterSource } from "@/lib/resident-accounts";
import { echoValues, type FormState } from "@/components/dashboard/fields";

const schema = accountFieldsSchema.extend({
  /** "" = not chosen, "all" = All of Tuscarawas County, or a community slug/name from the My T County list. */
  community: z.string().trim().max(60).refine((v) => v === "" || v === ALL_COUNTY || !!communityName(v), "Please choose a community from the list."),
  newsletter: z.boolean(),
  ownsBusiness: z.boolean(),
  next: z.string().max(500).optional(),
});

/** Same reply whether or not the address already has an account (matches the existing sign-in / reset flow). */
const NEUTRAL = "We couldn't create an account with those details. If you already have an account, sign in or reset your password.";

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = echoValues(fd, ["password", "confirm", "website"]);
  const source = parseRegisterSource(fd.get("source"));
  // Honeypot: real people never see or fill this field.
  if (String(fd.get("website") ?? "").trim()) return { error: NEUTRAL, values };

  const parsed = schema.safeParse({
    firstName: fd.get("firstName") ?? "", lastName: fd.get("lastName") ?? "", email: fd.get("email") ?? "", password: fd.get("password") ?? "",
    community: fd.get("community") ?? "", newsletter: fd.get("newsletter") === "on",
    ownsBusiness: fd.get("ownsBusiness") === "on", next: fd.get("next") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const { firstName, lastName, email, password, community, newsletter: newsletterBox, ownsBusiness, next } = parsed.data;
  // Built-in mode: pending (double opt-in) subscriber. beehiiv mode: the address goes to beehiiv after the
  // account exists, and the built-in list takes no signups.
  const nl = await getNewsletterConfig();
  const newsletter = newsletterBox && !nl.isBeehiiv;
  const beehiivOptIn = newsletterBox && nl.isBeehiiv;
  const home = community && community !== ALL_COUNTY ? communityName(community) : null;
  const created = await createAccount({
    firstName, lastName, email, password, confirm: String(fd.get("confirm") ?? ""), homeCommunity: home,
    auditDetails: { ownsBusiness, source, newsletterOptIn: newsletterBox, newsletterProvider: newsletterBox ? (nl.isBeehiiv ? "beehiiv" : "builtin") : null, community: home ?? (community === ALL_COUNTY ? "all" : null) },
  });
  if (!created.ok) {
    // Same reply whether or not the address already has an account (matches the sign-in / reset flow).
    if (created.reason === "exists" || created.reason === "failed") return { error: NEUTRAL, values };
    return { error: created.error, fieldErrors: created.fieldErrors, values };
  }
  const user = created.user;
  const ip = await clientIp();
  // Newsletter only when the box was ticked; unticked leaves newsletter status untouched.
  let nlResult: RegisterNewsletterResult | null = null;
  if (newsletter) {
    // Built-in: marketing is separate and double opt-in: this only sends the newsletter's own confirmation link.
    try {
      await requestSubscription({ email, firstName, source: "register", ip, communities: home ? [home] : [], consentText: `[x] ${REGISTER_NEWSLETTER_LABEL}. ${nl.tagline} ${SIGNUP_DISCLAIMER} We'll email you a link to confirm first. How we use your email: ${PRIVACY_PATH}` });
      nlResult = "builtin";
    } catch (e) {
      console.error("[register] newsletter signup failed", e);
      nlResult = "failed";
    }
  }
  // beehiiv: same lookup → single opt-in + welcome email flow as the public form. Short timeouts; never
  // blocks or undoes the account. The outcome is shown once on the welcome screen.
  if (beehiivOptIn) nlResult = nl.beehiivConfigured ? await subscribeAfterRegistration(email, ip) : "failed";
  await recordServerSignal("register_complete", source);

  await destroySession();
  await createSession(user.id);
  if (community) {
    const jar = await cookies();
    jar.set(COMMUNITY_COOKIE, home ? communitySlug(home)! : ALL_COUNTY, { maxAge: COOKIE_MAX_AGE, sameSite: "lax", path: "/", httpOnly: false, secure: process.env.NODE_ENV === "production" });
    jar.delete(SCOPE_COOKIE);
  }
  if (ownsBusiness) redirect("/list-your-business/?welcome=1");
  // My T County (no next, or next=/my-t-county/) opens with the one-time welcome; `nl` (HMAC-signed for this
  // member, short-lived) adds the newsletter result there when they ticked the newsletter box.
  const dest = safeNext(next);
  if (!dest || dest === "/my-t-county/") redirect(`/my-t-county/?welcome=1${nlResult ? `&nl=${encodeURIComponent(registerNewsletterToken(user.id, nlResult))}` : ""}`);
  redirect(dest);
}

"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, hashPassword, passwordProblem } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { safeNext, sendVerificationEmail } from "@/lib/tokens";
import { audit } from "@/lib/audit";
import { recordServerSignal } from "@/lib/analytics";
import { requestSubscription } from "@/lib/newsletter/subscribers";
import { REGISTER_CONSENT_TEXT } from "@/lib/newsletter/copy";
import { ALL_COUNTY, COMMUNITY_COOKIE, COOKIE_MAX_AGE, SCOPE_COOKIE, communityName, communitySlug } from "@/lib/my-t-county-shared";
import { parseRegisterSource } from "@/lib/resident-accounts";
import { echoValues, type FormState } from "@/components/dashboard/fields";

const name = (label: string) => z.string().trim().min(1, `Please enter your ${label}.`).max(60, `Please keep your ${label} under 60 characters.`).refine((v) => !/[<>{}\u0000-\u001f]/.test(v), `Please check your ${label}.`);

const schema = z.object({
  firstName: name("first name"),
  lastName: name("last name"),
  email: z.string().trim().toLowerCase().max(254, "Please enter a valid email address.").pipe(z.email("Please enter a valid email address.")),
  password: z.string().max(200),
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
  const { firstName, lastName, email, password, community, newsletter, ownsBusiness, next } = parsed.data;
  const pwErr = passwordProblem(password);
  if (pwErr) return { error: pwErr, fieldErrors: { password: pwErr }, values };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "The two passwords don't match.", fieldErrors: { confirm: "Passwords don't match." }, values };

  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 6, 60 * 60_000).ok || !rateLimit(`register:${ip}:${email}`, 3, 60 * 60_000).ok) {
    return { error: "Too many attempts. Please wait a while and try again.", values };
  }

  // Hash first so "already registered" and "created" take about the same time.
  const passwordHash = await hashPassword(password);
  // Emails are stored lowercased; also match any older mixed-case row.
  const exists = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (exists) return { error: NEUTRAL, values };

  const home = community && community !== ALL_COUNTY ? communityName(community) : null;
  let user;
  try {
    user = await db.user.create({
      data: {
        firstName, lastName, name: `${firstName} ${lastName}`, email,
        passwordHash, passwordChangedAt: new Date(), role: "MEMBER",
        homeCommunity: home, lastLoginAt: new Date(),
      },
    });
  } catch {
    return { error: NEUTRAL, values };
  }
  await audit(user.id, "user.register", "User", user.id, { ownsBusiness, source, newsletterOptIn: newsletter, community: home ?? (community === ALL_COUNTY ? "all" : null) });
  // Account/security email: always sent, whatever the newsletter choice.
  await sendVerificationEmail({ id: user.id, email: user.email, name: firstName });
  if (newsletter) {
    // Marketing is separate and double opt-in: this only sends the newsletter's own confirmation link.
    try {
      await requestSubscription({ email, firstName, source: "register", ip, communities: home ? [home] : [], consentText: REGISTER_CONSENT_TEXT });
    } catch (e) {
      console.error("[register] newsletter signup failed", e);
    }
  }
  await recordServerSignal("register_complete", source);

  await destroySession();
  await createSession(user.id);
  if (community) {
    const jar = await cookies();
    jar.set(COMMUNITY_COOKIE, home ? communitySlug(home)! : ALL_COUNTY, { maxAge: COOKIE_MAX_AGE, sameSite: "lax", path: "/", httpOnly: false, secure: process.env.NODE_ENV === "production" });
    jar.delete(SCOPE_COOKIE);
  }
  if (ownsBusiness) redirect("/list-your-business/?welcome=1");
  redirect(safeNext(next) ?? "/my-t-county/?welcome=1");
}

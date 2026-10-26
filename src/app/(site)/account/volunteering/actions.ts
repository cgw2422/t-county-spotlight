"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { orgRecipients, recalcNeed } from "@/lib/gives/queries";

/** A signed-in volunteer cancels their own sign-up. */
export async function cancelMySignupAction(fd: FormData) {
  const user = await requireUser("/account/volunteering/");
  const s = await db.volunteerSignup.findFirst({
    where: { id: String(fd.get("id") ?? ""), status: { in: ["REGISTERED", "CONFIRMED", "WAITLISTED"] }, OR: [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ email: user.email.toLowerCase() }] : [])] },
    include: { opportunity: { select: { id: true, title: true, organizationId: true } } },
  });
  if (!s) return;
  await db.volunteerSignup.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
  await audit(user.id, "volunteer.self_cancel", "VolunteerSignup", s.id, { opportunityId: s.opportunity.id });
  for (const to of await orgRecipients(s.opportunity.organizationId)) {
    await sendEmail(to, `Volunteer cancelled: ${s.opportunity.title}`, `${s.name} cancelled their sign-up for "${s.opportunity.title}". A spot may be open for someone on your waitlist.`);
  }
  revalidatePath("/account/volunteering/");
}

/** A signed-in donor withdraws a pledge that hasn't been received yet. */
export async function cancelMyPledgeAction(fd: FormData) {
  const user = await requireUser("/account/volunteering/");
  const p = await db.needPledge.findFirst({
    where: { id: String(fd.get("id") ?? ""), status: "PLEDGED", OR: [{ userId: user.id }, ...(user.emailVerifiedAt ? [{ email: user.email.toLowerCase() }] : [])] },
    include: { need: { select: { id: true, title: true, organizationId: true } } },
  });
  if (!p) return;
  await db.needPledge.update({ where: { id: p.id }, data: { status: "CANCELLED" } });
  await recalcNeed(p.need.id);
  await audit(user.id, "pledge.self_cancel", "NeedPledge", p.id, { needId: p.need.id });
  for (const to of await orgRecipients(p.need.organizationId)) {
    await sendEmail(to, `Pledge withdrawn: ${p.need.title}`, `${p.name} withdrew their pledge of ${p.quantity} for "${p.need.title}".`);
  }
  revalidatePath("/account/volunteering/");
}

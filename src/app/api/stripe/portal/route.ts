import { NextResponse } from "next/server";
import { OWNER_ONLY_MESSAGE, canManageOwnership, requireBusinessAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";
import { absoluteUrl } from "@/lib/utils";

/** POST (form field businessId) → redirects to the Stripe Billing Portal for that business. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const form = await req.formData();
  const businessId = String(form.get("businessId") ?? "");
  if (!businessId) return NextResponse.json({ error: "Missing business" }, { status: 400 });
  const { role } = await requireBusinessAccess(businessId);
  // Billing is owner-only: managers can't open the Stripe portal.
  if (!canManageOwnership(role)) return NextResponse.json({ error: OWNER_ONLY_MESSAGE }, { status: 403 });

  const back = absoluteUrl(`/dashboard/${businessId}/membership/`);
  const stripe = getStripe();
  const sub = await db.subscription.findFirst({
    where: { businessId, stripeCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!stripe || !sub?.stripeCustomerId) return NextResponse.redirect(`${back}?billing=unavailable`, 303);
  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: back });
    return NextResponse.redirect(portal.url, 303);
  } catch (e) {
    console.error("[stripe] billing portal failed", e);
    return NextResponse.redirect(`${back}?billing=error`, 303);
  }
}

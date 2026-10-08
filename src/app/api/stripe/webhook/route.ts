import { NextResponse } from "next/server";
import { getStripe, processStripeEvent, type StripeLikeEvent } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint. Configure in Stripe as:
 *   https://<your-domain>/api/stripe/webhook/
 * (note the trailing slash — the site uses trailingSlash: true).
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const body = await req.text();

  let event: StripeLikeEvent;
  try {
    event = (await stripe.webhooks.constructEventAsync(body, sig, secret)) as unknown as StripeLikeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await processStripeEvent(event);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("[stripe] webhook processing failed", event.id, event.type, e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { handleResendEvent, verifySvixSignature } from "@/lib/newsletter/webhook";

export const dynamic = "force-dynamic";

/**
 * Resend delivery events (Svix-signed). Configure in Resend → Webhooks:
 *   https://<domain>/api/newsletter/webhook/   (keep the trailing slash)
 * Events: email.sent, email.delivered, email.bounced, email.complained, email.opened, email.clicked
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const id = req.headers.get("svix-id");
  const v = verifySvixSignature(secret, { id, timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") }, raw);
  if (!v.ok) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let evt: unknown;
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const r = await handleResendEvent(evt as Parameters<typeof handleResendEvent>[0], id!);
    return NextResponse.json({ ok: true, matched: r.matched });
  } catch (e) {
    console.error("[newsletter webhook]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 }); // provider retries
  }
}

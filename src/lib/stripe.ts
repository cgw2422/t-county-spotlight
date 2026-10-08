// Stripe integration. Intentionally free of "server-only" so the webhook
// handler can be exercised from scripts/tests; never import from client code.
import Stripe from "stripe";
import { db } from "./db";
import { audit } from "./audit";
import type { SubscriptionStatus } from "@/generated/prisma/client";

let client: Stripe | null = null;

/** Stripe client, or null when STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key, { appInfo: { name: "TCountySpotlight" } });
  return client;
}

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ───────────── Customers ─────────────

/** Reuse the business's Stripe customer (local records first, then Stripe metadata search), else create one. */
export async function getOrCreateCustomer(stripe: Stripe, business: { id: string; name: string }, email?: string | null) {
  const existing = await db.subscription.findFirst({
    where: { businessId: business.id, stripeCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { stripeCustomerId: true },
  });
  if (existing?.stripeCustomerId) return existing.stripeCustomerId;
  try {
    const found = await stripe.customers.search({ query: `metadata['businessId']:'${business.id.replace(/'/g, "")}'`, limit: 1 });
    if (found.data[0]) return found.data[0].id;
  } catch {
    // search is unavailable in some regions; fall through to create
  }
  const c = await stripe.customers.create({ name: business.name, email: email ?? undefined, metadata: { businessId: business.id } });
  return c.id;
}

// ───────────── Webhook processing ─────────────

/** Minimal shapes we read from Stripe objects (tolerant of API-version differences). */
type Obj = Record<string, unknown>;
export type StripeLikeEvent = { id: string; type: string; data: { object: Obj } };

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  paused: "UNPAID",
};

export function mapSubscriptionStatus(s: unknown): SubscriptionStatus {
  return STATUS_MAP[String(s)] ?? "INCOMPLETE";
}

const idOf = (v: unknown): string | null => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as Obj).id) : null);
const meta = (o: Obj): Record<string, string> => ((o.metadata as Record<string, string>) ?? {});
const toDate = (sec: unknown) => (typeof sec === "number" && sec > 0 ? new Date(sec * 1000) : null);

function isUniqueViolation(e: unknown) {
  return !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
}

/**
 * Processes a verified Stripe event exactly once. The event id is inserted
 * into StripeEvent first; a unique violation means it was already handled.
 * If processing fails the marker is removed so Stripe's retry can succeed.
 */
export async function processStripeEvent(event: StripeLikeEvent): Promise<{ duplicate: boolean; handled: boolean }> {
  try {
    await db.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch (e) {
    if (isUniqueViolation(e)) return { duplicate: true, handled: false };
    throw e;
  }
  try {
    const handled = await dispatch(event);
    return { duplicate: false, handled };
  } catch (e) {
    await db.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    throw e;
  }
}

async function dispatch(event: StripeLikeEvent): Promise<boolean> {
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(o, event.type);
      return true;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(o, event.type === "customer.subscription.deleted");
      return true;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await upsertInvoicePayment(o, "paid");
      return true;
    case "invoice.payment_failed":
      await upsertInvoicePayment(o, "failed");
      return true;
    default:
      return false;
  }
}

async function handleCheckoutCompleted(session: Obj, type: string) {
  const m = meta(session);
  if (session.mode === "subscription") {
    const subId = idOf(session.subscription);
    if (!subId) return;
    // Pull the authoritative subscription when the API is reachable.
    const stripe = getStripe();
    if (stripe) {
      try {
        const sub = await stripe.subscriptions.retrieve(subId);
        await syncSubscription(sub as unknown as Obj, false, m);
        return;
      } catch (e) {
        console.error("[stripe] could not retrieve subscription", subId, e);
      }
    }
    // Otherwise record the link; customer.subscription.* events fill in status.
    if (!m.businessId || !m.planId) return;
    const plan = await db.membershipPlan.findUnique({ where: { id: m.planId } });
    if (!plan) return;
    await db.subscription.upsert({
      where: { stripeSubscriptionId: subId },
      create: { businessId: m.businessId, planId: plan.id, stripeSubscriptionId: subId, stripeCustomerId: idOf(session.customer), status: "INCOMPLETE" },
      update: { stripeCustomerId: idOf(session.customer) ?? undefined },
    });
    return;
  }

  if (session.mode === "payment" && m.productId) {
    // One-time sponsorship purchase. Only record once the money is in.
    if (session.payment_status !== "paid" && type !== "checkout.session.async_payment_succeeded") return;
    const sessionId = String(session.id);
    const product = await db.sponsorshipProduct.findUnique({ where: { id: m.productId } });
    const businessId = m.businessId || null;
    const already = await db.payment.findUnique({ where: { stripeSessionId: sessionId } });
    if (already) return;
    await db.payment.create({
      data: {
        businessId,
        stripeSessionId: sessionId,
        amountCents: Number(session.amount_total ?? 0),
        currency: String(session.currency ?? "usd"),
        status: "paid",
        description: product ? `Sponsorship: ${product.name}` : "Sponsorship purchase",
        paidAt: new Date(),
      },
    });
    if (product) {
      const slot = { featured_placement: "homepage_featured", weekend_guide: "weekend_guide", event_sponsorship: "events" }[product.type] ?? product.type;
      // Inactive until an admin schedules it.
      const placement = await db.placement.create({
        data: { businessId, productId: product.id, slot, title: product.name, isActive: false },
      });
      await audit(null, "sponsorship.purchased", "Placement", placement.id, { businessId, productId: product.id, sessionId });
    }
  }
}

/** Upsert a Subscription row from a Stripe subscription object. */
export async function syncSubscription(sub: Obj, deleted = false, extraMeta: Record<string, string> = {}) {
  const stripeSubscriptionId = String(sub.id);
  const m = { ...extraMeta, ...meta(sub) };
  const customerId = idOf(sub.customer);
  const items = ((sub.items as Obj | undefined)?.data as Obj[] | undefined) ?? [];
  const priceId = idOf(items[0]?.price);
  const periodEnd = toDate(sub.current_period_end) ?? toDate(items[0]?.current_period_end);

  const existing = await db.subscription.findUnique({ where: { stripeSubscriptionId } });

  let businessId = m.businessId || existing?.businessId || null;
  if (!businessId && customerId) {
    const sibling = await db.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { businessId: true } });
    businessId = sibling?.businessId ?? null;
  }
  let planId: string | null = null;
  if (priceId) planId = (await db.membershipPlan.findFirst({ where: { stripePriceId: priceId }, select: { id: true } }))?.id ?? null;
  if (!planId && m.planId) planId = (await db.membershipPlan.findUnique({ where: { id: m.planId }, select: { id: true } }))?.id ?? null;
  if (!planId) planId = existing?.planId ?? null;

  if (!businessId || !planId) {
    console.warn("[stripe] subscription could not be matched to a business/plan", stripeSubscriptionId, { businessId, planId, priceId });
    return null;
  }
  const status = deleted ? "CANCELED" : mapSubscriptionStatus(sub.status);
  const data = {
    businessId,
    planId,
    source: "stripe",
    stripeCustomerId: customerId,
    status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end || (typeof sub.cancel_at === "number" && !deleted && status !== "CANCELED"),
  };
  const row = await db.subscription.upsert({ where: { stripeSubscriptionId }, create: { stripeSubscriptionId, ...data }, update: data });
  if (!existing || existing.status !== row.status || existing.planId !== row.planId || existing.cancelAtPeriodEnd !== row.cancelAtPeriodEnd) {
    await audit(null, existing ? "membership.updated" : "membership.created", "Subscription", row.id, {
      businessId, planId, status: row.status, previousStatus: existing?.status ?? null, cancelAtPeriodEnd: row.cancelAtPeriodEnd, stripeSubscriptionId,
    });
  }
  return row;
}

async function upsertInvoicePayment(inv: Obj, status: "paid" | "failed") {
  const stripeInvoiceId = String(inv.id);
  const parent = inv.parent as Obj | undefined;
  const subDetails = parent?.subscription_details as Obj | undefined;
  const subId = idOf(inv.subscription) ?? idOf(subDetails?.subscription);
  const subMeta = (subDetails?.metadata as Record<string, string>) ?? {};
  const customerId = idOf(inv.customer);

  let businessId: string | null = meta(inv).businessId || subMeta.businessId || null;
  if (!businessId && subId) businessId = (await db.subscription.findUnique({ where: { stripeSubscriptionId: subId }, select: { businessId: true } }))?.businessId ?? null;
  if (!businessId && customerId) businessId = (await db.subscription.findFirst({ where: { stripeCustomerId: customerId }, select: { businessId: true } }))?.businessId ?? null;

  const lines = ((inv.lines as Obj | undefined)?.data as Obj[] | undefined) ?? [];
  const description = (inv.description as string) || (lines[0]?.description as string) || "Membership";
  const transitions = (inv.status_transitions as Obj | undefined) ?? {};
  const amountCents = Number(status === "paid" ? inv.amount_paid ?? inv.total ?? 0 : inv.amount_due ?? inv.total ?? 0);
  const data = {
    businessId,
    amountCents,
    currency: String(inv.currency ?? "usd"),
    status,
    description: description.slice(0, 300),
    hostedInvoiceUrl: (inv.hosted_invoice_url as string) ?? null,
    paidAt: status === "paid" ? toDate(transitions.paid_at) ?? new Date() : null,
  };
  const prev = await db.payment.findUnique({ where: { stripeInvoiceId }, select: { status: true } });
  if (prev?.status === "paid" && status === "failed") return null; // out-of-order event; paid is final
  const row = await db.payment.upsert({ where: { stripeInvoiceId }, create: { stripeInvoiceId, ...data }, update: data });
  await audit(null, status === "paid" ? "membership.invoice_paid" : "membership.payment_failed", "Payment", row.id, { businessId, stripeInvoiceId, amountCents });
  return row;
}

import { formatMoney } from "./utils";

/** Human price for a membership plan, always derived from DB values. */
export function formatPlanPrice(plan: { priceCents: number; interval: string }) {
  if (plan.interval === "FREE" || plan.priceCents === 0) return { amount: "Free", per: "" };
  const amount = formatMoney(plan.priceCents).replace(/\.00$/, "");
  return { amount, per: plan.interval === "YEAR" ? "/year" : "/month" };
}

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  TRIALING: "Trial",
  PAST_DUE: "Payment overdue",
  CANCELED: "Canceled",
  INCOMPLETE: "Awaiting payment",
  UNPAID: "Unpaid",
};

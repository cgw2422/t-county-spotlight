"use client";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { redeemPromotion } from "./actions";

export function RedeemForm({ promotionId, alreadyRedeemedAt }: { promotionId: string; alreadyRedeemedAt: string | null }) {
  const [state, action] = useActionState(redeemPromotion, null);
  if (alreadyRedeemedAt || state?.ok) {
    return (
      <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
        <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" aria-hidden /> Redeemed</p>
        <p className="mt-1 text-sm">{state?.message ?? `You redeemed this offer on ${alreadyRedeemedAt}. Show this screen at the business.`}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="promotionId" value={promotionId} />
      <SubmitButton className="btn-primary w-full" pendingText="Redeeming…">Redeem this offer</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

"use client";
import { useActionState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { turnOffEmailUpdateAction } from "./actions";

export function TurnOffForm({ token, label }: { token: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(turnOffEmailUpdateAction, null);
  if (state?.ok) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <p className="text-sm">{state.message}</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="t" value={token} />
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn-danger w-full">
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Turn off {label}
      </button>
    </form>
  );
}

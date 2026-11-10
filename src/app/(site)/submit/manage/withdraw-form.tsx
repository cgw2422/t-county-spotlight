"use client";
import { useActionState } from "react";
import { Undo2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { withdrawSuggestion } from "../actions";

export function WithdrawSuggestionForm({ hidden }: { hidden: Record<string, string> }) {
  const [state, action] = useActionState<ActionState, FormData>(withdrawSuggestion, null);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm("Withdraw this suggestion? Our team won't review it.")) e.preventDefault(); }} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <FormMessage state={state} />
      {!state?.ok && <SubmitButton className="btn-danger" pendingText="Withdrawing…"><Undo2 className="h-4 w-4" aria-hidden /> Withdraw my suggestion</SubmitButton>}
    </form>
  );
}

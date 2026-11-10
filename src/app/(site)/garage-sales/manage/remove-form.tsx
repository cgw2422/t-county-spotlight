"use client";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeGarageSale } from "../actions";

export function RemoveSaleForm({ hidden }: { hidden: Record<string, string> }) {
  const [state, action] = useActionState<ActionState, FormData>(removeGarageSale, null);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm("Remove this sale? It will no longer be listed.")) e.preventDefault(); }} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <FormMessage state={state} />
      {!state?.ok && <SubmitButton className="btn-danger" pendingText="Removing…"><Trash2 className="h-4 w-4" aria-hidden /> Remove my sale</SubmitButton>}
    </form>
  );
}

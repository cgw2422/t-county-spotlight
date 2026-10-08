"use client";
import { useActionState } from "react";
import { FormMessage, type ActionState } from "@/components/ui/form-message";

/** Small wrapper: a <form> bound to a server action with inline success/error feedback. */
export function ActionForm({ action, children, className }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className ?? "space-y-4"}>
      <FormMessage state={state} />
      {children}
    </form>
  );
}

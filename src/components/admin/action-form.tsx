"use client";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ActionState } from "@/components/ui/form-message";
import { FormMessage } from "@/components/ui/form-message";
import { cn } from "@/lib/utils";
import { toast } from "./toast";

export type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

type Ctx = { pending: boolean; submitter: string | null; state: ActionState; dirty: boolean };
const FormCtx = createContext<Ctx>({ pending: false, submitter: null, state: null, dirty: false });
export const useActionFormState = () => useContext(FormCtx);

/**
 * Form bound to a server action returning ActionState. Unlike a bare
 * <form action>, it does not reset fields after submit (so validation
 * errors never wipe what the user typed) and reports results as toasts.
 */
export function ActionForm({ action, children, className, id, onResult, onDirtyChange, warnUnsaved, showMessage = true, resetOnSuccess, formRef }: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  id?: string;
  onResult?: (s: ActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
  warnUnsaved?: boolean;
  showMessage?: boolean;
  resetOnSuccess?: boolean;
  formRef?: React.RefObject<HTMLFormElement | null>;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const [submitter, setSubmitter] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const localRef = useRef<HTMLFormElement>(null);
  const ref = formRef ?? localRef;
  const prevState = useRef<ActionState>(null);

  useEffect(() => {
    if (!state || state === prevState.current) return;
    prevState.current = state;
    if (state.error) toast(state.error, "error");
    else if (state.message) toast(state.message, "success");
    if (!state.error) {
      setDirty(false);
      onDirtyChange?.(false);
      if (resetOnSuccess) ref.current?.reset();
    }
    onResult?.(state);
  }, [state, onResult, onDirtyChange, resetOnSuccess, ref]);

  useEffect(() => {
    if (!warnUnsaved || !dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, warnUnsaved]);

  function markDirty() {
    if (!dirty) { setDirty(true); onDirtyChange?.(true); }
  }

  return (
    <FormCtx.Provider value={{ pending, submitter, state, dirty }}>
      <form
        id={id}
        ref={ref}
        className={className}
        noValidate={false}
        onChange={markDirty}
        onInput={markDirty}
        onSubmit={(e) => {
          e.preventDefault();
          const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const fd = new FormData(e.currentTarget, sub);
          setSubmitter(sub?.value || sub?.name || "submit");
          startTransition(() => dispatch(fd));
        }}
      >
        {children}
        {showMessage && state?.error && <div className="mt-4"><FormMessage state={state} /></div>}
      </form>
    </FormCtx.Provider>
  );
}

/** Submit button aware of ActionForm pending state (spinner only on the clicked button). */
export function Submit({ children, className, name, value, pendingText, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending, submitter } = useActionFormState();
  const mine = pending && (submitter === (value ?? name ?? "submit") || (!value && !name && submitter === "submit"));
  return (
    <button {...rest} name={name} value={value} type="submit" disabled={pending || rest.disabled} className={cn(className || "btn-primary")}>
      {mine && <Loader2 className="h-4 w-4 animate-spin" />}
      {mine && pendingText ? pendingText : children}
    </button>
  );
}

export function DirtyIndicator() {
  const { dirty, pending } = useActionFormState();
  if (pending) return <span className="text-xs text-slate-500">Saving…</span>;
  if (dirty) return <span className="text-xs font-medium text-amber-700">Unsaved changes</span>;
  return null;
}

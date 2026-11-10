"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

/**
 * Button that asks for confirmation in a dialog, then submits `fields` to a
 * server action (destructive owner actions such as removing an event).
 */
export function ConfirmSubmit({ action, fields, children, title, body, confirmLabel = "Remove", className }: {
  action: (fd: FormData) => void | Promise<void>; fields: Record<string, string>; children: React.ReactNode;
  title: string; body?: React.ReactNode; confirmLabel?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn(className ?? "btn-ghost btn-sm text-red-600 hover:bg-red-50")}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Cancel" onClick={() => setOpen(false)} />
          <form action={action} className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-title" className="text-base font-semibold text-navy-900">{title}</h2>
                {body && <div className="mt-1 text-sm text-slate-600">{body}</div>}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button ref={cancelRef} type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <SubmitButton className="btn-danger" pendingText="Removing…">{confirmLabel}</SubmitButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
